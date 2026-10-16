import { z } from "zod";
import { MechanismMeshSchema } from "../mechanism/geometry.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismHashSchema,
  mechanismIssue,
} from "../mechanism/primitives.ts";
export const NATIVE_PBR_LIMITS = Object.freeze({
  resourceBytes: 64 * 1024 ** 2,
  images: 16,
  pixels: 8_388_608,
  imageAxis: 4096,
  attributeBytes: 16 * 1024 ** 2,
  rgbaBytes: 32 * 1024 ** 2,
  textureBindings: 96,
});
const unit = z.number().finite().min(0).max(1);
export const NativePbrSamplerSchema = z
  .object({
    magFilter: z.union([z.literal(9728), z.literal(9729)]),
    minFilter: z.union([
      z.literal(9728),
      z.literal(9729),
      z.literal(9984),
      z.literal(9985),
      z.literal(9986),
      z.literal(9987),
    ]),
    wrapS: z.union([z.literal(33071), z.literal(33648), z.literal(10497)]),
    wrapT: z.union([z.literal(33071), z.literal(33648), z.literal(10497)]),
  })
  .strict();
const binding = z
  .object({
    image: MechanismIdSchema,
    texCoord: z.literal(0),
    sampler: NativePbrSamplerSchema,
  })
  .strict();
export const NativePbrMaterialSchema = z
  .object({
    schemaVersion: z.literal("native-pbr-material-1"),
    id: MechanismIdSchema,
    baseColorFactor: z.tuple([unit, unit, unit, unit]),
    metallicFactor: unit,
    roughnessFactor: unit,
    alphaMode: z.literal("OPAQUE"),
    doubleSided: z.boolean(),
    baseColorTexture: binding
      .extend({ colorSpace: z.literal("srgb") })
      .optional(),
    metallicRoughnessTexture: binding
      .extend({
        colorSpace: z.literal("linear"),
        roughnessChannel: z.literal("g"),
        metalnessChannel: z.literal("b"),
      })
      .optional(),
    normalTexture: binding
      .extend({
        colorSpace: z.literal("linear"),
        scale: z.number().finite().min(-16).max(16),
      })
      .optional(),
  })
  .strict();
export const NativePbrImageSchema = z
  .object({
    id: MechanismIdSchema,
    sourceSha256: MechanismHashSchema,
    pixelSha256: MechanismHashSchema,
    width: z.number().int().min(1).max(NATIVE_PBR_LIMITS.imageAxis),
    height: z.number().int().min(1).max(NATIVE_PBR_LIMITS.imageAxis),
    encoding: z.literal("rgba8-straight-top-left-1"),
  })
  .strict();
export const NativePbrMeshSchema = MechanismMeshSchema.safeExtend({
  tangents: z
    .array(z.number().finite().min(-1).max(1))
    .min(12)
    .max(MECHANISM_LIMITS.vertices * 4)
    .optional(),
}).superRefine((mesh, context) => {
  if (!mesh.tangents) return;
  if (mesh.tangents.length !== (mesh.positions.length / 3) * 4) {
    mechanismIssue(
      context,
      "comp-native3d-tangent",
      "Tangents need four components per vertex",
      ["tangents"],
    );
    return;
  }
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
    const tangent = mesh.tangents.slice(vertex * 4, vertex * 4 + 3),
      normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3);
    if (
      Math.abs(Math.hypot(...tangent) - 1) > 0.001 ||
      Math.abs(
        tangent.reduce((sum, value, axis) => sum + value * normal[axis]!, 0),
      ) > 0.001 ||
      Math.abs(mesh.tangents[vertex * 4 + 3]!) !== 1
    ) {
      mechanismIssue(
        context,
        "comp-native3d-tangent",
        "Tangents must be unit, orthogonal and have handedness +/-1",
        ["tangents", vertex * 4],
      );
      break;
    }
  }
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const signs = mesh.indices
      .slice(offset, offset + 3)
      .map((index) => mesh.tangents![index * 4 + 3]);
    if (signs.some((sign) => sign !== signs[0])) {
      mechanismIssue(
        context,
        "comp-native3d-tangent",
        "Triangle handedness must agree",
        ["indices", offset],
      );
      break;
    }
  }
});
/** Explicit resource version; solid-geometry-1 and all existing source parsers stay strict. */
export const SolidGeometryV2Schema = z
  .object({
    schemaVersion: z.literal("solid-geometry-2"),
    meshes: z.array(NativePbrMeshSchema).min(1).max(MECHANISM_LIMITS.parts),
    materials: z
      .array(NativePbrMaterialSchema)
      .min(1)
      .max(MECHANISM_LIMITS.materials),
    images: z.array(NativePbrImageSchema).max(NATIVE_PBR_LIMITS.images),
  })
  .strict()
  .superRefine((geometry, context) => {
    for (const field of ["meshes", "materials", "images"] as const)
      checkUniqueIds(geometry[field], context, [field]);
    const pixels = geometry.images.reduce(
      (sum, image) => sum + image.width * image.height,
      0,
    );
    const vertices = geometry.meshes.reduce(
        (sum, mesh) => sum + mesh.positions.length / 3,
        0,
      ),
      triangles = geometry.meshes.reduce(
        (sum, mesh) => sum + mesh.indices.length / 3,
        0,
      );
    const attributes = geometry.meshes.reduce(
      (sum, mesh) =>
        sum +
        4 *
          (mesh.positions.length +
            mesh.normals.length +
            (mesh.uvs?.length ?? 0) +
            (mesh.tangents?.length ?? 0)) +
        (!mesh.indices.some((index) => index >= 65535) ? 2 : 4) *
          mesh.indices.length,
      0,
    );
    if (
      pixels > NATIVE_PBR_LIMITS.pixels ||
      attributes > NATIVE_PBR_LIMITS.attributeBytes ||
      vertices > MECHANISM_LIMITS.vertices ||
      triangles > MECHANISM_LIMITS.triangles
    )
      mechanismIssue(
        context,
        "comp-native3d-limit",
        "Aggregate PBR resources exceed pixel, attribute or topology limits",
      );
    const images = new Set(geometry.images.map((image) => image.id)),
      materials = new Map(
        geometry.materials.map((material) => [material.id, material]),
      );
    geometry.materials.forEach((material, index) => {
      for (const role of [
        "baseColorTexture",
        "metallicRoughnessTexture",
        "normalTexture",
      ] as const)
        if (material[role] && !images.has(material[role]!.image))
          mechanismIssue(
            context,
            "comp-native3d-texture",
            "Unknown image reference",
            ["materials", index, role, "image"],
          );
    });
    geometry.meshes.forEach((mesh, index) => {
      const slots = mesh.groups?.length
        ? mesh.groups.map((group) => geometry.materials[group.materialIndex])
        : [materials.get(mesh.materialId)];
      if (
        !materials.has(mesh.materialId) ||
        slots.some((slot) => slot === undefined)
      )
        mechanismIssue(
          context,
          "comp-native3d-material",
          "Mesh material or group slot is absent",
          ["meshes", index, "materialId"],
        );
      if (
        slots.some(
          (slot) =>
            slot &&
            (slot.baseColorTexture ||
              slot.metallicRoughnessTexture ||
              slot.normalTexture),
        ) &&
        !mesh.uvs
      )
        mechanismIssue(
          context,
          "comp-native3d-texture",
          "Textured meshes need UVs",
          ["meshes", index, "uvs"],
        );
      if (slots.some((slot) => slot?.normalTexture) && !mesh.tangents)
        mechanismIssue(
          context,
          "comp-native3d-tangent",
          "Normal-mapped meshes need supplied tangents",
          ["meshes", index, "tangents"],
        );
    });
  });
export type SolidGeometryV2 = z.infer<typeof SolidGeometryV2Schema>;
export type NativePbrMaterial = z.infer<typeof NativePbrMaterialSchema>;
export type NativePbrImage = z.infer<typeof NativePbrImageSchema>;
export type NativePbrMesh = z.infer<typeof NativePbrMeshSchema>;
