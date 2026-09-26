import { z } from "zod";
import {
  PreparedAnimationResultSchema,
  PreparedSceneFieldsSchema,
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

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const point = z.tuple([finite, finite]);
export const StoryRecipeSchema = z.discriminatedUnion("preset", [
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
export const STORY_PRESETS = StoryRecipeSchema.options.map(
  (option) => option.shape.preset.value,
);

const anchor = z.object({ node: id, point }).strict();
const shape = PreparedSceneFieldsSchema.omit({ durationMs: true })
  .extend({
    schemaVersion: z.literal("story-scene-1"),
    frameCount: frame.positive().max(108000),
    episodeStartFrame: frame.optional(),
    motionGrammar: z.literal("v2").optional(),
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
  const { nodes } = validatePreparedGraph(scene, fail);
  validateStoryBindings(scene, nodes, fail);
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
    preset: z.enum(STORY_PRESETS),
    durationMs: finite.positive(),
    metrics: PreparedAnimationResultSchema.shape.metrics.extend({
      durationMs: finite.positive(),
    }),
  })
  .strict()
  .superRefine((result, ctx) => {
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
