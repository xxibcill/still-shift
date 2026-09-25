import { z } from "zod";
import {
  PreparedImageSchema,
  PreparedSceneFieldsSchema,
  PreparedSceneSchema,
  PreparedAnimationResultSchema,
} from "./prepared.ts";

const finite = z.number().finite();
const point = z.tuple([finite, finite]);
const rectangle = z.tuple([
  finite.nonnegative(),
  finite.nonnegative(),
  finite.positive(),
  finite.positive(),
]);
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);

export const CameraValidationSchema = z
  .object({
    checkedFrames: finite.int().positive(),
    minimumCoverageMargin: finite.nonnegative(),
    foregroundTravelPx: finite.nonnegative(),
    backgroundTravelPx: finite.nonnegative(),
    subjectTravelPx: finite.nonnegative(),
    subjectScaleChange: finite.nonnegative(),
    sourcePixelsPerOutputPixel: finite.positive(),
  })
  .strict();

const cinematicShape = PreparedSceneFieldsSchema.extend({
  schemaVersion: z.literal("illustrated-scene-2"),
  nodes: z.array(PreparedImageSchema).min(3).max(20),
  layers: z
    .array(
      z
        .object({
          node: id,
          depth: finite.min(0.25).max(100),
          paintedBounds: rectangle.optional(),
          protectedRegion: z.array(point).min(3).max(32).optional(),
          edgeAttachments: z
            .array(z.enum(["left", "right", "top", "bottom"]))
            .min(1)
            .max(4)
            .optional(),
        })
        .strict(),
    )
    .min(3)
    .max(20),
  camera: z
    .object({
      travel: z.tuple([finite.min(-160).max(160), finite.min(-40).max(40)]),
      anchor: z
        .tuple([finite.min(0).max(1), finite.min(0).max(1)])
        .default([0.5, 0.5]),
    })
    .strict(),
  recipe: z
    .object({
      preset: z.literal("layered_parallax"),
      foreground: id,
      subject: id,
      background: id,
      intensity: z
        .enum(["restrained", "standard", "dramatic"])
        .default("standard"),
    })
    .strict(),
}).strict();

export type CinematicScene = z.infer<typeof cinematicShape>;
export const CinematicSceneSchema = cinematicShape.superRefine((scene, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!Number.isInteger((scene.durationMs * scene.fps) / 1000))
    fail("Duration must resolve to whole frames");
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const assets = new Map(scene.assets.map((asset) => [asset.id, asset]));
  const layers = new Map(scene.layers.map((layer) => [layer.node, layer]));
  if (
    nodes.size !== scene.nodes.length ||
    assets.size !== scene.assets.length ||
    layers.size !== scene.layers.length
  )
    fail("Asset, node and layer IDs must be unique");
  if (
    layers.size !== nodes.size ||
    scene.layers.some((layer) => !nodes.has(layer.node))
  )
    fail("Every image must bind exactly one depth plane");
  for (const node of scene.nodes) {
    if (
      node.parent ||
      node.rotation !== 0 ||
      node.fit !== "stretch" ||
      node.states.length !== 1 ||
      node.opacity !== 1
    )
      fail(
        `Cinematic image ${node.id} requires one unrotated, root-level state at full opacity with explicit stretch geometry`,
      );
    for (const state of node.states) {
      const asset = assets.get(state.asset);
      if (!asset) {
        fail(`Missing image asset ${state.asset}`);
        continue;
      }
      if (
        state.crop &&
        (state.crop[0] + state.crop[2] > asset.width ||
          state.crop[1] + state.crop[3] > asset.height)
      )
        fail(`Crop exceeds asset bounds for ${node.id}`);
    }
    const layer = layers.get(node.id);
    if (layer?.paintedBounds) {
      const [x, y, w, h] = layer.paintedBounds;
      if (x + w > node.width || y + h > node.height)
        fail(`Painted bounds exceed ${node.id}`);
    }
    if (
      layer?.protectedRegion?.some(
        ([x, y]) => x < 0 || y < 0 || x > node.width || y > node.height,
      )
    )
      fail(`Protected region exceeds ${node.id}`);
    if (layer?.protectedRegion) {
      const points = layer.protectedRegion;
      const area = points.reduce((sum, [x, y], i) => {
        const next = points[(i + 1) % points.length]!;
        return sum + x * next[1] - y * next[0];
      }, 0);
      if (Math.abs(area) < 0.001)
        fail(`Protected region has zero area for ${node.id}`);
    }
  }
  const roles = [
    scene.recipe.foreground,
    scene.recipe.subject,
    scene.recipe.background,
  ];
  if (new Set(roles).size !== 3 || roles.some((role) => !layers.has(role)))
    fail("Parallax needs distinct foreground, subject and background planes");
  const [near, middle, far] = roles.map((role) => layers.get(role));
  if (
    near &&
    middle &&
    far &&
    !(near.depth < middle.depth && middle.depth < far.depth)
  )
    fail(
      "Parallax depth must increase from foreground through subject to background",
    );
  if (!far?.paintedBounds)
    fail("Background requires declared painted coverage");
  if (!middle?.protectedRegion) fail("Subject requires a protected region");
});

export const PreparedSceneInputSchema = z.union([
  PreparedSceneSchema,
  CinematicSceneSchema,
]);

export const CinematicAnimationResultSchema = z
  .object({
    ...PreparedAnimationResultSchema.shape,
    schemaVersion: z.literal("illustrated-result-2"),
    preset: z.literal("layered_parallax"),
    cameraValidation: CameraValidationSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      result.frameCount !== (result.durationMs * result.fps) / 1000 ||
      result.metrics.frameCount !== result.frameCount ||
      result.metrics.durationMs !== result.durationMs ||
      result.cameraValidation.checkedFrames !== result.frameCount
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Cinematic export and validated frames must match explicit duration and frame rate",
      });
  });
