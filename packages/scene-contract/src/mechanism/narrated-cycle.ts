import { z } from "zod";
import { CompositionAssetSchema } from "../composition/composition.ts";
import { CompositionAudioAssetSchema } from "../composition/media.ts";
import { CompositionNative3DAssetVersionsSchema } from "../composition/native3d-v2.ts";
import { compositionId } from "../composition/primitives.ts";
import { MechanismCameraSchema, MechanismEasingSchema } from "./scene.ts";
import { MechanismPackTimelineSchema } from "./timeline.ts";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismNumberSchema,
} from "./primitives.ts";
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
            annotations: z
              .array(
                z
                  .object({
                    id: compositionId,
                    text: z.string().min(1).max(4000),
                    anchor: MechanismIdSchema,
                    position: z.tuple([
                      z.number().finite().min(0).max(8192),
                      z.number().finite().min(0).max(8192),
                    ]),
                  })
                  .strict(),
              )
              .max(8)
              .default([]),
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
