import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismNumberSchema,
} from "./primitives.ts";
import { MechanismRigControlsV2Schema } from "./rigs.ts";

const eventKind = z.enum(["initial", "contact", "release", "return", "reset"]);
/** Authored state requirements, separate from scene-wide physical invariants. */
export const MechanismPackTimelineSchema = z
  .object({
    schemaVersion: z.literal("mechanism-pack-timeline-1"),
    frameCount: z.number().int().min(1).max(MECHANISM_LIMITS.frames),
    initialState: MechanismIdSchema,
    rigControls: MechanismRigControlsV2Schema.default({}),
    states: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            requirements: z
              .array(
                z
                  .object({
                    rig: MechanismIdSchema,
                    relationship: MechanismIdSchema,
                    signedGap: z
                      .tuple([MechanismNumberSchema, MechanismNumberSchema])
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(128),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    transitions: z
      .array(
        z
          .object({
            from: MechanismIdSchema,
            to: MechanismIdSchema,
            event: eventKind.exclude(["initial"]),
          })
          .strict(),
      )
      .max(128),
    events: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            frame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
            kind: eventKind,
            state: MechanismIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MECHANISM_LIMITS.keys),
  })
  .strict();
export type MechanismPackTimeline = z.infer<typeof MechanismPackTimelineSchema>;
