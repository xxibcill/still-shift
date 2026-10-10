import { z } from "zod";
import {
  MechanismMaterialSchema,
  MechanismMeshSchema,
} from "../mechanism/geometry.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  mechanismIssue,
} from "../mechanism/primitives.ts";

/** Indexed catalogue without mechanism-specific dimensions or rig invariants. */
export const SolidGeometrySchema = z
  .object({
    schemaVersion: z.literal("solid-geometry-1"),
    meshes: z.array(MechanismMeshSchema).min(1).max(MECHANISM_LIMITS.parts),
    materials: z
      .array(MechanismMaterialSchema)
      .min(1)
      .max(MECHANISM_LIMITS.materials),
  })
  .strict()
  .superRefine((geometry, context) => {
    checkUniqueIds(geometry.meshes, context, ["meshes"]);
    checkUniqueIds(geometry.materials, context, ["materials"]);
    if (
      geometry.meshes.reduce((n, mesh) => n + mesh.positions.length / 3, 0) >
        MECHANISM_LIMITS.vertices ||
      geometry.meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0) >
        MECHANISM_LIMITS.triangles
    )
      mechanismIssue(
        context,
        "comp-native3d-limit",
        "Aggregate geometry exceeds the vertex or triangle budget",
        ["meshes"],
      );
    const materials = new Set(
      geometry.materials.map((material) => material.id),
    );
    geometry.meshes.forEach((mesh, index) => {
      if (!materials.has(mesh.materialId))
        mechanismIssue(
          context,
          "comp-native3d-material",
          `Unknown material ${mesh.materialId}`,
          ["meshes", index, "materialId"],
        );
      mesh.groups?.forEach((group, groupIndex) => {
        if (group.materialIndex >= geometry.materials.length)
          mechanismIssue(
            context,
            "comp-native3d-material",
            "Material group index is outside the catalogue",
            ["meshes", index, "groups", groupIndex, "materialIndex"],
          );
      });
    });
  });
export type SolidGeometry = z.infer<typeof SolidGeometrySchema>;
export type SolidGeometryInput = z.input<typeof SolidGeometrySchema>;
