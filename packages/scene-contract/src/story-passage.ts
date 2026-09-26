import { z } from "zod";

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
    const unique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length) fail("Duplicate " + label);
    };
    unique(
      plan.beats.map((beat) => beat.id),
      "beat ID",
    );
    unique(
      plan.delivery.map((shot) => shot.id),
      "delivery ID",
    );
    const total = plan.beats.reduce((sum, beat) => sum + beat.frameCount, 0);
    if (total > 108000) fail("A passage cannot exceed 108000 frames");
    for (const beat of plan.beats) {
      unique(
        beat.cues.map((cue) => cue.id),
        "cue ID in " + beat.id,
      );
      if (beat.evidence.kind === "supported" && !beat.evidence.reference)
        fail("Supported evidence requires a source reference in " + beat.id);
      for (const cue of beat.cues)
        if (cue.frame >= beat.frameCount)
          fail("Cue outside beat " + beat.id + ": " + cue.id);
      for (const [cue, timing] of Object.entries(beat.timing))
        if (timing.end >= beat.frameCount)
          fail("Event outside beat " + beat.id + ": " + cue);
    }
    let end = 0;
    for (const shot of plan.delivery) {
      if (shot.start !== end || shot.end <= shot.start)
        fail("Delivery slices must cover the passage contiguously");
      end = shot.end;
    }
    if (plan.delivery.length && end !== total)
      fail("Delivery slices must cover the entire passage");
  });

export type StoryPassagePlan = z.infer<typeof StoryPassagePlanSchema>;
export type StoryBeat = StoryPassagePlan["beats"][number];
