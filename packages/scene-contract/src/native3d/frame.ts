import { z } from "zod";
import {
  MechanismFrameResultSchema,
  MechanismPartFramesSchema,
  MechanismProjectedAnchorSchema,
} from "../mechanism/frame.ts";
import { MechanismCameraSchema } from "../mechanism/scene.ts";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
} from "../mechanism/primitives.ts";

const frame = z.number().finite().min(0).max(MECHANISM_LIMITS.frames);
const anchorFrames = z
  .record(MechanismIdSchema, MechanismProjectedAnchorSchema)
  .refine(
    (value) => Object.keys(value).length <= MECHANISM_LIMITS.anchors,
    "Anchor frame budget exceeded",
  );
export const SolidFrameResultSchema = z
  .object({
    version: z.literal("solid-evaluator-1"),
    frame,
    seed: z.number().int().min(0).max(2_147_483_647),
    camera: MechanismCameraSchema,
    parts: MechanismPartFramesSchema,
    anchors: anchorFrames,
  })
  .strict()
  .superRefine((value, context) => {
    for (const [id, part] of Object.entries(value.parts))
      if (
        id !== part.id ||
        (part.parent !== undefined && !Object.hasOwn(value.parts, part.parent))
      )
        context.addIssue({
          code: "custom",
          message: "Part identity and parent references must agree",
          path: ["parts", id],
        });
    for (const [id, anchor] of Object.entries(value.anchors))
      if (id !== anchor.anchor || !Object.hasOwn(value.parts, anchor.part))
        context.addIssue({
          code: "custom",
          message: "Anchor identity and part references must agree",
          path: ["anchors", id],
        });
  });
export const NativeSceneFrameSchema = z.union([
  MechanismFrameResultSchema,
  SolidFrameResultSchema,
]);
export const Native3DSourceKeySchema = z
  .string()
  .regex(/^native3d-source-1:[a-f0-9]{64}:[a-f0-9]{64}$/);
export const NativeScreenAnchorSchema = MechanismProjectedAnchorSchema.extend({
  visibility: z.enum([
    "visible",
    "occluded",
    "outside-frame",
    "behind-camera",
    "clipped",
    "hidden-part",
  ]),
  visibilityMethod: z.literal("native-physical-mesh-segment"),
  occluderMesh: MechanismIdSchema.optional(),
}).strict();
export const NativeFrameSnapshotSchema = z
  .object({
    version: z.literal("native3d-frame-1"),
    controller: MechanismIdSchema,
    scope: z.string().min(1).max(2048),
    asset: MechanismIdSchema,
    sourceKey: Native3DSourceKeySchema,
    scopeFrame: z.number().finite(),
    sourceFrame: frame,
    viewport: z
      .object({
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
      })
      .strict(),
    sourceSha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    frameKey: z.string().min(1).max(1_048_576),
    frame: NativeSceneFrameSchema,
    localVisibility: z
      .record(MechanismIdSchema, z.boolean())
      .refine(
        (value) => Object.keys(value).length <= MECHANISM_LIMITS.parts,
        "Local visibility part budget exceeded",
      ),
    anchors: z
      .record(MechanismIdSchema, NativeScreenAnchorSchema)
      .refine(
        (value) => Object.keys(value).length <= MECHANISM_LIMITS.anchors,
        "Anchor frame budget exceeded",
      ),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      snapshot.sourceKey !==
      `native3d-source-1:${snapshot.sourceSha256.slice(7)}:${snapshot.effectiveSceneSha256.slice(7)}`
    )
      context.addIssue({
        code: "custom",
        message:
          "Source key must agree with original and effective source identities",
        path: ["sourceKey"],
      });
    if (snapshot.frame.frame !== snapshot.sourceFrame)
      context.addIssue({
        code: "custom",
        message: "Source frame must agree with physical sample",
        path: ["sourceFrame"],
      });
    if (
      Object.keys(snapshot.localVisibility).length !==
        Object.keys(snapshot.frame.parts).length ||
      Object.keys(snapshot.frame.parts).some(
        (id) => !Object.hasOwn(snapshot.localVisibility, id),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Local visibility must include exactly the physical part inventory",
        path: ["localVisibility"],
      });
    for (const [id, anchor] of Object.entries(snapshot.anchors))
      if (id !== anchor.anchor || !Object.hasOwn(snapshot.frame.anchors, id))
        context.addIssue({
          code: "custom",
          message: "Screen anchor must name its physical frame anchor",
          path: ["anchors", id],
        });
    if (snapshot.viewport.width * snapshot.viewport.height > 8_388_608)
      context.addIssue({
        code: "custom",
        message: "Native pass pixel budget exceeded",
        path: ["viewport"],
      });
  });
export type SolidFrameResult = z.infer<typeof SolidFrameResultSchema>;
export type NativeSceneFrame = z.infer<typeof NativeSceneFrameSchema>;
export type Native3DSourceKey = z.infer<typeof Native3DSourceKeySchema>;
export type NativeScreenAnchor = z.infer<typeof NativeScreenAnchorSchema>;
export type NativeFrameSnapshot = z.infer<typeof NativeFrameSnapshotSchema>;
