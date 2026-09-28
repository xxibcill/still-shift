import { z } from "zod";
import { typographySceneFields } from "./typography.ts";
import { validateTypography } from "./typography-validation.ts";
import {
  ResolvedCharacterActionSchema,
  ResolvedPropTrackSchema,
} from "./character-actions.ts";
import {
  ComponentDataSchema,
  validateComponentData,
} from "./component-data.ts";
import {
  PreparedAnimationResultSchema,
  PreparedSceneFieldsSchema,
  validatePreparedFormat,
  validatePreparedGraph,
} from "./prepared.ts";
import { validateStoryBindings } from "./story-validation.ts";
import {
  StoryWindowSchema as window,
  StoryMoveSchema as move,
  StoryEntranceSchema as entrance,
  storyChoreography as choreography,
  StoryCameraSchema,
  StoryFlowSchema,
} from "./story-motion.ts";

import { sharedEffectsFields } from "./shared-effects.ts";
import { motionAppearanceFields, motionCraftFields } from "./motion-craft.ts";
import { validateMotionCraft } from "./motion-craft-validation.ts";
import { formatSize } from "./output-format.ts";

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const point = z.tuple([finite, finite]);
export const StoryRecipeSchema = z.discriminatedUnion("preset", [
  z.object({ preset: z.literal("generic"), ...choreography }).strict(),
  z
    .object({
      preset: z.literal("unequal_margins"),
      ...choreography,
      households: z.tuple([id, id]),
      reference: id,
      pressures: z.tuple([
        z
          .object({
            node: id,
            to: point,
            condition: z.enum(["room", "strained"]),
          })
          .strict(),
        z
          .object({
            node: id,
            to: point,
            condition: z.enum(["room", "strained"]),
          })
          .strict(),
      ]),
      labels: z.tuple([id, id]),
      strain: window,
      labelWindows: z.tuple([window, window]).optional(),
    })
    .strict(),
  z
    .object({
      preset: z.literal("access_constraint"),
      ...choreography,
      sidesEnter: window.optional(),
      pinch: z
        .object({ path: id, window, amount: finite.min(0).max(1) })
        .strict()
        .optional(),
      source: id,
      connections: z.tuple([id, id]),
      route: id,
      sides: z.tuple([id, id]),
      position: finite.min(0.1).max(0.9).default(0.5),
      openWidth: finite.positive(),
      constrainedWidth: finite.positive(),
      clearance: finite.min(4).default(10),
      reveal: window,
      narrow: window,
    })
    .strict(),
  z
    .object({
      preset: z.literal("relationship_build"),
      anchor: id,
      branches: z
        .array(
          z
            .object({
              path: id,
              destination: id,
              window,
              arrival: window.optional(),
            })
            .strict(),
        )
        .min(2)
        .max(8),
      ...choreography,
    })
    .strict(),
  z
    .object({
      preset: z.literal("evidence_boundary"),
      supported: z.array(entrance).min(1).max(8),
      unknown: entrance,
      composite: entrance,
      boundary: id,
      qualifier: id,
      ...choreography,
    })
    .strict(),
  z
    .object({
      preset: z.literal("dated_system_break"),
      ...choreography,
      contextId: id,
      system: id,
      context: id,
      contextReadyFrame: frame.positive(),
      breaks: z
        .array(z.object({ path: id, window }).strict())
        .min(1)
        .max(8),
      reset: z
        .object({
          atFrame: frame.positive(),
          group: id,
          context: id,
          contextId: id,
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      preset: z.literal("category_swap"),
      ...choreography,
      subject: id,
      fromState: frame,
      toState: frame,
      swapFrame: frame.positive(),
      qualifier: id,
      stableAnchors: z.array(id).min(1).max(12),
      stateLabels: z.array(id).max(8).optional(),
    })
    .strict(),
  z
    .object({
      preset: z.literal("motif_resolve"),
      ...choreography,
      motifs: z.array(id).min(2).max(12),
      moves: z.array(move).min(1).max(40),
      outgoing: id,
      qualifier: id,
      resolve: window,
    })
    .strict(),
]);

export type StoryRecipe = z.infer<typeof StoryRecipeSchema>;
export type StoryWindow = z.infer<typeof window>;
export type StoryMove = z.infer<typeof move>;
export const STORY_PRESETS = StoryRecipeSchema.options
  .map((option) => option.shape.preset.value)
  .filter((preset) => preset !== "generic");

const anchor = z.object({ node: id, point }).strict();
const initialStatePose = z
  .object({
    x: finite.optional(),
    y: finite.optional(),
    rotation: finite.optional(),
    scaleX: finite.positive().max(4).optional(),
    scaleY: finite.positive().max(4).optional(),
    opacity: finite.min(0).max(1).optional(),
  })
  .strict();

export const StorySafeZoneSchema = z
  .object({
    x: finite.nonnegative(),
    y: finite.nonnegative(),
    width: finite.positive(),
    height: finite.positive(),
  })
  .strict();
export const StorySafeZonesSchema = z.record(id, StorySafeZoneSchema);

const formatNodePatch = z
  .object({
    x: finite.optional(),
    y: finite.optional(),
    width: finite.nonnegative().optional(),
    height: finite.nonnegative().optional(),
    origin: point.optional(),
    scale: finite.positive().max(4).optional(),
    scaleX: finite.positive().max(4).optional(),
    scaleY: finite.positive().max(4).optional(),
    lineWidth: finite.positive().optional(),
    fontSize: finite.min(16).max(180).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.scale === undefined ||
      (patch.scaleX === undefined && patch.scaleY === undefined),
    "Format node scale cannot combine with scaleX or scaleY",
  );

export const StoryFormatOverrideSchema = z
  .object({
    nodes: z.record(id, formatNodePatch).optional(),
    initialState: z.record(id, initialStatePose).optional(),
    camera: z
      .object({
        keys: z
          .array(
            z
              .object({
                frame,
                x: finite.optional(),
                y: finite.optional(),
                zoom: finite.min(1).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .optional(),
    safeInset: finite.min(0).max(400).optional(),
    safeZones: StorySafeZonesSchema.optional(),
  })
  .strict();
export const StoryFormatsSchema = z
  .object({ vertical: StoryFormatOverrideSchema.optional() })
  .strict();
export type StoryFormatOverride = z.infer<typeof StoryFormatOverrideSchema>;

const shape = PreparedSceneFieldsSchema.omit({ durationMs: true })
  .extend({
    schemaVersion: z.literal("story-scene-1"),
    componentData: ComponentDataSchema.optional(),
    characterActions: z.array(ResolvedCharacterActionSchema).max(40).optional(),
    propAttachments: z.array(ResolvedPropTrackSchema).max(32).optional(),
    frameCount: frame.positive().max(108000),
    episodeStartFrame: frame.optional(),
    ...motionCraftFields,
    ...motionAppearanceFields,
    ...typographySceneFields,
    ...sharedEffectsFields,
    motionGrammar: z.literal("v2").optional(),
    authoringVersion: z.literal("1").optional(),
    safeInset: finite.min(0).max(400).optional(),
    safeZones: StorySafeZonesSchema.optional(),
    formats: StoryFormatsSchema.optional(),
    initialState: z.record(id, initialStatePose).optional(),
    camera: StoryCameraSchema.optional(),
    flows: z.array(StoryFlowSchema).max(40).optional(),
    review: z
      .object({
        essentialText: z.array(id).max(100),
        focalGroups: z
          .array(z.object({ id, nodes: z.array(id).min(1).max(40) }).strict())
          .max(30)
          .optional(),
      })
      .strict()
      .optional(),
    recipe: StoryRecipeSchema,
    connectors: z
      .array(
        z
          .object({
            path: id,
            from: anchor,
            to: anchor,
            bend: finite.min(-120).max(120).optional(),
          })
          .strict(),
      )
      .max(40)
      .default([]),
  })
  .strict();
export type StoryScene = z.infer<typeof shape>;

export const StorySceneSchema = shape.superRefine((scene, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  validatePreparedFormat(scene, fail);
  const checkZones = (
    zones: z.infer<typeof StorySafeZonesSchema> | undefined,
    width: number,
    height: number,
    path: (string | number)[],
  ) => {
    for (const [name, zone] of Object.entries(zones ?? {}))
      if (zone.x + zone.width > width || zone.y + zone.height > height)
        ctx.addIssue({
          code: "custom",
          message: `Safe zone ${name} must fit the output format`,
          path: [...path, name],
        });
  };
  checkZones(scene.safeZones, scene.width, scene.height, ["safeZones"]);
  const verticalSize = formatSize("vertical");
  checkZones(
    scene.formats?.vertical?.safeZones,
    verticalSize.width,
    verticalSize.height,
    ["formats", "vertical", "safeZones"],
  );
  const { nodes } = validatePreparedGraph(scene, fail);
  const vertical = scene.formats?.vertical;
  for (const [nodeId, patch] of Object.entries(vertical?.nodes ?? {})) {
    const node = nodes.get(nodeId);
    if (!node) fail(`Format override references a missing node: ${nodeId}`);
    if (
      node?.type !== "text" &&
      (patch.lineWidth !== undefined ||
        patch.fontSize !== undefined ||
        patch.align !== undefined)
    )
      fail(`Format text override requires a text node: ${nodeId}`);
  }
  for (const nodeId of Object.keys(vertical?.initialState ?? {}))
    if (!nodes.has(nodeId))
      fail(`Format initial state references a missing node: ${nodeId}`);
  if (vertical?.camera) {
    const frames = new Set(scene.camera?.keys.map((key) => key.frame));
    const patches = vertical.camera.keys.map((key) => key.frame);
    if (!scene.camera || patches.some((frame) => !frames.has(frame)))
      fail("Format camera keys must patch existing camera frames");
    if (new Set(patches).size !== patches.length)
      fail("Format camera key patches must have unique frames");
  }
  validateComponentData(scene, fail);
  validateMotionCraft(scene, ctx);
  validateTypography(scene, ctx);
  validateStoryBindings(scene, nodes, fail);
  if (
    (scene.initialState ||
      scene.safeInset !== undefined ||
      scene.safeZones !== undefined ||
      scene.nodes.some(
        (n) => n.type === "text" && (n.textRole || n.textLayout),
      )) &&
    scene.authoringVersion !== "1"
  )
    fail("Authoring fields require authoringVersion 1");
  for (const node of Object.keys(scene.initialState ?? {}))
    if (!nodes.has(node))
      fail("Initial state references a missing node: " + node);
  for (const textId of scene.review?.essentialText ?? [])
    if (nodes.get(textId)?.type !== "text")
      fail(`Essential text role must bind a text node: ${textId}`);
  for (const group of scene.review?.focalGroups ?? [])
    for (const nodeId of group.nodes)
      if (!nodes.has(nodeId))
        fail(`Focus group ${group.id} references a missing node: ${nodeId}`);
});

export const StoryAnimationResultSchema = z
  .object({
    ...PreparedAnimationResultSchema.shape,
    schemaVersion: z.literal("story-result-1"),
    preset: z.enum([...STORY_PRESETS, "generic"]),
    durationMs: finite.positive(),
    metrics: PreparedAnimationResultSchema.shape.metrics.extend({
      durationMs: finite.positive(),
    }),
  })
  .strict()
  .superRefine((result, ctx) => {
    validatePreparedFormat(result.metrics, (message) =>
      ctx.addIssue({ code: "custom", message, path: ["metrics"] }),
    );
    if (
      result.durationMs !== (result.frameCount * 1000) / result.fps ||
      result.metrics.frameCount !== result.frameCount ||
      result.metrics.durationMs !== result.durationMs
    )
      ctx.addIssue({
        code: "custom",
        message: "Story export must match authoritative frame count",
      });
  });
