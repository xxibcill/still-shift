import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AnimationEngineError,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
  type CompositionPreparedMedia,
  type CompositionPreparedAudio,
  type CompositionPreparedNative3D,
  type NativeAppearanceCodeIdentity,
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
const hash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

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
  preparedNative3D?: CompositionPreparedNative3D;
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
  } = {},
): Promise<CompositionSource> {
  options.signal?.throwIfAborted();
  const sourcePath = resolve(compositionPath);
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch {
    throw new AnimationEngineError(
      "INPUT_UNREADABLE",
      `Cannot read composition ${sourcePath}`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Composition must be valid JSON",
    );
  }
  const result = validateComposition(value);
  if (!result.ok)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      result.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`)[0] ??
        "Invalid composition",
      { diagnosticsJson: JSON.stringify(result.diagnostics) },
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
    options,
  );
  const assetPaths = await validatePreparedAssets(
    {
      assets: composition.assets.flatMap((a) =>
        a.type === "image" ? [a] : [],
      ),
      fonts: composition.assets.flatMap((a) => (a.type === "font" ? [a] : [])),
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
  return {
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
    sourceChecksum: hash(bytes),
  };
}
