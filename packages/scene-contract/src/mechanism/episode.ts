import { z } from "zod";
import {
  MechanismCameraKeysSchema,
  MechanismCameraSchema,
  MechanismControlsSchema,
} from "./scene.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismFrameSchema,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismIntervalSchema,
  MechanismPixelSchema,
  mechanismIssue,
} from "./primitives.ts";

export const MECHANISM_LABEL_ROLES = [
  "PULL",
  "PUSH",
  "THICKNESS",
  "TRAVEL",
  "INSIDE",
  "OUTSIDE",
  "SLIDES",
] as const;
const dependencyFields = {
  id: MechanismIdSchema,
  path: z.string().min(1).max(1024),
  sha256: MechanismHashSchema,
  license: z.string().max(1000).optional(),
};
export const MechanismDependencySchema = z.discriminatedUnion("type", [
  z
    .object({
      ...dependencyFields,
      type: z.literal("font"),
      profile: z.enum(["legacy", "strict"]).default("strict"),
      weight: z
        .string()
        .regex(/^(?:[1-8]\d{2}|900)$/)
        .optional(),
      family: z.string().min(1).max(200).optional(),
      subfamily: z.string().min(1).max(200).optional(),
      postscriptName: z.string().min(1).max(200).optional(),
      style: z.enum(["normal", "italic", "oblique"]).optional(),
      axes: z
        .record(
          z.string().regex(/^[A-Za-z0-9]{4}$/),
          z.number().finite().min(-1_000_000).max(1_000_000),
        )
        .refine((axes) => Object.keys(axes).length <= 16, {
          message: "Font axis budget exceeded",
        })
        .optional(),
    })
    .strict(),
  z
    .object({
      ...dependencyFields,
      type: z.enum(["scene", "audio", "captions", "timing", "license"]),
    })
    .strict(),
]);
export const MechanismLabelSchema = z
  .object({
    id: MechanismIdSchema,
    role: z.enum(MECHANISM_LABEL_ROLES),
    text: z.string().min(1).max(400),
    anchor: MechanismIdSchema,
    proofTarget: MechanismIdSchema.optional(),
    position: MechanismPixelSchema,
    readingInterval: MechanismIntervalSchema,
    fontSize: z.number().finite().min(16).max(400).default(48),
    font: MechanismIdSchema.optional(),
    visibilityPolicy: z
      .enum(["hide-occluded", "offscreen-indicator"])
      .default("hide-occluded"),
    qualification: z.string().min(1).max(400).optional(),
  })
  .strict()
  .refine(
    (label) =>
      label.readingInterval.endFrameExclusive -
        label.readingInterval.startFrame >=
      30,
    {
      message:
        "E01 labels require at least 30 consecutive fully readable output frames",
      path: ["readingInterval"],
    },
  );
export const MechanismShotSchema = z
  .object({
    id: MechanismIdSchema,
    purpose: z.string().min(1).max(200),
    startFrame: MechanismFrameSchema,
    endFrameExclusive: MechanismFrameSchema,
    camera: MechanismCameraSchema.optional(),
    cameraKeys: MechanismCameraKeysSchema.optional(),
    controls: MechanismControlsSchema.default({}),
    hiddenParts: z
      .array(MechanismIdSchema)
      .max(MECHANISM_LIMITS.parts)
      .default([]),
    labels: z.array(MechanismLabelSchema).max(16).default([]),
  })
  .strict();
export const MechanismEpisodeSchema = z
  .object({
    schemaVersion: z.literal("mechanism-episode-1"),
    id: MechanismIdSchema,
    revision: z.number().int().min(0).max(2_147_483_647),
    scene: MechanismIdSchema,
    font: MechanismIdSchema,
    audio: MechanismIdSchema.optional(),
    output: z
      .object({
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
        fps: z.number().int().min(1).max(60),
        frameCount: MechanismFrameSchema.refine((v) => v > 0),
      })
      .strict(),
    dependencies: z
      .array(MechanismDependencySchema)
      .min(2)
      .max(MECHANISM_LIMITS.dependencies),
    shots: z.array(MechanismShotSchema).min(1).max(MECHANISM_LIMITS.shots),
    captions: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            text: z.string().min(1).max(4000),
            startFrame: MechanismFrameSchema,
            endFrameExclusive: MechanismFrameSchema,
          })
          .strict(),
      )
      .max(500)
      .default([]),
    events: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            frame: MechanismFrameSchema,
            shot: MechanismIdSchema.optional(),
            rig: MechanismIdSchema.optional(),
            purpose: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict()
  .superRefine((episode, context) => {
    for (const [index, dependency] of episode.dependencies.entries())
      if (
        dependency.type === "font" &&
        dependency.license !== undefined &&
        !episode.dependencies.some(
          (item) => item.type === "license" && item.path === dependency.license,
        )
      )
        mechanismIssue(
          context,
          "mechanism-font-license",
          "Font license must name a declared hashed license dependency",
          ["dependencies", index, "license"],
        );
    checkUniqueIds(episode.dependencies, context, ["dependencies"]);
    checkUniqueIds(episode.shots, context, ["shots"]);
    checkUniqueIds(episode.captions, context, ["captions"]);
    checkUniqueIds(episode.events, context, ["events"]);
    for (const [field, type] of [
      ["scene", "scene"],
      ["font", "font"],
      ["audio", "audio"],
    ] as const)
      if (
        episode[field] !== undefined &&
        !episode.dependencies.some(
          (dependency) =>
            dependency.id === episode[field] && dependency.type === type,
        )
      )
        mechanismIssue(
          context,
          "mechanism-dependency-reference",
          `${field} must name a ${type} dependency`,
          [field],
        );
    let end = 0;
    const labels = new Set<string>();
    episode.shots.forEach((shot, index) => {
      if (
        shot.startFrame !== end ||
        shot.endFrameExclusive <= shot.startFrame ||
        shot.endFrameExclusive > episode.output.frameCount
      )
        mechanismIssue(
          context,
          "mechanism-shot-range",
          "Shots must partition the complete episode in order",
          ["shots", index],
        );
      end = shot.endFrameExclusive;
      shot.labels.forEach((label, labelIndex) => {
        if (labels.has(label.id))
          mechanismIssue(
            context,
            "mechanism-id-duplicate",
            `Duplicate label ${label.id}`,
            ["shots", index, "labels", labelIndex, "id"],
          );
        labels.add(label.id);
        if (
          label.readingInterval.startFrame < shot.startFrame ||
          label.readingInterval.endFrameExclusive > shot.endFrameExclusive
        )
          mechanismIssue(
            context,
            "mechanism-label-interval",
            "Reading interval must fit its shot",
            ["shots", index, "labels", labelIndex, "readingInterval"],
          );
        if (
          label.font &&
          !episode.dependencies.some(
            (dependency) =>
              dependency.id === label.font && dependency.type === "font",
          )
        )
          mechanismIssue(
            context,
            "mechanism-dependency-reference",
            `Unknown label font ${label.font}`,
            ["shots", index, "labels", labelIndex, "font"],
          );
      });
    });
    if (end !== episode.output.frameCount)
      mechanismIssue(
        context,
        "mechanism-shot-range",
        "Shots must cover the final exclusive frame",
        ["shots"],
      );
    episode.captions.forEach((caption, index) => {
      if (
        caption.endFrameExclusive <= caption.startFrame ||
        caption.endFrameExclusive > episode.output.frameCount
      )
        mechanismIssue(
          context,
          "mechanism-caption-range",
          "Caption must fit the episode clock",
          ["captions", index],
        );
    });
    episode.events.forEach((event, index) => {
      if (event.frame >= episode.output.frameCount)
        mechanismIssue(
          context,
          "mechanism-event-range",
          "Events must precede the exclusive episode end",
          ["events", index, "frame"],
        );
      if (
        event.shot &&
        !episode.shots.some(
          (shot) =>
            shot.id === event.shot &&
            event.frame >= shot.startFrame &&
            event.frame < shot.endFrameExclusive,
        )
      )
        mechanismIssue(
          context,
          "mechanism-event-shot",
          "Event must occur inside its named shot",
          ["events", index, "shot"],
        );
    });
  });
export type MechanismEpisode = z.infer<typeof MechanismEpisodeSchema>;
export type MechanismEpisodeInput = z.input<typeof MechanismEpisodeSchema>;
export type MechanismShot = z.infer<typeof MechanismShotSchema>;
export type MechanismLabel = z.infer<typeof MechanismLabelSchema>;
