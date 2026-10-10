import { z } from "zod";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismNumberSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";

const unit = z.number().finite().min(0).max(1);
export const MechanismMaterialSchema = z
  .object({
    id: MechanismIdSchema,
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    roughness: unit,
    metalness: unit,
    opacity: unit.default(1),
    alphaMode: z.enum(["opaque", "mask"]).default("opaque"),
    alphaCutoff: unit.default(0.5),
    side: z.enum(["front", "double"]).default("front"),
    emissive: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#000000"),
    emissiveIntensity: z.number().finite().min(0).max(10).default(0),
    texture: z
      .object({
        kind: z.enum(["tape-graduations", "wood-grain"]),
        seed: z.number().int().min(0).max(2_147_483_647).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (material) => material.alphaMode !== "opaque" || material.opacity === 1,
    { message: "Opaque materials require opacity 1" },
  );

export const MechanismMeshSchema = z
  .object({
    id: MechanismIdSchema,
    partId: MechanismIdSchema,
    materialId: MechanismIdSchema,
    positions: z
      .array(MechanismNumberSchema)
      .min(9)
      .max(MECHANISM_LIMITS.vertices * 3),
    normals: z
      .array(z.number().finite().min(-1).max(1))
      .min(9)
      .max(MECHANISM_LIMITS.vertices * 3),
    uvs: z
      .array(z.number().finite().min(-1_000_000).max(1_000_000))
      .max(MECHANISM_LIMITS.vertices * 2)
      .optional(),
    indices: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MECHANISM_LIMITS.vertices - 1),
      )
      .min(3)
      .max(MECHANISM_LIMITS.triangles * 3),
    groups: z
      .array(
        z
          .object({
            start: z.number().int().min(0),
            count: z.number().int().positive(),
            materialIndex: z
              .number()
              .int()
              .min(0)
              .max(MECHANISM_LIMITS.materials - 1),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    bounds: z
      .object({ min: MechanismVectorSchema, max: MechanismVectorSchema })
      .strict(),
  })
  .strict()
  .superRefine(validateMesh);

function validateMesh(mesh: MeshAttributes, context: z.RefinementCtx) {
  const vertices = mesh.positions.length / 3;
  if (
    !Number.isInteger(vertices) ||
    mesh.normals.length !== mesh.positions.length ||
    (mesh.uvs && mesh.uvs.length !== vertices * 2)
  )
    mechanismIssue(
      context,
      "mechanism-geometry-layout",
      "Position, normal and UV attributes must have complete matching vertices",
    );
  if (
    mesh.indices.length % 3 !== 0 ||
    mesh.indices.some((index) => index >= vertices)
  )
    mechanismIssue(
      context,
      "mechanism-geometry-topology",
      "Indices must contain complete triangles within the vertex count",
      ["indices"],
    );
  checkBounds(mesh, context);
  checkNormals(mesh, context);
  checkTriangles(mesh, context);
  checkGroups(mesh, context);
}
interface MeshAttributes {
  positions: number[];
  normals: number[];
  uvs?: number[] | undefined;
  indices: number[];
  groups?:
    | { start: number; count: number; materialIndex: number }[]
    | undefined;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}
function checkBounds(mesh: MeshAttributes, context: z.RefinementCtx) {
  for (let axis = 0; axis < 3; axis++) {
    let low = Infinity,
      high = -Infinity;
    for (let offset = axis; offset < mesh.positions.length; offset += 3) {
      low = Math.min(low, mesh.positions[offset]!);
      high = Math.max(high, mesh.positions[offset]!);
    }
    if (mesh.bounds.min[axis] !== low || mesh.bounds.max[axis] !== high)
      mechanismIssue(
        context,
        "mechanism-geometry-bounds",
        "Bounds must equal the actual local vertex bounds",
        ["bounds", axis],
      );
  }
}
function checkNormals(mesh: MeshAttributes, context: z.RefinementCtx) {
  for (let offset = 0; offset + 2 < mesh.normals.length; offset += 3) {
    const length = Math.hypot(
      mesh.normals[offset]!,
      mesh.normals[offset + 1]!,
      mesh.normals[offset + 2]!,
    );
    if (Math.abs(length - 1) > 0.001) {
      mechanismIssue(
        context,
        "mechanism-geometry-normal",
        "Normals must be normalized",
        ["normals", offset],
      );
      break;
    }
  }
}
function checkTriangles(mesh: MeshAttributes, context: z.RefinementCtx) {
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const [a, b, c] = mesh.indices
      .slice(offset, offset + 3)
      .map((index) => index * 3);
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      c + 2 >= mesh.positions.length ||
      b + 2 >= mesh.positions.length ||
      a + 2 >= mesh.positions.length
    )
      continue;
    const ab = [0, 1, 2].map(
      (axis) => mesh.positions[b + axis]! - mesh.positions[a + axis]!,
    );
    const ac = [0, 1, 2].map(
      (axis) => mesh.positions[c + axis]! - mesh.positions[a + axis]!,
    );
    if (
      ab[1]! * ac[2]! - ab[2]! * ac[1]! === 0 &&
      ab[2]! * ac[0]! - ab[0]! * ac[2]! === 0 &&
      ab[0]! * ac[1]! - ab[1]! * ac[0]! === 0
    ) {
      mechanismIssue(
        context,
        "mechanism-geometry-topology",
        "Degenerate triangles are unsupported",
        ["indices", offset],
      );
      break;
    }
  }
}
function checkGroups(mesh: MeshAttributes, context: z.RefinementCtx) {
  let end = 0;
  for (const [index, group] of (mesh.groups ?? []).entries()) {
    if (
      group.start !== end ||
      group.start % 3 ||
      group.count % 3 ||
      group.start + group.count > mesh.indices.length
    )
      mechanismIssue(
        context,
        "mechanism-geometry-groups",
        "Material groups must partition complete triangles in index order",
        ["groups", index],
      );
    end = group.start + group.count;
  }
  if (mesh.groups?.length && end !== mesh.indices.length)
    mechanismIssue(
      context,
      "mechanism-geometry-groups",
      "Material groups must cover every triangle",
      ["groups"],
    );
}

const dimensionValue = z.union([
  MechanismNumberSchema,
  z.array(MechanismNumberSchema).max(512),
  z.array(MechanismVectorSchema).max(128),
]);
export const MechanismGeometrySchema = z
  .object({
    schemaVersion: z.literal("mechanism-geometry-1"),
    meshes: z.array(MechanismMeshSchema).min(1).max(MECHANISM_LIMITS.parts),
    materials: z
      .array(MechanismMaterialSchema)
      .min(1)
      .max(MECHANISM_LIMITS.materials),
    dimensions: z
      .object({
        hookThickness: z.number().finite().positive().max(1000),
        hookTravel: z.number().finite().positive().max(1000),
        bladeLength: z.number().finite().positive().max(10000),
        bladeWidth: z.number().finite().positive().max(10000),
      })
      .catchall(dimensionValue),
  })
  .strict()
  .superRefine((geometry, context) => {
    checkUniqueIds(geometry.meshes, context, ["meshes"]);
    checkUniqueIds(geometry.materials, context, ["materials"]);
    if (
      geometry.meshes.reduce(
        (total, mesh) => total + mesh.positions.length / 3,
        0,
      ) > MECHANISM_LIMITS.vertices ||
      geometry.meshes.reduce(
        (total, mesh) => total + mesh.indices.length / 3,
        0,
      ) > MECHANISM_LIMITS.triangles
    )
      mechanismIssue(
        context,
        "mechanism-resource-limit",
        "Aggregate geometry exceeds the vertex or triangle budget",
        ["meshes"],
      );
    if (geometry.dimensions.hookThickness !== geometry.dimensions.hookTravel)
      mechanismIssue(
        context,
        "mechanism-travel-thickness",
        "Tape hook travel must derive from hook thickness",
        ["dimensions", "hookTravel"],
      );
    const materials = new Set(
      geometry.materials.map((material) => material.id),
    );
    geometry.meshes.forEach((mesh, index) => {
      if (!materials.has(mesh.materialId))
        mechanismIssue(
          context,
          "mechanism-material-reference",
          `Unknown material ${mesh.materialId}`,
          ["meshes", index, "materialId"],
        );
      if (
        mesh.groups?.some(
          (group) => group.materialIndex >= geometry.materials.length,
        )
      )
        mechanismIssue(
          context,
          "mechanism-material-reference",
          "Material group index is outside the catalog",
          ["meshes", index, "groups"],
        );
    });
  });
export type MechanismGeometry = z.infer<typeof MechanismGeometrySchema>;
export type MechanismGeometryInput = z.input<typeof MechanismGeometrySchema>;
export type MechanismMesh = z.infer<typeof MechanismMeshSchema>;
export type MechanismMaterial = z.infer<typeof MechanismMaterialSchema>;
