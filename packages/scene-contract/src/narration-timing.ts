import { z } from "zod";

export const NarrationSegmentSchema = z
  .object({
    text: z.string().trim().min(1).max(10000),
    segmentIndex: z.number().int().nonnegative().optional(),
    wordIndex: z.number().int().nonnegative().optional(),
    start: z.number().min(0).max(86400),
    end: z.number().min(0).max(86400),
  })
  .strict()
  .refine((s) => s.end >= s.start, "Timing ends before it starts");

export const NarrationTimingSchema = z
  .object({
    schemaVersion: z.literal("narration-timing-1"),
    granularity: z.enum(["word", "subtitle"]),
    segments: z.array(NarrationSegmentSchema).min(1).max(20000),
  })
  .strict()
  .superRefine((timing, ctx) => {
    timing.segments.forEach((s, index) => {
      if (index && s.start < timing.segments[index - 1]!.start)
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "start"],
          message: "Timing must be in chronological order",
        });
    });
  });
export type NarrationTiming = z.infer<typeof NarrationTimingSchema>;
export type NarrationSegment = z.infer<typeof NarrationSegmentSchema>;
