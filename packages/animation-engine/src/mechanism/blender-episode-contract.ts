import { z } from "zod";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import {
  CompositionAudioAssetSchema,
  CompositionSchema,
  MechanismHashSchema,
} from "@still-shift/scene-contract";
import {
  BlenderCaptureJobSchema,
  BLENDER_CAPTURE_LIMITS,
  BlenderCameraFramingSchema,
  BlenderHighlightsSchema,
} from "./blender-capture-contract.ts";
import { MechanismProductionFileSchema } from "./production-queue-contract.ts";

export const BLENDER_EPISODE_LIMITS = Object.freeze({
  documentBytes: 1024 * 1024,
  frames: 2000,
  shots: 128,
  speechCues: 256,
  keysPerTrack: 256,
  callouts: 64,
  calloutSamples: 4096,
  simultaneousCallouts: 4,
  calloutControlRanges: 8,
});
export const BLENDER_EPISODE_ASSET_IDS = Object.freeze({
  font: "episode-font",
  plates: "native-episode-plates",
});
const compositionIdSuffix = (prefix: string) =>
  z
    .string()
    .min(1)
    .max(CompositionSchema.shape.id.maxLength! - prefix.length)
    .regex(/^[\w-]+$/);
const shotId = compositionIdSuffix("native-plates-");
const calloutId = compositionIdSuffix("callout-leader-");
const speechId = compositionIdSuffix("speech-");
const name = z
  .string()
  .min(1)
  .max(256)
  .refine((v) => !v.includes("\0"));
const key = z
  .object({
    frame: z.number().int().min(0).max(1999),
    value: z.number().finite().min(-1e6).max(1e6),
    interpolation: z.enum(["hold", "linear", "smoothstep"]),
  })
  .strict();
const track = z
  .array(key)
  .min(1)
  .max(256)
  .superRefine((keys, ctx) => {
    if (
      keys[0]!.frame !== 0 ||
      keys.some((k, i) => i > 0 && k.frame <= keys[i - 1]!.frame)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Absolute tracks start at zero with strictly increasing key frames",
      });
  });
export const BlenderEpisodeSourceSchema = z
  .object({
    schemaVersion: z.literal("blender-episode-source-1"),
    family: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,127}$/),
    designVariant: name,
    asset: MechanismProductionFileSchema,
    collection: name,
    resourcePolicy: z.literal("embedded-only"),
    controller: BlenderCaptureJobSchema.shape.controller,
    evidenceFiles: z.array(MechanismProductionFileSchema).max(122),
  })
  .strict();
export type BlenderEpisodeSource = z.infer<typeof BlenderEpisodeSourceSchema>;
export const BlenderEpisodePlanSchema = z
  .object({
    schemaVersion: z.literal("blender-episode-plan-1"),
    id: CompositionSchema.shape.id.max(80),
    locale: z.enum(["en", "th"]),
    width: z.number().int().min(16).max(4096),
    height: z.number().int().min(16).max(4096),
    fps: z.number().int().min(1).max(120),
    samples: z.number().int().min(1).max(256),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    narration: CompositionAudioAssetSchema,
    originalNarrationClock: z
      .object({
        sampleRate: z.number().int().min(8000).max(192000),
        samples: z.number().int().positive().max(172800000),
      })
      .strict(),
    font: z
      .object({
        path: z.string().min(1).max(1024),
        sha256: MechanismHashSchema,
        weight: z.string().regex(/^[1-9]00$/),
      })
      .strict(),
    sourceFrameTrack: track,
    controlTracks: z.record(name, track),
    shots: z
      .array(
        z
          .object({
            id: shotId,
            start: z.number().int().nonnegative(),
            endExclusive: z.number().int().positive(),
            camera: name,
            proofPurpose: z.string().trim().min(1).max(400).optional(),
            framing: BlenderCameraFramingSchema.optional(),
            highlights: BlenderHighlightsSchema.default({}),
            hiddenParts: z.array(name).max(128),
            shownParts: z.array(name).max(128).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(128),
    callouts: z
      .array(
        z
          .object({
            id: calloutId,
            text: z.string().min(1).max(80),
            shot: shotId,
            anchor: name,
            part: name,
            start: z.number().int().nonnegative(),
            endExclusive: z.number().int().positive(),
            position: z.tuple([
              z.number().finite().min(0.04).max(0.96),
              z.number().finite().min(0.04).max(0.7),
            ]),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            controlRanges: z
              .record(
                name,
                z
                  .object({
                    min: z.number().finite(),
                    max: z.number().finite(),
                  })
                  .strict(),
              )
              .default({}),
          })
          .strict(),
      )
      .max(BLENDER_EPISODE_LIMITS.callouts)
      .default([]),
    speech: z
      .array(
        z
          .object({
            id: speechId,
            text: z.string().min(1).max(1024),
            startSample: z.number().int().nonnegative(),
            endSampleExclusive: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(256),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      Object.values(BLENDER_EPISODE_ASSET_IDS).some(
        (id) => id === plan.narration.id,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["narration", "id"],
        message:
          "Narration asset ID conflicts with a generated native episode asset",
      });
    const frames = blenderEpisodeFrameCount(
      plan.narration.sampleCount,
      plan.fps,
    );
    if (
      frames > BLENDER_EPISODE_LIMITS.frames ||
      plan.width * plan.height > BLENDER_CAPTURE_LIMITS.pixels
    )
      reject("Native episode frame/pixel budget exceeded");
    if (
      BigInt(plan.narration.sampleCount) *
        BigInt(plan.originalNarrationClock.sampleRate) !==
      BigInt(plan.originalNarrationClock.samples) * 48000n
    )
      reject(
        "Decoded narration clock must preserve the original duration exactly",
      );
    if (
      Object.keys(plan.controlTracks).length > BLENDER_CAPTURE_LIMITS.controls
    )
      reject("Native episode control budget exceeded");
    for (const keys of [
      plan.sourceFrameTrack,
      ...Object.values(plan.controlTracks),
    ])
      if (keys.at(-1)!.frame >= frames)
        reject("Track key exceeds the native episode clock");
    if (
      new Set(plan.shots.map((s) => s.id)).size !== plan.shots.length ||
      plan.shots[0]!.start !== 0 ||
      plan.shots.at(-1)!.endExclusive !== frames ||
      plan.shots.some(
        (s, i) =>
          s.start >= s.endExclusive ||
          (i > 0 && s.start !== plan.shots[i - 1]!.endExclusive) ||
          new Set(s.hiddenParts).size !== s.hiddenParts.length ||
          new Set(s.shownParts).size !== s.shownParts.length ||
          s.hiddenParts.some((part) => s.shownParts.includes(part)) ||
          s.hiddenParts.length + s.shownParts.length >
            BLENDER_CAPTURE_LIMITS.hiddenParts,
      )
    )
      reject(
        "Shots must form one ordered complete partition with distinct IDs and hidden parts",
      );
    if (
      new Set(plan.callouts.map((c) => c.id)).size !== plan.callouts.length ||
      plan.callouts.reduce((n, c) => n + c.endExclusive - c.start, 0) >
        BLENDER_EPISODE_LIMITS.calloutSamples ||
      plan.callouts.some((c) => {
        const shot = plan.shots.find((s) => s.id === c.shot);
        return (
          !shot ||
          c.start < shot.start ||
          c.endExclusive > shot.endExclusive ||
          c.start >= c.endExclusive ||
          shot.hiddenParts.includes(c.part) ||
          Object.keys(c.controlRanges).length >
            BLENDER_EPISODE_LIMITS.calloutControlRanges ||
          Object.values(c.controlRanges).some((r) => r.min > r.max)
        );
      })
    )
      reject(
        "Callouts need distinct IDs, one source shot, visible parts and a bounded active sample/control budget",
      );
    for (let frame = 0; frame < frames; frame++)
      if (
        plan.callouts.filter((c) => frame >= c.start && frame < c.endExclusive)
          .length > 4
      ) {
        reject("At most four native callouts may overlap");
        break;
      }
    if (
      plan.shots.some((s) =>
        Object.keys(s.highlights).some((part) => s.hiddenParts.includes(part)),
      )
    )
      reject("Native highlights cannot name explicitly hidden parts");
    if (
      new Set(plan.speech.map((s) => s.id)).size !== plan.speech.length ||
      plan.speech.some(
        (s, i) =>
          s.startSample >= s.endSampleExclusive ||
          s.endSampleExclusive > plan.narration.sampleCount ||
          (i > 0 && s.startSample < plan.speech[i - 1]!.endSampleExclusive) ||
          blenderEpisodeFrameCount(s.endSampleExclusive, plan.fps) <=
            blenderEpisodeFrameCount(s.startSample, plan.fps),
      )
    )
      reject(
        "Speech cues require distinct IDs and ordered nonoverlapping windows inside the whole narration",
      );
  });
export type BlenderEpisodePlan = z.infer<typeof BlenderEpisodePlanSchema>;
export function blenderEpisodeFrameCount(samples: number, fps: number): number {
  return Number((BigInt(samples) * BigInt(fps) + 47999n) / 48000n);
}
export function parseBlenderEpisodeSource(
  input: unknown,
): BlenderEpisodeSource {
  compositionNodeJsonSize(
    input,
    0,
    "blender-source",
    BLENDER_EPISODE_LIMITS.documentBytes,
  );
  return BlenderEpisodeSourceSchema.parse(input);
}
export function parseBlenderEpisodePlan(input: unknown): BlenderEpisodePlan {
  compositionNodeJsonSize(
    input,
    0,
    "blender-plan",
    BLENDER_EPISODE_LIMITS.documentBytes,
  );
  return BlenderEpisodePlanSchema.parse(input);
}
