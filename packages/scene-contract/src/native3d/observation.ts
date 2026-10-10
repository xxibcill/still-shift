import { z } from "zod";
import { MechanismMatrixSchema } from "../mechanism/frame.ts";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismPixelSchema,
  MechanismVectorSchema,
} from "../mechanism/primitives.ts";

/** Limits apply before retaining packets or publishing an export. */
export const NATIVE3D_OBSERVATION_LIMITS = {
  packetBytes: 1_048_576,
  passes: 64,
  parts: MECHANISM_LIMITS.parts,
  anchors: MECHANISM_LIMITS.anchors,
  shardBytes: 33_554_432,
  shards: 16,
  totalBytes: 536_870_912,
} as const;
export const NativeObservedCameraSchema = z
  .object({
    worldMatrix: MechanismMatrixSchema,
    viewMatrix: MechanismMatrixSchema,
    projectionMatrix: MechanismMatrixSchema,
    near: z.number().finite().positive(),
    far: z.number().finite().positive(),
    aspect: z.number().finite().positive(),
    fovDegrees: z.number().finite().positive().max(179),
  })
  .strict()
  .refine(
    (camera) => camera.far > camera.near,
    "Observed clip planes must be ordered",
  );
export const NativeObservedPartSchema = z
  .object({
    parent: MechanismIdSchema.optional(),
    localMatrix: MechanismMatrixSchema,
    worldMatrix: MechanismMatrixSchema,
    localVisible: z.boolean(),
    inheritedVisible: z.boolean(),
  })
  .strict();
export const NativeObservedAnchorSchema = z
  .object({
    part: MechanismIdSchema,
    world: MechanismVectorSchema,
    pixel: MechanismPixelSchema.nullable(),
    depth: z.number().finite(),
    visibility: z.enum([
      "visible",
      "occluded",
      "outside-frame",
      "behind-camera",
      "clipped",
      "hidden-part",
    ]),
    visibilityMethod: z.literal("three-physical-mesh-segment"),
    occluderMesh: MechanismIdSchema.optional(),
  })
  .strict();
export const NativeObservedFrameSchema = z
  .object({
    version: z.literal("native3d-observed-frame-1"),
    frameKey: z.string().min(1).max(NATIVE3D_OBSERVATION_LIMITS.packetBytes),
    controller: MechanismIdSchema,
    scope: z.string().min(1).max(2048),
    scopeFrame: z.number().finite(),
    sourceFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    sourceSha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    appearanceCodeSha256: MechanismHashSchema,
    viewport: z.tuple([
      z.number().int().min(0).max(8192),
      z.number().int().min(0).max(8192),
      z.number().int().min(16).max(8192),
      z.number().int().min(16).max(8192),
    ]),
    camera: NativeObservedCameraSchema,
    parts: z
      .record(MechanismIdSchema, NativeObservedPartSchema)
      .refine(
        (parts) =>
          Object.keys(parts).length <= NATIVE3D_OBSERVATION_LIMITS.parts,
        "Observed part budget exceeded",
      ),
    anchors: z
      .record(MechanismIdSchema, NativeObservedAnchorSchema)
      .refine(
        (anchors) =>
          Object.keys(anchors).length <= NATIVE3D_OBSERVATION_LIMITS.anchors,
        "Observed anchor budget exceeded",
      ),
    pass: z
      .object({
        completed: z.literal(true),
        calls: z.number().int().min(0).max(1_000_000),
        triangles: z.number().int().min(0).max(100_000_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((frame, context) => {
    if (frame.viewport[2] * frame.viewport[3] > 8_388_608)
      context.addIssue({
        code: "custom",
        message: "Observed pass pixel budget exceeded",
        path: ["viewport"],
      });
    if (
      Math.abs(frame.camera.aspect - frame.viewport[2] / frame.viewport[3]) >
      1e-12
    )
      context.addIssue({
        code: "custom",
        message: "Observed camera aspect must match its pass viewport",
        path: ["camera", "aspect"],
      });
    for (const [id, part] of Object.entries(frame.parts)) {
      const seen = new Set([id]);
      let parent = part.parent;
      while (parent !== undefined) {
        if (!Object.hasOwn(frame.parts, parent) || seen.has(parent)) {
          context.addIssue({
            code: "custom",
            message: "Observed parent must exist without a cycle",
            path: ["parts", id, "parent"],
          });
          break;
        }
        seen.add(parent);
        parent = frame.parts[parent]!.parent;
      }
    }
    for (const [id, anchor] of Object.entries(frame.anchors))
      if (!Object.hasOwn(frame.parts, anchor.part))
        context.addIssue({
          code: "custom",
          message: "Observed anchor must reference an observed part",
          path: ["anchors", id, "part"],
        });
  });
export const NativeObservedSampleSchema = z
  .object({
    sampleIndex: z
      .number()
      .int()
      .min(0)
      .max(NATIVE3D_OBSERVATION_LIMITS.passes - 1),
    sampleFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    observed: NativeObservedFrameSchema,
  })
  .strict();
export const NativeObservedOutputFrameSchema = z
  .object({
    version: z.literal("native3d-observed-output-frame-1"),
    outputFrame: z
      .number()
      .int()
      .min(0)
      .max(MECHANISM_LIMITS.frames - 1),
    executionSha256: MechanismHashSchema,
    passes: z
      .array(NativeObservedSampleSchema)
      .max(NATIVE3D_OBSERVATION_LIMITS.passes),
  })
  .strict()
  .superRefine((packet, context) => {
    packet.passes.forEach((pass, index) => {
      if (pass.sampleIndex !== index)
        context.addIssue({
          code: "custom",
          message: "Observed passes must retain contiguous invocation order",
          path: ["passes", index, "sampleIndex"],
        });
    });
  });
export type NativeObservedCamera = z.infer<typeof NativeObservedCameraSchema>;
export type NativeObservedPart = z.infer<typeof NativeObservedPartSchema>;
export type NativeObservedAnchor = z.infer<typeof NativeObservedAnchorSchema>;
export type NativeObservedFrame = z.infer<typeof NativeObservedFrameSchema>;
export type NativeObservedSample = z.infer<typeof NativeObservedSampleSchema>;
export type NativeObservedOutputFrame = z.infer<
  typeof NativeObservedOutputFrameSchema
>;
