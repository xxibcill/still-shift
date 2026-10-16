import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismPixelSchema,
  MechanismVectorSchema,
} from "../mechanism/primitives.ts";
import { MechanismAnchorSourceV2Schema } from "../mechanism/scene-v2.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
import { NativeObservedShapePassSchema } from "./shape-observation.ts";
import {
  NativeObservedCameraSchema,
  NativeObservedPartSchema,
  NativeObservedFrameSchema,
  NATIVE3D_OBSERVATION_LIMITS,
} from "./observation.ts";

export const NATIVE3D_FRAME_FINALIZER_VERSION =
  "native3d-used-shape-frame-finalizer-2" as const;
export const NATIVE3D_SHAPE_PRECISION_POLICY =
  "native3d-quantized-shape-landmarks-1" as const;
const positioned = z
  .object({
    status: z.literal("positioned"),
    source: MechanismAnchorSourceV2Schema,
    part: MechanismIdSchema,
    world: MechanismVectorSchema,
    pixel: MechanismPixelSchema.nullable(),
    depth: z.number().finite(),
    positionMethod: z.enum(["three-part-local-1", "used-position-landmark-1"]),
    visibility: z.enum([
      "visible",
      "occluded",
      "outside-frame",
      "behind-camera",
      "clipped",
      "hidden-part",
    ]),
    visibilityMethod: z.literal(
      "three-physical-mesh-segment-with-used-shapes-2",
    ),
    occluderMesh: MechanismIdSchema.optional(),
  })
  .strict()
  .superRefine((anchor, context) => {
    if (
      (anchor.source.kind === "part-local" &&
        (anchor.positionMethod !== "three-part-local-1" ||
          anchor.source.part !== anchor.part)) ||
      (anchor.source.kind === "shape-landmark" &&
        anchor.positionMethod !== "used-position-landmark-1")
    )
      context.addIssue({
        code: "custom",
        message: "Anchor position method must match its explicit source",
      });
    if (
      (anchor.visibility === "occluded") !==
      (anchor.occluderMesh !== undefined)
    )
      context.addIssue({
        code: "custom",
        message: "Only occluded anchors require a mesh witness",
      });
    if (
      (["visible", "occluded", "outside-frame"].includes(anchor.visibility) &&
        anchor.pixel === null) ||
      (anchor.visibility === "behind-camera" && anchor.pixel !== null)
    )
      context.addIssue({
        code: "custom",
        message: "Observed projection visibility must match pixel availability",
      });
  });
const notDrawn = z
  .object({
    status: z.literal("not-drawn"),
    part: MechanismIdSchema,
    source: z
      .object({
        kind: z.literal("shape-landmark"),
        shape: MechanismIdSchema,
        landmark: MechanismIdSchema,
      })
      .strict(),
    reason: z.enum(["authored-hidden", "outside-frustum"]),
  })
  .strict();
export const NativeObservedAnchorV2Schema = z.discriminatedUnion("status", [
  positioned,
  notDrawn,
]);
/** Full scene2 observation. V1 packets retain their original strict schemas. */
export const NativeObservedFrameV2Schema = z
  .object({
    ...NativeObservedShapePassSchema.shape,
    version: z.literal("native3d-observed-frame-2"),
    finalizerVersion: z.literal(NATIVE3D_FRAME_FINALIZER_VERSION),
    precisionPolicy: z.literal(NATIVE3D_SHAPE_PRECISION_POLICY),
    geometrySha256: MechanismHashSchema,
    appearanceCodeSha256: MechanismHashSchema,
    viewport: z.tuple([
      z.number().int().min(0).max(8192),
      z.number().int().min(0).max(8192),
      z.number().int().min(16).max(8192),
      z.number().int().min(16).max(8192),
    ]),
    camera: NativeObservedCameraSchema,
    parts: mechanismIdRecordV2(
      NativeObservedPartSchema,
      MECHANISM_LIMITS.parts,
    ),
    anchors: mechanismIdRecordV2(
      NativeObservedAnchorV2Schema,
      MECHANISM_LIMITS.anchors,
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
    const issue = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: "custom", message, path });
    if (
      frame.viewport[2] * frame.viewport[3] > 8_388_608 ||
      Math.abs(frame.camera.aspect - frame.viewport[2] / frame.viewport[3]) >
        1e-12
    )
      issue("Observed camera must match the bounded pass viewport", [
        "viewport",
      ]);
    for (const [id, part] of Object.entries(frame.parts)) {
      const seen = new Set([id]);
      let parent = part.parent;
      while (parent !== undefined) {
        if (!Object.hasOwn(frame.parts, parent) || seen.has(parent)) {
          issue("Observed parent must exist without a cycle", [
            "parts",
            id,
            "parent",
          ]);
          break;
        }
        seen.add(parent);
        parent = frame.parts[parent]!.parent;
      }
    }
    for (const [id, anchor] of Object.entries(frame.anchors)) {
      if (!Object.hasOwn(frame.parts, anchor.part))
        issue("Observed anchor must reference an observed part", [
          "anchors",
          id,
          "part",
        ]);
      if (anchor.source.kind !== "shape-landmark") continue;
      const landmark = anchor.source.landmark;
      const shape = Object.hasOwn(frame.shapes, anchor.source.shape)
        ? frame.shapes[anchor.source.shape]
        : undefined;
      if (!shape || shape.association.ownerPart !== anchor.part) {
        issue("Observed landmark must reference its sealed owner", [
          "anchors",
          id,
          "source",
        ]);
        continue;
      }
      if (shape.status === "not-drawn") {
        if (anchor.status !== "not-drawn" || anchor.reason !== shape.reason)
          issue("Not-drawn shapes cannot publish anchor positions", [
            "anchors",
            id,
          ]);
      } else if (
        anchor.status !== "positioned" ||
        !Object.hasOwn(shape.landmarks, anchor.source.landmark) ||
        anchor.world.some(
          (value, index) => value !== shape.landmarks[landmark]!.world[index],
        )
      )
        issue("Drawn shape anchors use the exact measured GPU landmark", [
          "anchors",
          id,
        ]);
    }
    const drawn = Object.values(frame.shapes).filter(
      (shape) => shape.status === "drawn",
    );
    if (
      frame.pass.calls <
        drawn.reduce((sum, shape) => sum + shape.submissions.length, 0) ||
      frame.pass.triangles <
        drawn.reduce((sum, shape) => sum + shape.association.indexCount / 3, 0)
    )
      issue(
        "Pass counters cannot be below the actual indexed shape submissions",
        ["pass"],
      );
  });
export const NativeObservedFrameVersionsSchema = z.union([
  NativeObservedFrameSchema,
  NativeObservedFrameV2Schema,
]);
export const NativeObservedSampleV2Schema = z
  .object({
    sampleIndex: z
      .number()
      .int()
      .min(0)
      .max(NATIVE3D_OBSERVATION_LIMITS.passes - 1),
    sampleFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    observed: NativeObservedFrameVersionsSchema,
  })
  .strict();
export const NativeObservedOutputFrameV2Schema = z
  .object({
    version: z.literal("native3d-observed-output-frame-2"),
    outputFrame: z
      .number()
      .int()
      .min(0)
      .max(MECHANISM_LIMITS.frames - 1),
    executionSha256: MechanismHashSchema,
    passes: z
      .array(NativeObservedSampleV2Schema)
      .max(NATIVE3D_OBSERVATION_LIMITS.passes),
  })
  .strict()
  .superRefine((packet, context) => {
    packet.passes.forEach((pass, index) => {
      if (pass.sampleIndex !== index)
        context.addIssue({
          code: "custom",
          message: "Observed passes retain contiguous invocation order",
          path: ["passes", index, "sampleIndex"],
        });
    });
  });
export type NativeObservedAnchorV2 = z.infer<
  typeof NativeObservedAnchorV2Schema
>;
export type NativeObservedFrameV2 = z.infer<typeof NativeObservedFrameV2Schema>;
export type NativeObservedFrameVersions = z.infer<
  typeof NativeObservedFrameVersionsSchema
>;
export type NativeObservedSampleV2 = z.infer<
  typeof NativeObservedSampleV2Schema
>;
export type NativeObservedOutputFrameV2 = z.infer<
  typeof NativeObservedOutputFrameV2Schema
>;
