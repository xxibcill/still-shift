import { gltfFail, RIGID_GLTF_LIMITS } from "./gltf-document.ts";
import { freezeGltfAsset } from "./gltf-identity.ts";
import type { ImportedRigidGltf } from "./gltf-types.ts";
/** A bounded metadata receipt without vertex/index arrays or encoded image payloads. */
export function inspectRigidGltf(asset: ImportedRigidGltf) {
  const receipt = {
    version: "rigid-gltf-metadata-1" as const,
    assetSha256: asset.assetSha256,
    sourceSha256: asset.sourceSha256,
    geometrySha256: asset.geometrySha256,
    selectedScene: asset.selectedScene,
    coordinateSystem: asset.coordinateSystem,
    units: asset.units,
    policy: asset.policy,
    dependencies: asset.dependencies,
    parts: asset.parts.map((part) => ({
      id: part.id,
      ...(part.parent ? { parent: part.parent } : {}),
      transform: part.transform,
    })),
    nodes: asset.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      sourceNode: node.sourceNode,
      pivotWorld: node.pivotWorld,
    })),
    meshes: asset.meshes.map((mesh) => ({
      id: mesh.id,
      partId: mesh.partId,
      materialId: mesh.materialId,
      vertices: mesh.positions.length / 3,
      triangles: mesh.indices.length / 3,
      bounds: mesh.bounds,
      normals: true,
      uvs: mesh.uvs !== undefined,
      tangents: mesh.tangents !== undefined,
      dataSha256: mesh.dataSha256,
    })),
    materials: asset.materials,
    images: asset.images.map(({ encodedBase64: _payload, ...image }) => image),
  };
  if (
    Buffer.byteLength(JSON.stringify(receipt), "utf8") >
    RIGID_GLTF_LIMITS.metadataBytes
  )
    gltfFail(
      "budget",
      "Metadata receipt exceeds 32 KiB; inspect the complete asset instead",
      ["metadata"],
    );
  return freezeGltfAsset(receipt);
}
