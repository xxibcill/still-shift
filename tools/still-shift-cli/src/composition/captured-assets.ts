import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { Composition } from "@still-shift/scene-contract";
import type { CompositionSource } from "@still-shift/animation-engine";
import { CompositionSaveError } from "./save.ts";

export type DraftAsset =
  | { bytes: Buffer; type: string }
  | { source: { path: string; manifestPath?: string } };

export const compositionAssetTypes: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Native originals stay on disk; every preparation verifies their pinned bytes. */
export async function captureCompositionAssets(source: CompositionSource) {
  const assets = new Map<string, DraftAsset>();
  for (const asset of source.composition.assets) {
    const native = source.mediaSourcePaths?.[asset.id];
    if (native) {
      assets.set(asset.id, { source: native });
      continue;
    }
    const path = source.assetPaths[asset.id];
    if (!path)
      throw new CompositionSaveError(
        422,
        "comp-edit-asset",
        `Source asset ${asset.id} was not captured`,
      );
    const bytes = await readFile(path);
    if (
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
      asset.sha256
    )
      throw new CompositionSaveError(
        422,
        "comp-edit-asset-race",
        `Source asset ${asset.id} changed during capture`,
      );
    assets.set(asset.id, {
      bytes,
      type:
        compositionAssetTypes[extname(path).toLowerCase()] ??
        "application/octet-stream",
    });
  }
  return assets;
}

/** Resolve only server-captured media bindings after editableDocument checks them. */
export function capturedMediaComposition(
  document: Composition,
  assets: ReadonlyMap<string, DraftAsset>,
) {
  const composition = structuredClone(document);
  for (const asset of composition.assets) {
    if (
      asset.type !== "video" &&
      asset.type !== "sequence" &&
      asset.type !== "audio"
    )
      continue;
    const captured = assets.get(asset.id);
    if (!captured || !("source" in captured))
      throw new CompositionSaveError(
        422,
        "comp-edit-asset",
        `Native source ${asset.id} was not captured`,
      );
    asset.path = captured.source.path;
    if (asset.type === "sequence") {
      if (!captured.source.manifestPath)
        throw new CompositionSaveError(
          422,
          "comp-edit-asset",
          `Sequence manifest ${asset.id} was not captured`,
        );
      asset.manifestPath = captured.source.manifestPath;
    }
  }
  return composition;
}
