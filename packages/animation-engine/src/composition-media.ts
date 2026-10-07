import { resolve } from "node:path";
import {
  CompositionPreparedMediaSchema,
  type Composition,
  type CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import { compositionMediaFrameDependencies } from "../../renderer-core/src/composition/render/graphs.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { prepareCompositionVisualMedia } from "./composition-media-cache.ts";
import { COMPOSITION_MEDIA_DECODER_VERSION } from "./composition-media-color.ts";
import {
  compositionMediaCacheDirectory,
  compositionMediaMappingIdentity,
} from "./composition-media-cache-storage.ts";

export type CompositionMediaPreparationOptions = {
  cacheDirectory?: string;
  signal?: AbortSignal | undefined;
};
export type CompositionMediaPreparation = {
  preparedMedia: CompositionPreparedMedia;
  assetPaths: Record<string, string>;
  sourceAssetPaths: Record<string, { path: string; manifestPath?: string }>;
};
/** Capture the source originals needed by the complete immutable document. */
export async function prepareCompositionMedia(
  composition: Composition,
  sourceDirectory: string,
  options: CompositionMediaPreparationOptions = {},
): Promise<CompositionMediaPreparation | undefined> {
  options.signal?.throwIfAborted();
  const assets = composition.assets.filter(
    (asset) => asset.type === "video" || asset.type === "sequence",
  );
  if (!assets.length) return undefined;
  const required = new Map<string, Set<number>>();
  const scopes = [composition, ...(composition.precomps ?? [])];
  // Measured text can feed source clocks through expressions/drivers/constraints.
  // Without browser measurement, capture a conservative source set for that case.
  const measuredClocks =
    scopes.some((scope) =>
      scope.layers.some((layer) => layer.type === "text"),
    ) &&
    ((composition.constraints?.length ?? 0) > 0 ||
      (composition.drivers?.length ?? 0) > 0 ||
      Object.keys(composition.expressions ?? {}).length > 0);
  if (
    measuredClocks &&
    assets.reduce((count, asset) => count + asset.frameCount, 0) > 131072
  )
    passageError(
      "comp-media-limit",
      "Conservative measured-clock source set exceeds bounded metadata entries",
      { path: "preparedMedia" },
    );
  let requiredCount = 0;
  if (measuredClocks)
    for (const asset of assets)
      required.set(
        asset.id,
        new Set(
          Array.from({ length: asset.frameCount }, (_, ordinal) => ordinal),
        ),
      );
  else
    for (let frame = 0; frame < composition.frameCount; frame++) {
      options.signal?.throwIfAborted();
      for (const [asset, ordinals] of compositionMediaFrameDependencies(
        composition,
        frame,
        { cull: false },
      )) {
        let originals = required.get(asset);
        if (!originals) required.set(asset, (originals = new Set()));
        for (const ordinal of ordinals)
          if (!originals.has(ordinal)) {
            originals.add(ordinal);
            requiredCount++;
            if (requiredCount > 131072)
              passageError(
                "comp-media-limit",
                "Required source set exceeds bounded metadata entries",
                { path: "preparedMedia" },
              );
          }
      }
    }
  const cacheDirectory = compositionMediaCacheDirectory(options.cacheDirectory);
  const mappingHash = compositionMediaMappingIdentity(composition);
  const prepared: CompositionPreparedMedia = {
    schemaVersion: "composition-prepared-media-1",
    decoderVersion: COMPOSITION_MEDIA_DECODER_VERSION,
    ffmpegIdentities: [],
    frames: [],
  };
  const paths: Record<string, string> = {},
    sourceAssetPaths: CompositionMediaPreparation["sourceAssetPaths"] = {};
  for (const asset of assets) {
    const result = await prepareCompositionVisualMedia({
      asset,
      sourceDirectory,
      cacheDirectory,
      ordinals: [...(required.get(asset.id) ?? [])],
      mappingHash,
      ...(composition.mediaLimits ? { limits: composition.mediaLimits } : {}),
      signal: options.signal,
    });
    sourceAssetPaths[asset.id] = {
      path: resolve(sourceDirectory, asset.path),
      ...(asset.type === "sequence"
        ? { manifestPath: resolve(sourceDirectory, asset.manifestPath) }
        : {}),
    };
    Object.assign(paths, result.assetPaths);
    prepared.ffmpegIdentities.push(result.ffmpegIdentity);
    for (const frame of result.frames)
      prepared.frames.push({
        ...frame,
        asset: asset.id,
        sourceHash: asset.sha256,
      });
    if (prepared.frames.length > 131072)
      passageError(
        "comp-media-limit",
        "Captured media metadata exceeds bounded frame-entry count",
        { path: "preparedMedia" },
      );
  }
  prepared.ffmpegIdentities = [...new Set(prepared.ffmpegIdentities)].sort();
  const parsed = CompositionPreparedMediaSchema.safeParse(prepared);
  if (!parsed.success)
    passageError(
      "comp-media-provenance",
      "Generated media capture violates the shared manifest contract",
      { path: "preparedMedia" },
    );
  return { preparedMedia: parsed.data, assetPaths: paths, sourceAssetPaths };
}
