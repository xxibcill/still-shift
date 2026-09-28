import { z } from "zod";
import { CharacterActionSchema, PropTrackSchema } from "./character-actions.ts";
import { NarrationTimingSchema } from "./narration-timing.ts";
import {
  CharacterPoseTrackSchema,
  TextContainerSchema,
} from "./story-acting.ts";
import { PassageAnchorSchema, PassageAudioSchema } from "./passage-audio.ts";
import { StoryPassagePlanSchema } from "./story-passage.ts";
import { StoryFormatsSchema, StorySceneSchema } from "./story.ts";
import { CurveEasingSchema, MotionEasingSchema } from "./motion-easing.ts";
import {
  checkPassageBeatContent,
  checkPassageCueIds,
  checkPassageIds,
  checkDeliveryCoverage,
  checkPassageLength,
  requireUniqueIds,
} from "./passage-validation.ts";

const name = z.string().trim().min(1);
const frame = z.number().int().nonnegative();
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const TextRoleSchema = z.enum([
  "heading",
  "label",
  "qualification",
  "body",
]);
export const TextLayoutSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    lineHeight: z.number().min(1).max(3).default(1.2),
    overflow: z.enum(["error", "clip"]).default("error"),
  })
  .strict();
export const StoryStyleSchema = z
  .object({
    schemaVersion: z.literal("story-style-1"),
    id: name,
    background: color.optional(),
    colors: z.record(color, color).default({}),
    text: z
      .partialRecord(
        TextRoleSchema,
        z
          .object({
            fontSize: z.number().min(16).max(180).optional(),
            color: color.optional(),
            fontAsset: name.optional(),
          })
          .strict(),
      )
      .optional(),
    lineWidth: z.number().positive().optional(),
    safeInset: z.number().min(0).max(400).optional(),
    lineHeight: z.number().min(1).max(3).optional(),
    easing: MotionEasingSchema.optional(),
  })
  .strict();
export const SlotTimingSchema = z
  .object({ start: frame, end: frame })
  .strict()
  .refine((v) => v.end >= v.start, "Event end must not precede start");
export const StoryTemplateSchema = z
  .object({
    schemaVersion: z.literal("story-template-1"),
    id: name,
    scene: StorySceneSchema,
    formats: StoryFormatsSchema.optional(),
    slots: z
      .record(
        name,
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("text"),
              node: name,
              required: z.boolean().default(false),
            })
            .strict(),
          z
            .object({
              kind: z.literal("asset"),
              asset: name,
              required: z.boolean().default(false),
            })
            .strict(),
          z
            .object({
              kind: z.literal("subject"),
              node: name,
              required: z.boolean().default(false),
            })
            .strict(),
          z
            .object({
              kind: z.literal("relationship"),
              path: name,
              required: z.boolean().default(false),
            })
            .strict(),
          z
            .object({
              kind: z.literal("timing"),
              event: name,
              required: z.boolean().default(false),
            })
            .strict(),
        ]),
      )
      .default({}),
    textRoles: z.record(name, TextRoleSchema).default({}),
    textLayout: z.record(name, TextLayoutSchema).default({}),
  })
  .strict();
export const TimingBindingSchema = z
  .object({
    anchor: PassageAnchorSchema,
    offset: z.number().int().default(0),
    duration: frame,
  })
  .strict();
const properties = z.enum([
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
]);
export const HandoffSchema = z
  .object({
    mode: z
      .enum([
        "cut",
        "continue",
        "reset",
        "overlap",
        "crossfade",
        "push",
        "match",
      ])
      .default("cut"),
    frames: z.number().int().min(2).max(120).optional(),
    direction: z.enum(["left", "right", "up", "down"]).optional(),
    easing: CurveEasingSchema.optional(),
    camera: z.enum(["carry", "reset"]).default("reset"),
    subjects: z
      .array(
        z
          .object({
            id: name,
            from: name.optional(),
            to: name.optional(),
            mode: z.enum(["carry", "reset", "enter", "exit"]),
            properties: z
              .array(properties)
              .min(1)
              .default(["x", "y", "scaleX", "scaleY", "rotation", "opacity"]),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict();
const legacyBeat = StoryPassagePlanSchema.shape.beats.element;
export const StoryAuthoringPlanSchema = z
  .object({
    ...StoryPassagePlanSchema.shape,
    schemaVersion: z.literal("story-passage-2"),
    transitionModel: z.literal("joins-1").optional(),
    styleProfile: StoryStyleSchema,
    contentPolicy: z.enum(["general", "historical"]).default("general"),
    narration: StoryPassagePlanSchema.shape.narration
      .extend({ timing: NarrationTimingSchema.optional() })
      .optional(),
    audio: PassageAudioSchema.optional(),
    beats: z
      .array(
        z
          .object({
            ...legacyBeat.shape,
            evidence: legacyBeat.shape.evidence.optional(),
            cues: z
              .array(
                legacyBeat.shape.cues.element.extend({
                  events: z.array(name).max(20).default([]),
                }),
              )
              .max(100),
            timing: z.record(name, SlotTimingSchema).default({}),
            parameters: z.record(name, z.unknown()).default({}),
            textContainers: z
              .record(name, TextContainerSchema.nullable())
              .optional(),
            poseTracks: z.record(name, CharacterPoseTrackSchema).optional(),
            actions: z.array(CharacterActionSchema).max(40).optional(),
            propTracks: z.record(name, PropTrackSchema).optional(),
            bindings: z.record(name, TimingBindingSchema).default({}),
            handoff: HandoffSchema.default({
              mode: "cut",
              camera: "reset",
              subjects: [],
            }),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const fail = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });
    checkPassageIds(plan, fail);
    let total = 0;
    plan.beats.forEach((beat, index) => {
      total += beat.frameCount;
      const transition = ["overlap", "crossfade", "push", "match"].includes(
        beat.handoff.mode,
      );
      if (
        transition &&
        (plan.transitionModel !== "joins-1" ||
          !index ||
          !beat.handoff.frames ||
          beat.handoff.frames >= beat.frameCount)
      )
        fail(
          "transition-contract: joins require transitionModel joins-1, a previous beat and frames shorter than the incoming beat",
          ["beats", index, "handoff"],
        );
      if (
        !transition &&
        (beat.handoff.frames !== undefined ||
          beat.handoff.direction !== undefined ||
          beat.handoff.easing !== undefined)
      )
        fail("transition-contract: transition fields require a join mode", [
          "beats",
          index,
          "handoff",
        ]);
      if (
        beat.handoff.mode === "match" &&
        !beat.handoff.subjects.some((s) => s.mode === "carry")
      )
        fail("transition-match: match requires a carried subject identity", [
          "beats",
          index,
          "handoff",
          "subjects",
        ]);
      checkPassageCueIds(beat, fail);
      requireUniqueIds(
        beat.handoff.subjects.map((s) => s.id),
        "subject identity in " + beat.id,
        fail,
      );
      if (plan.contentPolicy === "historical" && !beat.evidence)
        fail("Historical policy requires evidence", [
          "beats",
          index,
          "evidence",
        ]);
      checkPassageBeatContent(beat, (issue) => {
        if (issue.kind === "missing-supported-reference")
          fail("Supported evidence requires a source reference", [
            "beats",
            index,
            "evidence",
          ]);
        else fail("Cue outside beat " + beat.id, ["beats", index, "cues"]);
      });
      for (const [event, window] of Object.entries(beat.timing)) {
        if (window.end > beat.frameCount)
          fail("Event outside beat " + beat.id, [
            "beats",
            index,
            "timing",
            event,
          ]);
        if (beat.bindings[event])
          fail("Event has both absolute and linked timing: " + event, [
            "beats",
            index,
            "bindings",
            event,
          ]);
      }
    });
    checkPassageLength(total, fail);
    checkDeliveryCoverage(plan.delivery, total, fail);
  });

export type StoryAuthoringPlan = z.infer<typeof StoryAuthoringPlanSchema>;
export type PassagePlan =
  | z.infer<typeof StoryPassagePlanSchema>
  | StoryAuthoringPlan;
export type PassageBeat = PassagePlan["beats"][number];
export type StoryTemplate = z.infer<typeof StoryTemplateSchema>;
export type StoryStyle = z.infer<typeof StoryStyleSchema>;
export type TimingBinding = z.infer<typeof TimingBindingSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export const parsePassagePlan = (input: unknown): PassagePlan =>
  input &&
  typeof input === "object" &&
  "schemaVersion" in input &&
  input.schemaVersion === "story-passage-2"
    ? StoryAuthoringPlanSchema.parse(input)
    : StoryPassagePlanSchema.parse(input);

export const SlotPoseSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .strict();
export const SlotRelationshipSchema = z
  .object({
    from: z
      .object({
        node: name,
        point: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .strict(),
    to: z
      .object({
        node: name,
        point: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .strict(),
  })
  .strict();
