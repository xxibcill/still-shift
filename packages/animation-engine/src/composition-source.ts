import { readCompositionDocument } from "./composition-document-read.ts";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { dirname, resolve } from "node:path";
import type {
  Composition,
  CompositionDiagnostic,
  CompositionPreparedMedia,
  CompositionPreparedAudio,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  prepareCompositionMedia,
  type CompositionMediaPreparationOptions,
  type CompositionMediaPreparation,
} from "./composition-media.ts";
import { validatePreparedAssets } from "./prepared-animation-engine.ts";
import { prepareCompositionAudio } from "./composition-audio-mix.ts";
import {
  prepareCompositionNative3D,
  type CompositionNative3DPreparation,
} from "./composition-native3d.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
/** Text layers drawn with a generic browser face: root ids or `precomp-id/layer-id`. */
function systemFontLayers(composition: Composition): string[] {
  const fonts = new Set(
    composition.assets.flatMap((a) => (a.type === "font" ? [a.id] : [])),
  );
  return [composition, ...(composition.precomps ?? [])].flatMap((scope) =>
    scope.layers.flatMap((layer) => {
      if (layer.type === "provider" && layer.usesSystemFonts)
        return [scope === composition ? layer.id : `${scope.id}/${layer.id}`];
      if (layer.type !== "text") return [];
      const style = layer.style
        ? composition.textStyles?.[layer.style]
        : undefined;
      if (fonts.has(style?.fontAsset ?? layer.fontAsset ?? "")) return [];
      return [scope === composition ? layer.id : `${scope.id}/${layer.id}`];
    }),
  );
}

export type CompositionSource = {
  composition: Composition;
  /** Validation warnings, such as `comp-text-system-font`. */
  warnings: CompositionDiagnostic[];
  /** Text layers whose output depends on the machine's generic fonts. */
  systemFontLayers: string[];
  /** Absolute still/font, captured native PNG and verified mix WAV paths, by resource id. */
  assetPaths: Record<string, string>;
  preparedMedia?: CompositionPreparedMedia;
  preparedAudio?: CompositionPreparedAudio;
  preparedNative3D?: CompositionPreparedNative3DVersions;
  native3D?: CompositionNative3DPreparation["native3D"];
  nativeAppearanceCodeIdentity?: NativeAppearanceCodeIdentity;
  nativeAppearanceCodeSha256?: string;
  mediaSourcePaths?: CompositionMediaPreparation["sourceAssetPaths"];
  sourcePath: string;
  sourceChecksum: string;
};

/** Read, validate and resolve a `composition-1` file and its pinned assets. */
export async function readCompositionSource(
  compositionPath: string,
  options: CompositionMediaPreparationOptions & {
    backend?: "canvas2d" | "webgl2";
    nodeMemory?: CompositionNodeMemory;
  } = {},
): Promise<CompositionSource> {
  options.signal?.throwIfAborted();
  const sourcePath = resolve(compositionPath);
  if (
    options.nodeMemory !== undefined &&
    !(options.nodeMemory instanceof CompositionNodeMemory)
  )
    throw Error("Invalid composition Node memory owner");
  const owner = new CompositionNodeMemory(options.nodeMemory);
  try {
    const { result, checksum } = await readCompositionDocument(
      sourcePath,
      owner,
      options.signal,
    );
    const composition = result.composition;
    if (
      options.backend === "canvas2d" &&
      composition.assets.some((asset) => asset.type === "native3d")
    )
      passageError(
        "comp-native3d-backend",
        "Native composition requires WebGL2",
        { path: "backend" },
      );
    const native = await prepareCompositionNative3D(
      composition,
      dirname(sourcePath),
      { ...options, nodeMemory: owner },
    );
    const assetPaths = await validatePreparedAssets(
      {
        assets: composition.assets.flatMap((a) =>
          a.type === "image" ? [a] : [],
        ),
        fonts: composition.assets.flatMap((a) =>
          a.type === "font" ? [a] : [],
        ),
      },
      dirname(sourcePath),
    );
    const media = await prepareCompositionMedia(
      composition,
      dirname(sourcePath),
      options,
    );
    const audio = await prepareCompositionAudio(
      composition,
      dirname(sourcePath),
      options,
    );
    const source = {
      composition,
      warnings: result.diagnostics,
      systemFontLayers: systemFontLayers(composition),
      assetPaths: {
        ...assetPaths,
        ...native?.assetPaths,
        ...media?.assetPaths,
        ...audio?.assetPaths,
      },
      ...(native
        ? {
            preparedNative3D: native.preparedNative3D,
            native3D: native.native3D,
            nativeAppearanceCodeIdentity: native.nativeAppearanceCodeIdentity,
            nativeAppearanceCodeSha256: native.nativeAppearanceCodeSha256,
          }
        : {}),
      ...(media
        ? {
            preparedMedia: media.preparedMedia,
          }
        : {}),
      ...(audio ? { preparedAudio: audio.preparedAudio } : {}),
      ...(media || audio
        ? {
            mediaSourcePaths: {
              ...media?.sourceAssetPaths,
              ...audio?.sourceAssetPaths,
            },
          }
        : {}),
      sourcePath,
      sourceChecksum: checksum,
    };
    owner.transfer();
    return source;
  } finally {
    owner.dispose();
  }
}
