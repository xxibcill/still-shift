import { createHash } from "node:crypto";
import { readNativeSourceBytes } from "./native-source-read.ts";
import { dirname, resolve } from "node:path";
import { verifyNativePbrSourceResources } from "./mechanism/native-pbr-files.ts";
import { gltfJsonHash } from "./mechanism/gltf-identity.ts";
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
  const transportVersion = assets.some(
    (asset) => asset.format === "mechanism-scene-3",
  )
    ? "composition-prepared-native3d-3"
    : assets.some((asset) => asset.format === "mechanism-scene-2")
      ? "composition-prepared-native3d-2"
      : "composition-prepared-native3d-1";
  const entries: Record<string, unknown> = Object.create(null);
  const assetPaths: Record<string, string> = Object.create(null);
  for (const asset of assets) {
    options.signal?.throwIfAborted();
    const path = resolve(sourceDirectory, asset.path);
    const bytes = await readNativeSourceBytes(
      path,
      `assets.${asset.id}`,
      options.signal,
    );
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
    if (source.schemaVersion === "mechanism-scene-3") {
      const verified = await verifyNativePbrSourceResources(
        source,
        dirname(path),
        {
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      const binaryResources = source.resources.map((reference) => {
        const route = `native-pbr/${gltfJsonHash({ asset: asset.id, image: reference.image, sha256: reference.sha256 }).slice(7)}`;
        assetPaths[route] = verified.paths[reference.image]!;
        return {
          image: reference.image,
          asset: route,
          bytes: reference.bytes,
          sha256: reference.sha256,
        };
      });
      entries[asset.id] = { sourceSha256, source, binaryResources };
    } else
      entries[asset.id] = {
        sourceSha256,
        source,
        ...(transportVersion === "composition-prepared-native3d-3"
          ? { binaryResources: [] }
          : {}),
      };
    assetPaths[asset.id] = path;
  }
  options.signal?.throwIfAborted();
  const preparedNative3D = CompositionPreparedNative3DVersionsSchema.parse({
    version: transportVersion,
    assets: entries,
  });
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
