import { imageSize } from "image-size";
import { preflightNativePbrResources } from "@still-shift/renderer-core";
import {
  SolidGeometryV2Schema,
  NATIVE_PBR_LIMITS,
} from "@still-shift/scene-contract";
import type { SolidGeometryV2 } from "@still-shift/scene-contract";
import type { ImportedRigidGltf } from "./gltf-types.ts";
import { gltfFail, RIGID_GLTF_LIMITS } from "./gltf-document.ts";
import { gltfJsonHash, freezeGltfAsset } from "./gltf-identity.ts";
import { gltfBytesHash } from "./gltf-resources.ts";
import { staticGltfPng } from "./gltf-png.ts";
import {
  decodeGltfRgba,
  assertGltfRgbaDecoder,
  GLTF_RGBA_DECODER_PROFILE,
} from "./gltf-pixels.ts";
export interface NativePbrPixelInput {
  image: string;
  rgba: Uint8Array;
}
export interface PreparedRigidGltfPbr {
  version: "prepared-rigid-gltf-pbr-1";
  assetSha256: string;
  sourceSha256: string;
  geometrySha256: string;
  decoder: typeof GLTF_RGBA_DECODER_PROFILE;
  geometry: SolidGeometryV2;
  parts: ImportedRigidGltf["parts"];
  nodes: ImportedRigidGltf["nodes"];
  images: NativePbrPixelInput[];
}
export async function prepareRigidGltfPbr(
  asset: ImportedRigidGltf,
  options: { signal?: AbortSignal } = {},
): Promise<PreparedRigidGltfPbr> {
  options.signal?.throwIfAborted();
  const { assetSha256, ...data } = asset;
  if (
    asset.version !== "rigid-gltf-asset-1" ||
    gltfJsonHash(data) !== assetSha256
  )
    gltfFail("checksum", "Imported asset identity is stale", ["assetSha256"]);
  if (asset.images.length > NATIVE_PBR_LIMITS.images)
    gltfFail("budget", "Too many PBR images before decode", ["images"]);
  let pixels = 0,
    encodedBytes = 0;
  for (const [index, image] of asset.images.entries()) {
    pixels += image.width * image.height;
    encodedBytes += image.bytes;
    if (
      !Number.isSafeInteger(image.bytes) ||
      image.bytes < 1 ||
      image.bytes > RIGID_GLTF_LIMITS.imageBytes ||
      encodedBytes > RIGID_GLTF_LIMITS.encodedImageBytes ||
      !["image/png", "image/jpeg"].includes(image.mimeType) ||
      !Number.isSafeInteger(image.width) ||
      !Number.isSafeInteger(image.height) ||
      image.width < 1 ||
      image.height < 1 ||
      image.width > 4096 ||
      image.height > 4096 ||
      pixels > NATIVE_PBR_LIMITS.pixels ||
      image.encodedBase64.length >
        Math.ceil(RIGID_GLTF_LIMITS.imageBytes / 3) * 4
    )
      gltfFail("budget", "PBR image bounds exceed admission before decode", [
        "images",
        index,
      ]);
  }
  const geometry = SolidGeometryV2Schema.parse({
    schemaVersion: "solid-geometry-2",
    images: asset.images.map((image) => ({
      id: image.id,
      sourceSha256: image.sha256,
      pixelSha256: image.sha256,
      width: image.width,
      height: image.height,
      encoding: "rgba8-straight-top-left-1",
    })),
    materials: asset.materials.map(({ name: _name, ...material }) => ({
      ...material,
      schemaVersion: "native-pbr-material-1",
    })),
    meshes: asset.meshes.map(
      ({
        sourceNode: _node,
        sourceMesh: _mesh,
        sourcePrimitive: _primitive,
        dataSha256: _hash,
        ...mesh
      }) => mesh,
    ),
  });
  try {
    preflightNativePbrResources(geometry);
  } catch {
    gltfFail("budget", "PBR resource payload exceeds 64 MiB before decode", [
      "images",
    ]);
  }
  const images: NativePbrPixelInput[] = [];
  if (asset.images.length) await assertGltfRgbaDecoder(options.signal);
  for (const [index, image] of asset.images.entries()) {
    options.signal?.throwIfAborted();
    const path = ["images", index],
      bytes = Buffer.from(image.encodedBase64, "base64");
    if (
      bytes.length !== image.bytes ||
      gltfBytesHash(bytes) !== image.sha256 ||
      bytes.toString("base64") !== image.encodedBase64
    )
      gltfFail("checksum", "Encoded image identity is stale", path);
    let header: ReturnType<typeof imageSize>;
    try {
      header = imageSize(bytes);
    } catch {
      gltfFail("image", "Encoded image header is invalid", path);
    }
    if (
      header.width !== image.width ||
      header.height !== image.height ||
      (header.type === "png"
        ? "image/png"
        : header.type === "jpg"
          ? "image/jpeg"
          : undefined) !== image.mimeType
    )
      gltfFail(
        "image",
        "Encoded image header differs from its dimension/MIME manifest",
        path,
      );
    const encoded =
      image.mimeType === "image/png" ? staticGltfPng(bytes, path) : bytes;
    const rgba = await decodeGltfRgba(
      encoded,
      image.width * image.height * 4,
      path,
      options.signal,
    );
    geometry.images[index]!.pixelSha256 = gltfBytesHash(rgba);
    images.push({ image: image.id, rgba });
  }
  return Object.freeze({
    version: "prepared-rigid-gltf-pbr-1",
    assetSha256,
    sourceSha256: asset.sourceSha256,
    geometrySha256: gltfJsonHash(geometry),
    decoder: GLTF_RGBA_DECODER_PROFILE,
    geometry: freezeGltfAsset(geometry),
    parts: freezeGltfAsset(structuredClone(asset.parts)),
    nodes: freezeGltfAsset(structuredClone(asset.nodes)),
    images,
  });
}
