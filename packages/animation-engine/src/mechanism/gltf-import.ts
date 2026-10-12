import { readGltfContainer, gltfFail } from "./gltf-document.ts";
import { readGltfHierarchy } from "./gltf-hierarchy.ts";
import { preflightGltfMeshes, bakeGltfMeshes } from "./gltf-meshes.ts";
import { readGltfMaterials } from "./gltf-materials.ts";
import {
  readGltfResources,
  gltfBytesHash,
  externalGltfUris,
} from "./gltf-resources.ts";
import { freezeGltfAsset, gltfJsonHash } from "./gltf-identity.ts";
import type { ImportedRigidGltf } from "./gltf-types.ts";
export interface DecodeRigidGltfOptions {
  format: "gltf" | "glb";
  dependencies?: ReadonlyMap<string, Uint8Array>;
  scene?: number;
}
/** Encoded images and PBR roles are preserved; this IR is not a native rendering admission. */
export function decodeRigidGltf(
  bytes: Uint8Array,
  options: DecodeRigidGltfOptions,
): ImportedRigidGltf {
  const container = readGltfContainer(bytes, options.format);
  const hierarchy = readGltfHierarchy(container.document, options.scene);
  preflightGltfMeshes(container.document, hierarchy);
  const materials = readGltfMaterials(container.document);
  const supplied = options.dependencies ?? new Map<string, Uint8Array>();
  const required = externalGltfUris(container.document);
  for (const uri of supplied.keys())
    if (!required.has(uri))
      gltfFail("dependency", "Unreferenced dependency supplied", [
        "dependencies",
        uri,
      ]);
  const resources = readGltfResources(container, supplied);
  const geometry = bakeGltfMeshes(
    container.document,
    resources.buffers,
    hierarchy,
  );
  const asset = {
    version: "rigid-gltf-asset-1" as const,
    coordinateSystem: "right-handed-y-up" as const,
    units: "meter" as const,
    selectedScene: hierarchy.selectedScene,
    sourceSha256: gltfBytesHash(bytes),
    dependencies: resources.dependencies,
    ...geometry,
    materials,
    images: resources.images,
    geometrySha256: gltfJsonHash({
      parts: geometry.parts,
      meshes: geometry.meshes,
    }),
    policy: {
      geometry: "world-affine-baked-about-retained-node-origins-1" as const,
      pixels: "encoded-images-not-yet-decoded-or-native-admitted-1" as const,
      omittedNodes: hierarchy.omittedNodes,
    },
  };
  return freezeGltfAsset({ ...asset, assetSha256: gltfJsonHash(asset) });
}
