import { z } from "zod";
import { MotionEasingSchema } from "./motion-easing.ts";

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const StoryRoleSchema = z.enum([
  "action",
  "response",
  "carrier",
  "current",
]);
export type StoryRole = z.infer<typeof StoryRoleSchema>;
export const StoryWindowSchema = z
  .object({
    start: frame,
    end: frame,
    cue: z.string().min(1).optional(),
    easing: MotionEasingSchema.optional(),
    role: StoryRoleSchema.optional(),
  })
  .strict()
  .refine((v) => v.end > v.start, "Event end must follow start");
const pose = {
  x: finite.optional(),
  y: finite.optional(),
  scaleX: finite.positive().max(4).optional(),
  scaleY: finite.positive().max(4).optional(),
  rotation: finite.optional(),
  opacity: finite.min(0).max(1).optional(),
};
export const StoryMoveSchema = z
  .object({
    node: id,
    window: StoryWindowSchema.optional(),
    to: z
      .object({ ...pose, scale: finite.positive().max(4).optional() })
      .strict()
      .optional(),
    keys: z
      .array(
        z
          .object({ frame, ...pose, easing: MotionEasingSchema.optional() })
          .strict(),
      )
      .min(2)
      .max(100)
      .optional(),
    role: StoryRoleSchema.optional(),
  })
  .strict()
  .superRefine((move, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      move.keys
        ? move.window !== undefined || move.to !== undefined
        : !move.window || !move.to
    )
      fail("Move requires either keys or window and to");
    if (
      move.to?.scale !== undefined &&
      (move.to.scaleX !== undefined || move.to.scaleY !== undefined)
    )
      fail("Move cannot combine scale with scaleX or scaleY");
    if (move.to && !Object.values(move.to).some((v) => v !== undefined))
      fail("Move target cannot be empty");
    move.keys?.forEach((key, i, keys) => {
      if (i && key.frame <= keys[i - 1]!.frame)
        fail("Move key frames must be strictly increasing");
    });
  });
const direction = z.enum(["left", "right", "up", "down"]);
export const StoryEntranceSchema = z
  .object({
    node: id,
    window: StoryWindowSchema,
    verb: z
      .enum([
        "set-down",
        "attach",
        "rise",
        "wipe",
        "draw",
        "stamp",
        "assemble",
        "fade",
      ])
      .optional(),
    from: direction.optional(),
    distance: finite.nonnegative().optional(),
    parts: z
      .array(
        z
          .object({
            node: id,
            from: direction,
            distance: finite.nonnegative(),
            offset: frame,
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
  })
  .strict()
  .refine((v) => v.verb !== "assemble" || !!v.parts, "Assemble requires parts");
export const StoryExitSchema = z
  .object({
    node: id,
    window: StoryWindowSchema,
    verb: z.enum(["lift", "wipe-out", "retract", "fade"]).optional(),
    to: direction.optional(),
    distance: finite.nonnegative().optional(),
  })
  .strict();
export const storyChoreography = {
  moves: z.array(StoryMoveSchema).max(40).default([]),
  emphasis: z
    .array(
      z
        .object({
          node: id,
          window: StoryWindowSchema,
          opacity: finite.min(0.2).max(1),
        })
        .strict(),
    )
    .max(40)
    .default([]),
  entrances: z.array(StoryEntranceSchema).max(80).optional(),
  exits: z.array(StoryExitSchema).max(80).optional(),
};
const tangent = z.object({ x: finite, y: finite, zoom: finite }).strict();
export const StoryCameraSchema = z
  .object({
    keys: z
      .array(
        z
          .object({
            frame,
            x: finite,
            y: finite,
            zoom: finite.min(1),
            rotation: z.literal(0).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(100),
    depth: z.record(id, finite.min(0).max(2)),
    cover: z.array(id).max(20).optional(),
    easeIn: z.boolean().optional(),
    easeOut: z.boolean().optional(),
    startTangent: tangent.optional(),
    endTangent: tangent.optional(),
    jolts: z
      .array(
        z
          .object({
            frame,
            dx: finite,
            dy: finite,
            decayFrames: frame.positive(),
          })
          .strict(),
      )
      .max(1)
      .optional(),
  })
  .strict();
export const StoryFlowSchema = z
  .object({
    id,
    path: id,
    direction: z.union([z.literal(1), z.literal(-1)]),
    count: finite.int().min(1).max(6),
    shape: z.enum(["dot", "dash"]),
    size: finite.positive().max(7),
    color,
    colorStates: z
      .array(z.object({ frame, color }).strict())
      .max(20)
      .optional(),
    window: StoryWindowSchema,
    speed: z
      .array(
        z
          .object({
            frame,
            pxPerFrame: finite.min(0.5).max(8),
            easing: MotionEasingSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    pinch: z
      .object({
        at: finite.min(0).max(1),
        strength: finite.min(0).max(0.95),
        width: finite.positive().max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StoryEntrance = z.infer<typeof StoryEntranceSchema>;
export type StoryExit = z.infer<typeof StoryExitSchema>;
export type StoryFlow = z.infer<typeof StoryFlowSchema>;
