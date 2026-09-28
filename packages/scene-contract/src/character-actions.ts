import { z } from "zod";
import { PassageAnchorSchema } from "./passage-audio.ts";

const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const frame = z.number().int().nonnegative();
const point = z.tuple([z.number().finite(), z.number().finite()]);
export const PoseAnchorSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
const timing = {
  anchor: PassageAnchorSchema,
  offset: z.number().int().default(0),
};
const action = {
  id,
  actor: id,
  ...timing,
  durationFrames: frame.positive().max(3600),
  finishPose: id.optional(),
};
export const CharacterActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...action,
      kind: z.literal("walk"),
      poses: z.tuple([id, id]),
      stepFrames: frame.positive().max(120).default(8),
      to: point,
    })
    .strict(),
  ...(["knock", "offer", "receive", "react"] as const).map((kind) =>
    z
      .object({
        ...action,
        kind: z.literal(kind),
        pose: id,
        to: point.optional(),
      })
      .strict(),
  ),
]);
export const PropHoldSchema = z
  .object({ actor: id, anchor: id, offset: point.default([0, 0]) })
  .strict();
const attachmentFields = {
  grip: PoseAnchorSchema.default([0.5, 0.9]),
  initial: PropHoldSchema.nullable().default(null),
};
const change = {
  id,
  hold: PropHoldSchema.nullable(),
  transitionFrames: frame.max(120).default(0),
};
export const PropTrackSchema = z
  .object({
    ...attachmentFields,
    changes: z
      .array(z.object({ ...change, ...timing }).strict())
      .max(40)
      .default([]),
  })
  .strict();
export const ResolvedPropTrackSchema = z
  .object({
    target: id,
    ...attachmentFields,
    changes: z.array(z.object({ ...change, frame }).strict()).max(40),
  })
  .strict();
export const ResolvedCharacterActionSchema = z
  .object({
    node: id,
    kind: z.enum(["walk", "knock", "offer", "receive", "react"]),
    window: z
      .object({ cue: id, start: frame, end: frame })
      .strict()
      .refine((w) => w.end > w.start, "Action requires positive duration"),
  })
  .strict();
export type CharacterAction = z.infer<typeof CharacterActionSchema>;
export type PropHold = z.infer<typeof PropHoldSchema>;
export type PropTrack = z.infer<typeof PropTrackSchema>;
export type ResolvedPropTrack = z.infer<typeof ResolvedPropTrackSchema>;
