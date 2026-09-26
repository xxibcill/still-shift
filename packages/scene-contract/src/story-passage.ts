import { z } from "zod";
import {
  checkCueBounds,
  checkDeliveryCoverage,
  checkPassageLength,
  requireUniqueIds,
} from "./passage-validation.ts";

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const text = z.string().trim().min(1);
const frame = z.number().int().nonnegative();
const window = z
  .object({ start: frame, end: frame })
  .strict()
  .refine(
    (value) => value.end > value.start,
    "An event must end after it starts",
  );

export const StoryPurposeSchema = z.enum([
  "compare",
  "explain-relationships",
  "explain-access",
  "qualify-evidence",
  "show-change",
  "resolve",
]);
export type StoryPurpose = z.infer<typeof StoryPurposeSchema>;

const beat = z
  .object({
    id,
    template: text,
    purpose: StoryPurposeSchema,
    takeaway: text,
    focus: z.array(text).min(1).max(20),
    intensity: z.enum(["quiet", "develop", "peak"]),
    frameCount: frame.positive().max(108000),
    evidence: z
      .object({
        kind: z.enum(["symbolic", "supported", "unknown", "composite"]),
        qualification: text,
        node: text,
        reference: text.optional(),
      })
      .strict(),
    copy: z.record(text, text).default({}),
    timing: z.record(text, window).default({}),
    cues: z
      .array(
        z
          .object({
            id,
            phrase: text,
            frame,
            events: z.array(text).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const StoryPassagePlanSchema = z
  .object({
    schemaVersion: z.literal("story-passage-1"),
    id,
    title: text,
    styleProfile: z.literal("layered-chronicle-1"),
    fps: z.union([z.literal(24), z.literal(30)]),
    sourceStartFrame: frame,
    narration: z
      .object({ reference: text, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
    beats: z.array(beat).min(1).max(100),
    delivery: z
      .array(z.object({ id, start: frame, end: frame }).strict())
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((plan, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: "custom", message });
    requireUniqueIds(
      plan.beats.map((beat) => beat.id),
      "beat ID",
      fail,
    );
    requireUniqueIds(
      plan.delivery.map((shot) => shot.id),
      "delivery ID",
      fail,
    );
    const total = plan.beats.reduce((sum, beat) => sum + beat.frameCount, 0);
    checkPassageLength(total, fail);
    for (const beat of plan.beats) {
      requireUniqueIds(
        beat.cues.map((cue) => cue.id),
        "cue ID in " + beat.id,
        fail,
      );
      if (beat.evidence.kind === "supported" && !beat.evidence.reference)
        fail("Supported evidence requires a source reference in " + beat.id);
      checkCueBounds(beat, (cue) =>
        fail("Cue outside beat " + beat.id + ": " + cue.id),
      );
      for (const [cue, timing] of Object.entries(beat.timing))
        if (timing.end >= beat.frameCount)
          fail("Event outside beat " + beat.id + ": " + cue);
    }
    checkDeliveryCoverage(plan.delivery, total, fail);
  });

export type StoryPassagePlan = z.infer<typeof StoryPassagePlanSchema>;
export type StoryBeat = StoryPassagePlan["beats"][number];
