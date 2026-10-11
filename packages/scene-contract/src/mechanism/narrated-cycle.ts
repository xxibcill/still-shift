import { z } from "zod";
import { CompositionAssetSchema } from "../composition/composition.ts";
import { CompositionAudioAssetSchema } from "../composition/media.ts";
import { CompositionNative3DAssetVersionsSchema } from "../composition/native3d-v2.ts";
import { compositionId } from "../composition/primitives.ts";
import {
  MechanismCameraSchema,
  MechanismEasingSchema,
  MechanismTransformSchema,
} from "./scene.ts";
import { MechanismPackTimelineSchema } from "./timeline.ts";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismNumberSchema,
} from "./primitives.ts";
const pixelPosition = z.tuple([
  z.number().finite().min(0).max(8192),
  z.number().finite().min(0).max(8192),
]);
const annotationLayout = z
  .object({
    locked: z.boolean().default(false),
    priority: z.number().int().min(0).max(1000).default(0),
    candidates: z.array(pixelPosition).max(8).default([]),
  })
  .strict();
const cueLayout = z
  .object({
    safeInsetPixels: z.number().finite().min(0).max(4096).default(8),
    gapPixels: z.number().finite().min(0).max(256).default(4),
    protectedAnchors: z
      .array(
        z
          .object({
            anchor: MechanismIdSchema,
            radiusPixels: z.number().finite().min(1).max(4096),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
const annotationOffset = z.tuple([
  z.number().finite().min(-512).max(512),
  z.number().finite().min(-512).max(512),
]);
export const MechanismScreenAnnotationStyleSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("tab") }).strict(),
    z
      .object({
        kind: z.literal("open-callout"),
        ink: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#101820"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("bracket"),
        ink: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#101820"),
        toAnchor: MechanismIdSchema,
        offsetPixels: annotationOffset.default([0, 20]),
        tickPixels: z.number().finite().positive().max(64).default(6),
      })
      .strict(),
    z
      .object({
        kind: z.literal("arrow"),
        ink: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#101820"),
        headLengthPixels: z.number().finite().positive().max(256).default(12),
        headWidthPixels: z.number().finite().positive().max(256).default(8),
      })
      .strict(),
    z
      .object({
        kind: z.literal("highlight"),
        ink: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#101820"),
        sizePixels: z.tuple([
          z.number().finite().min(2).max(512),
          z.number().finite().min(2).max(512),
        ]),
        opacity: z.number().finite().min(0.05).max(0.5).default(0.35),
      })
      .strict(),
  ],
);
const annotationVisibility = z
  .object({
    policy: z.enum(["hide-occluded", "offscreen-indicator"]),
    visibleWhen: z.enum(["shown", "indicator"]).optional(),
    insetPixels: z.number().finite().min(0).max(4096).default(12),
  })
  .strict()
  .refine(
    (value) =>
      value.visibleWhen !== "indicator" ||
      value.policy === "offscreen-indicator",
    {
      message: "Indicator-only annotations require offscreen-indicator policy",
      path: ["visibleWhen"],
    },
  );
export const MechanismWorldTextAnnotationSchema = z
  .object({
    id: compositionId,
    kind: z.literal("world-text"),
    text: z.string().min(1).max(4000),
    part: MechanismIdSchema,
    transform: MechanismTransformSchema,
    pixelsPerUnit: z.number().finite().positive().max(1_000_000),
    sizePixels: z.tuple([
      z.number().int().min(2).max(512),
      z.number().int().min(2).max(512),
    ]),
    fontSizePixels: z.number().finite().min(1).max(256).default(18),
    ink: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#101820"),
    side: z.enum(["front", "double"]).default("front"),
  })
  .strict();
const sample = z.number().int().min(0).max(172_800_000);
const reference = z
  .object({
    cue: compositionId,
    edge: z.enum(["start", "end"]).default("start"),
    offsetSamples: z
      .number()
      .int()
      .min(-172_800_000)
      .max(172_800_000)
      .default(0),
  })
  .strict();
const scalarKey = z
  .object({
    at: reference,
    value: MechanismNumberSchema,
    easing: MechanismEasingSchema.default("linear"),
  })
  .strict();
const scalar = {
  value: MechanismNumberSchema.optional(),
  keys: z.array(scalarKey).min(1).max(MECHANISM_LIMITS.keys).optional(),
};
const control = z.discriminatedUnion("type", [
  z.object({ type: z.literal("slider"), ...scalar }).strict(),
  z.object({ type: z.literal("hinge"), ...scalar }).strict(),
  z
    .object({
      type: z.literal("spring-return"),
      states: z
        .array(
          z.discriminatedUnion("phase", [
            z
              .object({
                at: reference,
                phase: z.literal("held"),
                value: MechanismNumberSchema,
              })
              .strict(),
            z
              .object({
                at: reference,
                phase: z.literal("released"),
                value: MechanismNumberSchema,
                stopValue: MechanismNumberSchema,
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(MECHANISM_LIMITS.keys),
    })
    .strict(),
  z
    .object({
      type: z.literal("ratchet"),
      position: z.object(scalar).strict(),
      latchKeys: z
        .array(
          z
            .object({ at: reference, state: z.enum(["engaged", "released"]) })
            .strict(),
        )
        .min(1)
        .max(MECHANISM_LIMITS.keys),
    })
    .strict(),
]);
const font = CompositionAssetSchema.options[1];
/** Sample references, never a nine-shot template or a stretched narration clock. */
export const MechanismNarratedCycleSchema = z
  .object({
    schemaVersion: z.literal("mechanism-narrated-cycle-1"),
    id: compositionId,
    revision: z.number().int().min(0).max(2_147_483_647),
    output: z
      .object({
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
        fps: z.number().int().min(1).max(60),
      })
      .strict(),
    source: CompositionNative3DAssetVersionsSchema.safeExtend({
      format: z.literal("mechanism-scene-2"),
    }),
    font,
    narration: CompositionAudioAssetSchema,
    locale: z.enum(["en", "th"]).default("en"),
    maxGraphemesPerSecond: z.number().finite().min(1).max(40).default(18),
    initialState: MechanismPackTimelineSchema.shape.initialState,
    states: MechanismPackTimelineSchema.shape.states,
    transitions: MechanismPackTimelineSchema.shape.transitions,
    controls: z
      .array(z.object({ rig: MechanismIdSchema, control }).strict())
      .max(MECHANISM_LIMITS.rigs),
    cues: z
      .array(
        z
          .object({
            id: compositionId,
            startSample: sample,
            endSampleExclusive: sample,
            kind: z.enum(["initial", "contact", "release", "return", "reset"]),
            state: MechanismIdSchema,
            text: z.string().min(1).max(4000),
            minimumActionSamples: sample.refine((value) => value > 0),
            camera: MechanismCameraSchema.optional(),
            editing: z.enum(["cut", "hold", "transition"]).default("hold"),
            layout: cueLayout.optional(),
            annotations: z
              .array(
                z
                  .object({
                    id: compositionId,
                    text: z.string().min(1).max(4000),
                    anchor: MechanismIdSchema,
                    position: pixelPosition,
                    layout: annotationLayout.optional(),
                    style: MechanismScreenAnnotationStyleSchema.optional(),
                    visibility: annotationVisibility.optional(),
                  })
                  .strict(),
              )
              .max(8)
              .default([]),
            worldAnnotations: z
              .array(MechanismWorldTextAnnotationSchema)
              .max(8)
              .optional(),
            sounds: z
              .array(
                z
                  .object({
                    id: compositionId,
                    asset: CompositionAudioAssetSchema,
                    sourceStartSample: sample.default(0),
                    sourceEndSample: sample.optional(),
                    gainDb: z.number().finite().min(-120).max(12).default(0),
                  })
                  .strict(),
              )
              .max(8)
              .default([]),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();
export type MechanismNarratedCycle = z.infer<
  typeof MechanismNarratedCycleSchema
>;
