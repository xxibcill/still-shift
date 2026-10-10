import { z } from "zod";
import { MechanismMatrixSchema } from "../mechanism/frame.ts";
import {
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismVectorSchema,
  MECHANISM_LIMITS,
} from "../mechanism/primitives.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
import { MECHANISM_TEACHING_SHAPE_LIMITS } from "../mechanism/teaching-shapes.ts";
import { Native3DSourceKeySchema } from "./frame.ts";

/** Only submitted vertex inputs are proved here; this is not a whole output-frame receipt. */
export const NATIVE3D_USED_STREAM_VERSION =
  "native3d-used-indexed-streams-1" as const;
export const NativeUsedStreamLayoutSchema = z
  .object({
    location: z.number().int().min(0).max(63),
    byteLength: z
      .number()
      .int()
      .min(36)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.vertices * 12),
    components: z.literal(3),
    type: z.literal(5126),
    enabled: z.literal(true),
    normalized: z.literal(false),
    integer: z.literal(false),
    divisor: z.literal(0),
    stride: z.literal(12),
    byteOffset: z.literal(0),
  })
  .strict();
export const NativeShapeDrawGroupSchema = z
  .object({
    groupIndex: z.number().int().min(0).max(31),
    start: z
      .number()
      .int()
      .min(0)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.triangles * 3),
    count: z
      .number()
      .int()
      .positive()
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.triangles * 3),
    materialId: MechanismIdSchema,
    materialSha256: MechanismHashSchema,
  })
  .strict()
  .refine(
    (group) => group.start % 3 === 0 && group.count % 3 === 0,
    "Draw groups contain complete triangles",
  );
export const NativeShapeAssociationSchema = z
  .object({
    shape: MechanismIdSchema,
    mesh: MechanismIdSchema,
    ownerPart: MechanismIdSchema,
    generator: z.enum(["fixed-root-pawl-curve-1", "seated-torsion-spring-1"]),
    declarationSha256: MechanismHashSchema,
    templateSha256: MechanismHashSchema,
    topologySha256: MechanismHashSchema,
    templateMeshDataSha256: MechanismHashSchema,
    vertexCount: z
      .number()
      .int()
      .min(3)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.vertices),
    indexCount: z
      .number()
      .int()
      .min(3)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.triangles * 3),
    groups: z.array(NativeShapeDrawGroupSchema).min(1).max(32),
  })
  .strict()
  .superRefine((shape, context) => {
    let end = 0;
    for (const [index, group] of shape.groups.entries()) {
      if (group.groupIndex !== index || group.start !== end)
        context.addIssue({
          code: "custom",
          message: "Sealed groups partition indices in order",
          path: ["groups", index],
        });
      end = group.start + group.count;
    }
    if (end !== shape.indexCount)
      context.addIssue({
        code: "custom",
        message: "Sealed groups cover every index",
        path: ["groups"],
      });
  });
const identity = {
  association: NativeShapeAssociationSchema,
  driverStateKey: z.string().min(1).max(1024),
};
const landmark = z
  .object({
    local: MechanismVectorSchema,
    world: MechanismVectorSchema,
    positionMethod: z.literal("used-position-landmark-1"),
  })
  .strict();
const drawn = z
  .object({
    ...identity,
    status: z.literal("drawn"),
    ownerWorldMatrix: MechanismMatrixSchema,
    positionSha256: MechanismHashSchema,
    normalSha256: MechanismHashSchema,
    indexSha256: MechanismHashSchema,
    positionLayout: NativeUsedStreamLayoutSchema,
    normalLayout: NativeUsedStreamLayoutSchema,
    landmarks: mechanismIdRecordV2(landmark, 4),
    submissions: z
      .array(
        NativeShapeDrawGroupSchema.safeExtend({
          drawOrdinal: z.number().int().min(0).max(127),
          readbackOrdinal: z.number().int().min(0).max(127),
          streamSet: z.literal(0),
          mode: z.literal(4),
          type: z.literal(5123),
          byteOffset: z
            .number()
            .int()
            .min(0)
            .max(MECHANISM_TEACHING_SHAPE_LIMITS.triangles * 6),
        }).strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
  .superRefine((shape, context) => {
    if (
      shape.positionLayout.byteLength !== shape.association.vertexCount * 12 ||
      shape.normalLayout.byteLength !== shape.association.vertexCount * 12
    )
      context.addIssue({
        code: "custom",
        message: "Used stream lengths match sealed vertices",
      });
    const expectedLandmarks =
      shape.association.generator === "fixed-root-pawl-curve-1"
        ? ["root", "tip"]
        : ["seat-a", "seat-b", "coil-a", "coil-b"];
    if (
      Object.keys(shape.landmarks).length !== expectedLandmarks.length ||
      expectedLandmarks.some((id) => !Object.hasOwn(shape.landmarks, id))
    )
      context.addIssue({
        code: "custom",
        message: "Used landmarks retain the generator's exact sealed inventory",
      });
    if (shape.positionLayout.location === shape.normalLayout.location)
      context.addIssue({
        code: "custom",
        message: "Used position and normal attributes have distinct locations",
      });
    if (shape.submissions.length !== shape.association.groups.length)
      context.addIssue({
        code: "custom",
        message: "Every sealed group requires one nonzero submission",
      });
    for (const [index, group] of shape.submissions.entries()) {
      const expected = shape.association.groups[index];
      if (
        !expected ||
        group.groupIndex !== index ||
        group.byteOffset !== group.start * 2 ||
        group.start !== expected.start ||
        group.count !== expected.count ||
        group.materialId !== expected.materialId ||
        group.materialSha256 !== expected.materialSha256
      )
        context.addIssue({
          code: "custom",
          message: "Used group differs from sealed group",
          path: ["submissions", index],
        });
    }
  });
export const NativeObservedShapeSchema = z.discriminatedUnion("status", [
  drawn,
  z
    .object({
      ...identity,
      status: z.literal("not-drawn"),
      reason: z.enum(["authored-hidden", "outside-frustum"]),
    })
    .strict(),
]);
export const NativeObservedShapePassSchema = z
  .object({
    version: z.literal("native3d-observed-shape-pass-1"),
    usedStreamVersion: z.literal(NATIVE3D_USED_STREAM_VERSION),
    digestPacking: z.literal("float32-uint16-little-endian-1"),
    sourceVersion: z.literal("mechanism-scene-2"),
    sourceKey: Native3DSourceKeySchema,
    sourceSha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    frameKeySha256: MechanismHashSchema,
    controller: MechanismIdSchema,
    scope: z.string().min(1).max(2048),
    sourceFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    scopeFrame: z.number().finite(),
    shapes: mechanismIdRecordV2(
      NativeObservedShapeSchema,
      MECHANISM_TEACHING_SHAPE_LIMITS.meshes,
    ),
  })
  .strict()
  .superRefine((pass, context) => {
    const shapes = Object.entries(pass.shapes);
    if (shapes.some(([id, shape]) => id !== shape.association.shape))
      context.addIssue({
        code: "custom",
        message: "Shape dictionary key must match association",
      });
    if (
      shapes.reduce(
        (sum, [, shape]) => sum + shape.association.vertexCount,
        0,
      ) > MECHANISM_TEACHING_SHAPE_LIMITS.vertices ||
      shapes.reduce(
        (sum, [, shape]) => sum + shape.association.indexCount / 3,
        0,
      ) > MECHANISM_TEACHING_SHAPE_LIMITS.triangles
    )
      context.addIssue({
        code: "custom",
        message: "Observed shapes exceed aggregate geometry budgets",
      });
    const ordinals = shapes
      .flatMap(([, shape]) =>
        shape.status === "drawn" ? shape.submissions : [],
      )
      .sort((a, b) => a.readbackOrdinal - b.readbackOrdinal);
    if (
      ordinals.some(
        (draw, index) =>
          draw.drawOrdinal !== index || draw.readbackOrdinal !== index,
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Used draws/readbacks retain contiguous owned color invocation order",
      });
  });
export type NativeShapeAssociation = z.infer<
  typeof NativeShapeAssociationSchema
>;
export type NativeObservedShape = z.infer<typeof NativeObservedShapeSchema>;
export type NativeObservedShapePass = z.infer<
  typeof NativeObservedShapePassSchema
>;
