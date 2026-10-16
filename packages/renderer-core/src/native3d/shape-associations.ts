import { NativeShapeAssociationSchema } from "@still-shift/scene-contract";
import type {
  MechanismMaterial,
  Native3DSourceV2,
  NativeShapeAssociation,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { hashNativeData } from "./canonical-hash.ts";

/** Sealed untextured material inputs; actual Three fields must independently reconstruct this. */
export function nativeShapeMaterialDocument(
  material: DeepReadonly<MechanismMaterial>,
) {
  return {
    version: "native3d-untextured-shape-material-1" as const,
    id: material.id,
    color: material.color.toLowerCase(),
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    alphaTest: material.alphaMode === "mask" ? material.alphaCutoff : 0,
    side: material.side,
    emissive: material.emissive.toLowerCase(),
    emissiveIntensity: material.emissiveIntensity,
  };
}

export async function prepareNativeShapeAssociations(
  source: DeepReadonly<Native3DSourceV2>,
): Promise<Readonly<Record<string, DeepReadonly<NativeShapeAssociation>>>> {
  const associations: Record<string, NativeShapeAssociation> =
    Object.create(null);
  for (const shape of source.teachingShapes) {
    const mesh = source.geometry.meshes.find((mesh) => mesh.id === shape.mesh)!;
    const groups = mesh.groups?.length
      ? mesh.groups
      : [
          {
            start: 0,
            count: mesh.indices.length,
            materialIndex: source.geometry.materials.findIndex(
              (material) => material.id === mesh.materialId,
            ),
          },
        ];
    const sealedGroups = [];
    for (const [groupIndex, group] of groups.entries()) {
      const material = source.geometry.materials[group.materialIndex]!;
      if (material.texture !== undefined)
        throw Error(
          "comp-native3d-material: changing teaching meshes require the untextured draw profile",
        );
      sealedGroups.push({
        groupIndex,
        start: group.start,
        count: group.count,
        materialId: material.id,
        materialSha256: await hashNativeData(
          nativeShapeMaterialDocument(material),
        ),
      });
    }
    associations[shape.id] = NativeShapeAssociationSchema.parse({
      shape: shape.id,
      mesh: shape.mesh,
      ownerPart: shape.ownerPart,
      generator: shape.generator,
      ...(shape.generator === "fixed-root-pawl-curve-1" &&
      shape.parameters.trigger
        ? { triggerLandmark: true as const }
        : {}),
      declarationSha256: await hashNativeData(shape),
      topologySha256: shape.topologySha256,
      templateSha256: await hashNativeData({
        version: "native3d-teaching-template-1",
        generator: shape.generator,
        parameters: shape.parameters,
        vertices: mesh.positions.length / 3,
        indices: mesh.indices,
        uvs: mesh.uvs ?? null,
        landmarks: shape.landmarks,
      }),
      templateMeshDataSha256: await hashNativeData(mesh),
      vertexCount: mesh.positions.length / 3,
      indexCount: mesh.indices.length,
      groups: sealedGroups,
    });
  }
  return associations;
}
