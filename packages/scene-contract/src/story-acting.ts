import { z } from "zod";
import { PassageAnchorSchema } from "./passage-audio.ts";

const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const normalized = z.number().finite().min(0).max(1);

export const TextContainerSchema = z
  .object({
    kind: z.enum(["caption", "speech", "thought"]),
    fill: color.default("#FFF8E7"),
    stroke: color.default("#514638"),
    strokeWidth: z.number().min(0).max(12).default(2),
    padding: z.number().min(4).max(80).default(20),
    radius: z.number().min(0).max(100).default(18),
    tail: z
      .object({
        side: z.enum(["top", "bottom", "left", "right"]),
        position: normalized.default(0.3),
        length: z.number().min(8).max(100).default(28),
      })
      .strict()
      .optional(),
  })
  .strict();
export const PoseRegistrationSchema = z
  .object({ anchor: z.tuple([normalized, normalized]) })
  .strict();
export const CharacterPoseTrackSchema = z
  .object({
    initial: id,
    changes: z
      .array(
        z
          .object({
            id,
            pose: id,
            anchor: PassageAnchorSchema,
            offset: z.number().int().default(0),
            blendFrames: z.number().int().min(0).max(3).default(0),
          })
          .strict(),
      )
      .max(40)
      .default([]),
  })
  .strict();
export type TextContainer = z.infer<typeof TextContainerSchema>;
export type CharacterPoseTrack = z.infer<typeof CharacterPoseTrackSchema>;
