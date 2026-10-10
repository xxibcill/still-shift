import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CompositionPreparedNative3DVersionsSchema,
  Native3DSourceVersionsSchema,
  type Composition,
  type CompositionPreparedNative3DVersions,
  type NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import { prepareCompositionNative3DVersions as prepareNativeCatalogue } from "../../renderer-core/src/native3d/prepare.ts";
import type { PreparedNative3DSceneVersions } from "../../renderer-core/src/native3d/types-v2.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  loadNativeAppearanceCodeIdentity,
  hashNativeAppearanceCodeIdentity,
} from "./native3d-appearance-identity.ts";

export type CompositionNative3DPreparation = {
  preparedNative3D: CompositionPreparedNative3DVersions;
  native3D: Readonly<Record<string, PreparedNative3DSceneVersions>>;
  assetPaths: Record<string, string>;
  nativeAppearanceCodeIdentity: NativeAppearanceCodeIdentity;
  nativeAppearanceCodeSha256: string;
};

/** Verify original bytes once, then prepare every authored static variant before publication. */
export async function prepareCompositionNative3D(
  composition: Composition,
  sourceDirectory: string,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<CompositionNative3DPreparation | undefined> {
  const assets = composition.assets.filter(
    (asset) => asset.type === "native3d",
  );
  if (!assets.length) return undefined;
  const transport: CompositionPreparedNative3DVersions = {
    version: assets.some((asset) => asset.format === "mechanism-scene-2")
      ? "composition-prepared-native3d-2"
      : "composition-prepared-native3d-1",
    assets: Object.create(null),
  };
  const assetPaths: Record<string, string> = Object.create(null);
  for (const asset of assets) {
    options.signal?.throwIfAborted();
    const path = resolve(sourceDirectory, asset.path);
    if ((await stat(path)).size > 32 * 1024 ** 2)
      passageError("comp-native3d-limit", "Native source exceeds 32 MiB", {
        path: `assets.${asset.id}`,
      });
    const bytes = await readFile(path);
    if (bytes.length > 32 * 1024 ** 2)
      passageError("comp-native3d-limit", "Native source exceeds 32 MiB", {
        path: `assets.${asset.id}`,
      });
    const sourceSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (sourceSha256 !== asset.sha256)
      passageError(
        "comp-native3d-checksum",
        "Native source bytes differ from the authored checksum",
        { path: `assets.${asset.id}.sha256` },
      );
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      passageError("comp-native3d-source", "Native source must be valid JSON", {
        path: `assets.${asset.id}`,
      });
    }
    const parsed = Native3DSourceVersionsSchema.safeParse(value);
    if (!parsed.success || parsed.data.schemaVersion !== asset.format)
      passageError(
        "comp-native3d-source",
        "Native source does not match its declared format",
        { path: `assets.${asset.id}.format` },
      );
    const source = parsed.data;
    if (transport.version === "composition-prepared-native3d-1") {
      if (source.schemaVersion === "mechanism-scene-2")
        passageError(
          "comp-native3d-protocol",
          "Version 2 source requires version 2 transport",
          { path: `assets.${asset.id}.format` },
        );
      transport.assets[asset.id] = { sourceSha256, source };
    } else transport.assets[asset.id] = { sourceSha256, source };
    assetPaths[asset.id] = path;
  }
  options.signal?.throwIfAborted();
  const preparedNative3D =
    CompositionPreparedNative3DVersionsSchema.parse(transport);
  const native3D = await prepareNativeCatalogue(composition, preparedNative3D);
  const nativeAppearanceCodeIdentity = await loadNativeAppearanceCodeIdentity();
  return {
    preparedNative3D,
    native3D,
    assetPaths,
    nativeAppearanceCodeIdentity,
    nativeAppearanceCodeSha256: hashNativeAppearanceCodeIdentity(
      nativeAppearanceCodeIdentity,
    ),
  };
}
