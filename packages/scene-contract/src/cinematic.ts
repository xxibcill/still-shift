import { CommerceSceneSchema } from "./commerce.ts";
import { StorySceneSchema } from "./story.ts";
import { z } from "zod";
import {
  PreparedImageSchema,
  PreparedSceneFieldsSchema,
  PreparedSceneSchema,
  PreparedAnimationResultSchema,
  validatePreparedGraph,
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
    subjectAnchorTravelPx: finite.nonnegative().optional(),
    foregroundVerticalTravelPx: finite.nonnegative().optional(),
    backgroundVerticalTravelPx: finite.nonnegative().optional(),
    foregroundScaleChange: finite.nonnegative().optional(),
    backgroundScaleChange: finite.nonnegative().optional(),
    foregroundScaleReduction: finite.min(0).max(1).optional(),
    subjectScaleReduction: finite.min(0).max(1).optional(),
    backgroundScaleReduction: finite.min(0).max(1).optional(),
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
      push: finite.positive().max(10).optional(),
      pullback: finite.positive().max(10).optional(),
      focus: z
        .object({
          maxBlurPx: finite.min(1).max(4),
          transition: z.tuple([
            finite.min(0.1).max(0.8),
            finite.min(0.1).max(0.8),
          ]),
        })
        .strict()
        .optional(),
      curve: z
        .tuple([
          finite.min(-160).max(160),
          finite.min(-40).max(40),
          finite.nonnegative().max(10),
        ])
        .optional(),
      anchor: z
        .tuple([finite.min(0).max(1), finite.min(0).max(1)])
        .default([0.5, 0.5]),
    })
    .strict(),
  recipe: z
    .object({
      preset: z.enum([
        "layered_parallax",
        "threshold_push",
        "lateral_track",
        "foreground_reveal",
        "rising_vista",
        "curved_approach",
        "detail_to_world",
        "focus_handoff",
      ]),
      foreground: id,
      foregroundRight: id.optional(),
      revealRegion: z.array(point).min(3).max(32).optional(),
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
  validatePreparedGraph(scene, fail);
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
  if (scene.recipe.preset === "threshold_push") {
    const right = scene.recipe.foregroundRight;
    const rightLayer = right ? layers.get(right) : undefined;
    if (
      !rightLayer ||
      roles.includes(right!) ||
      !middle ||
      rightLayer.depth >= middle.depth
    )
      fail(
        "Threshold push requires a distinct right foreground closer than the subject",
      );
    if (!scene.camera.push || scene.camera.travel.some((value) => value !== 0))
      fail("Threshold push requires forward travel and no lateral travel");
    if (
      !near?.edgeAttachments?.includes("left") ||
      !rightLayer?.edgeAttachments?.includes("right")
    )
      fail("Threshold doorway sides require left and right edge attachments");
  } else {
    if (scene.recipe.foregroundRight !== undefined)
      fail("Paired doorway sides belong to threshold_push");
    if (
      scene.camera.push !== undefined &&
      scene.recipe.preset !== "curved_approach"
    )
      fail("Axial travel belongs to threshold_push or curved_approach");
  }
  if (
    scene.recipe.preset === "rising_vista" &&
    (scene.camera.travel[0] !== 0 || scene.camera.travel[1] >= 0)
  )
    fail("Rising vista requires upward camera travel only");
  if (scene.recipe.preset === "curved_approach") {
    const c = scene.camera.curve,
      z = scene.camera.push;
    if (!c || !z)
      fail("Curved approach requires forward travel and a curve control point");
    else {
      if (c[2] > z)
        fail("Curve depth must stay between the start and destination");
      const [x, y] = scene.camera.travel;
      if (
        Math.hypot(
          y * c[2] - z * c[1],
          z * c[0] - x * c[2],
          x * c[1] - y * c[0],
        ) < 0.001
      )
        fail(
          "Curved approach needs a bowed path, not a straight control point",
        );
    }
  } else if (scene.camera.curve)
    fail("Curve control belongs to curved_approach");
  if (scene.recipe.preset === "detail_to_world") {
    if (
      !scene.camera.pullback ||
      scene.camera.travel.some((value) => value !== 0)
    )
      fail("Detail to world requires explicit pullback and no lateral travel");
  } else if (scene.camera.pullback !== undefined)
    fail("Pullback belongs to detail_to_world");
  if (scene.recipe.preset === "focus_handoff") {
    const focus = scene.camera.focus;
    if (!focus || focus.transition[1] - focus.transition[0] < 0.15)
      fail(
        "Focus handoff requires a forward focus transition lasting at least 15% of the timeline",
      );
    if (scene.camera.travel[1] !== 0)
      fail("Focus handoff allows only a small horizontal drift");
  } else if (scene.camera.focus !== undefined)
    fail("Focus controls belong to focus_handoff");
  if (
    ["lateral_track", "foreground_reveal"].includes(scene.recipe.preset) &&
    (scene.camera.travel[0] === 0 || scene.camera.travel[1] !== 0)
  )
    fail(
      "Sideways recipes require nonzero horizontal travel and no vertical travel",
    );
  if (scene.recipe.preset === "foreground_reveal") {
    const region = scene.recipe.revealRegion;
    const subject = nodes.get(scene.recipe.subject);
    if (!region || !subject)
      fail("Foreground reveal requires a semantic target polygon");
    else {
      if (
        region.some(
          ([x, y]) => x < 0 || y < 0 || x > subject.width || y > subject.height,
        )
      )
        fail("Reveal target exceeds subject bounds");
      const area = region.reduce((sum, [x, y], i) => {
        const next = region[(i + 1) % region.length]!;
        return sum + x * next[1] - y * next[0];
      }, 0);
      if (Math.abs(area) < 1) fail("Reveal target has no usable area");
    }
  } else if (scene.recipe.revealRegion)
    fail("Reveal target belongs to foreground_reveal");
});

export const PreparedSceneInputSchema = z.union([
  PreparedSceneSchema,
  CinematicSceneSchema,
  StorySceneSchema,
  CommerceSceneSchema,
]);

export const CinematicAnimationResultSchema = z
  .object({
    ...PreparedAnimationResultSchema.shape,
    schemaVersion: z.literal("illustrated-result-2"),
    preset: z.enum([
      "layered_parallax",
      "threshold_push",
      "lateral_track",
      "foreground_reveal",
      "rising_vista",
      "curved_approach",
      "detail_to_world",
      "focus_handoff",
    ]),
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
