import { z } from "zod";
import {
  FontAxesSchema,
  typographyNodeFields,
  type TextStyle,
} from "./typography.ts";
import { formatSize, OutputFormatSchema } from "./output-format.ts";
import { TextContainerSchema, PoseRegistrationSchema } from "./story-acting.ts";
import { PoseAnchorSchema } from "./character-actions.ts";

const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const point = z.tuple([number, number]);
const crop = z.tuple([
  number.nonnegative(),
  number.nonnegative(),
  number.positive(),
  number.positive(),
]);
const asset = z
  .object({
    id,
    path: z.string().min(1),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    width: number.int().positive(),
    height: number.int().positive(),
  })
  .strict();
export const PreparedFontSchema = z
  .object({
    id,
    path: z.string().min(1),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    weight: z
      .string()
      .regex(/^(?:[1-8]\d{2}|900)$/, "Font weight must be 100–900"),
    style: z.enum(["normal", "italic"]).optional(),
    variable: FontAxesSchema.optional(),
  })
  .strict();
const base = {
  id,
  parent: id.optional(),
  x: number.default(0),
  y: number.default(0),
  width: number.nonnegative().default(0),
  height: number.nonnegative().default(0),
  opacity: number.min(0).max(1).default(1),
  rotation: number.default(0),
  origin: point.default([0.5, 0.5]),
};
export const PreparedNodeSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("image"),
      width: number.positive(),
      height: number.positive(),
      states: z
        .array(
          z
            .object({
              asset: id,
              crop: crop.optional(),
              pose: id.optional(),
              registration: PoseRegistrationSchema.optional(),
              anchors: z.record(id, PoseAnchorSchema).optional(),
            })
            .strict(),
        )
        .min(1),
      fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("path"),
      points: z.array(point).min(2).max(128),
      stroke: color,
      lineWidth: number.positive().max(100),
      lineStyle: z.enum(["uniform", "ink", "brush"]).optional(),
      endArrow: z.boolean().optional(),
      pinchAt: number.min(0.1).max(0.9).optional(),
      pinchWidth: number.min(0.02).max(0.3).optional(),
      gapAt: number.min(0.1).max(0.9).default(0.6),
      gapSize: number.min(0.02).max(0.25).default(0.1),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("text"),
      ...typographyNodeFields,
      container: TextContainerSchema.optional(),
      text: z.string().min(1),
      textRole: z
        .enum(["heading", "label", "qualification", "body"])
        .optional(),
      textLayout: z
        .object({
          width: number.positive(),
          height: number.positive(),
          lineHeight: number.min(1).max(3),
          overflow: z.enum(["error", "clip"]),
        })
        .strict()
        .optional(),
      revealMode: z.enum(["wipe", "words"]).optional(),
      states: z.array(z.string().min(1)).min(1).max(12).optional(),
      fontSize: number.min(16).max(640),
      color,
      weight: z.enum(["normal", "bold"]).default("normal"),
      font: z.enum(["serif", "sans-serif"]).default("sans-serif"),
      fontAsset: id.optional(),
      textBox: z
        .object({
          locale: z.enum(["en", "th"]),
          maxLines: number.int().min(1).max(8),
          lineHeight: number.min(1).max(2),
        })
        .strict()
        .optional(),
      align: z.enum(["left", "center", "right"]).default("left"),
    })
    .strict()
    .refine(
      (n) => n.fontSize <= 180 || !!n.fontAsset || !!n.style,
      "Display sizes above 180 require a pinned font",
    ),
  z
    .object({
      ...base,
      type: z.literal("rect"),
      width: number.positive(),
      height: number.positive(),
      fill: color,
      stroke: color.optional(),
      lineWidth: number.nonnegative().default(0),
      radius: number.nonnegative().default(0),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("group"),
      width: number.positive(),
      height: number.positive(),
      clip: z.boolean().default(false),
    })
    .strict(),
]);
export const IllustratedRecipeSchema = z.discriminatedUnion("preset", [
  z
    .object({
      preset: z.literal("chronicle_reveal"),
      foreground: id,
      middle: id,
      reveal: id,
      travel: number
        .min(-76)
        .max(76)
        .refine(
          (value) => value !== 0,
          "Layered reveal requires nonzero travel",
        )
        .default(-64),
    })
    .strict(),
  z
    .object({
      preset: z.literal("resource_flow"),
      branches: z
        .array(z.object({ path: id, token: id, destination: id }).strict())
        .min(2)
        .max(4),
    })
    .strict(),
  z
    .object({
      preset: z.literal("access_pressure"),
      route: id,
      token: id,
      barrier: id,
      stopAt: number.min(0.05).max(0.9),
    })
    .strict(),
  z
    .object({
      preset: z.literal("comparison_build"),
      panels: z.tuple([id, id]),
      variables: z.tuple([id, id]),
      remaining: z
        .tuple([number.min(0.1).max(1), number.min(0.1).max(1)])
        .default([0.38, 0.75]),
    })
    .strict(),
  z
    .object({
      preset: z.literal("pose_prop_change"),
      actor: id,
      prop: id,
      target: point,
    })
    .strict(),
  z
    .object({
      preset: z.literal("crisis_fracture"),
      paths: z.array(id).min(2).max(4),
      panels: z.array(id).min(1).max(3),
      context: id,
    })
    .strict(),
]);
export type IllustratedPreset = z.infer<
  typeof IllustratedRecipeSchema
>["preset"];
export const ILLUSTRATED_PRESETS: IllustratedPreset[] = [
  "chronicle_reveal",
  "resource_flow",
  "access_pressure",
  "comparison_build",
  "pose_prop_change",
  "crisis_fracture",
];

export const PreparedImageSchema = PreparedNodeSchema.options[0];

/** illustrated-scene-1 is frozen entirely (Q2); new rendering and authoring use composition-1. */
const preparedShape = z
  .object({
    schemaVersion: z.literal("illustrated-scene-1"),
    title: z.string().min(1),
    durationMs: number.int().min(3000).max(8000),
    fps: z.union([z.literal(24), z.literal(30)]),
    format: OutputFormatSchema.optional(),
    width: number.int().positive().default(1920),
    height: number.int().positive().default(1080),
    background: color.default("#E8DFC9"),
    assets: z.array(asset).min(1),
    fonts: z.array(PreparedFontSchema).max(12).optional(),
    nodes: z.array(PreparedNodeSchema).min(1).max(200),
    recipe: IllustratedRecipeSchema,
    provenance: z.string().min(1).optional(),
  })
  .strict();
export type PreparedScene = z.infer<typeof preparedShape>;
export type PreparedNode = PreparedScene["nodes"][number];
export type PreparedImage = Extract<PreparedNode, { type: "image" }>;
export type PreparedPath = Extract<PreparedNode, { type: "path" }>;
export const PreparedSceneFieldsSchema = preparedShape.omit({
  schemaVersion: true,
  recipe: true,
});

export function validatePreparedFormat(
  output: {
    format?: z.infer<typeof OutputFormatSchema> | undefined;
    width: number;
    height: number;
  },
  fail: (message: string) => void,
) {
  const format = output.format ?? "landscape";
  const { width, height } = formatSize(format);
  if (output.width !== width || output.height !== height)
    fail(`Output dimensions must match ${format} format (${width}x${height})`);
}

export function validatePreparedGraph(
  scene: Pick<PreparedScene, "nodes" | "assets" | "fonts"> & {
    typography?: "type-1" | undefined;
    textStyles?: Record<string, TextStyle> | undefined;
  },
  fail: (message: string) => void,
) {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const assets = new Map(scene.assets.map((item) => [item.id, item]));
  const fonts = new Map(scene.fonts?.map((item) => [item.id, item]));
  if (
    !scene.typography &&
    scene.fonts?.some(
      (font) =>
        font.style !== undefined ||
        font.variable ||
        !["400", "500", "600", "700"].includes(font.weight),
    )
  )
    fail("typography-opt-in: Extended font styles require typography type-1");
  if (
    fonts.size !== (scene.fonts?.length ?? 0) ||
    [...fonts.keys()].some((id) => assets.has(id))
  )
    fail("Font IDs must be unique and distinct from image assets");
  if (nodes.size !== scene.nodes.length || assets.size !== scene.assets.length)
    fail("Asset and node IDs must be unique");
  for (const node of scene.nodes) {
    if (
      node.type === "text" &&
      node.container &&
      (!(
        node.fontAsset ??
        (node.style ? scene.textStyles?.[node.style]?.fontAsset : undefined)
      ) ||
        (!node.textLayout && !node.textBox))
    )
      fail(
        `Text containers require a pinned font and measured text layout: ${node.id}`,
      );
    if (node.type === "image") {
      const names = node.states.flatMap((state) =>
        state.pose ? [state.pose] : [],
      );
      if (
        names.length &&
        (names.length !== node.states.length ||
          new Set(names).size !== names.length)
      )
        fail(`Every character pose must have a unique name: ${node.id}`);
      if (
        node.fit !== "contain" &&
        node.states.some((state) => state.registration)
      )
        fail(`Pose registration requires contain fit: ${node.id}`);
    }
    if (
      node.type === "text" &&
      !("typography" in scene && scene.typography === "type-1") &&
      (node.fontSize > 180 ||
        Object.keys(typographyNodeFields).some(
          (key) => node[key as keyof typeof node] !== undefined,
        ))
    )
      fail(`typography-opt-in: ${node.id} requires typography type-1`);
    if (node.type === "text" && node.fontAsset && !fonts.has(node.fontAsset))
      fail(`Missing font asset ${node.fontAsset}`);
    const parents = new Set([node.id]);
    let parent = node.parent;
    while (parent) {
      if (parents.has(parent)) {
        fail(`Cyclic parent for ${node.id}`);
        break;
      }
      parents.add(parent);
      const group = nodes.get(parent);
      if (group?.type !== "group") {
        fail(`Missing group parent for ${node.id}`);
        break;
      }
      parent = group.parent;
    }
    if (node.type === "image")
      for (const state of node.states) {
        const source = assets.get(state.asset);
        if (!source) {
          fail(`Missing image asset ${state.asset}`);
          continue;
        }
        if (
          state.crop &&
          (state.crop[0] + state.crop[2] > source.width ||
            state.crop[1] + state.crop[3] > source.height)
        )
          fail(`Crop exceeds asset bounds for ${node.id}`);
      }
    if (
      node.type === "path" &&
      node.points.every(
        (p) => p[0] === node.points[0]![0] && p[1] === node.points[0]![1],
      )
    )
      fail(`Path ${node.id} has zero length`);
  }
  return { nodes, assets };
}

export const PreparedSceneSchema = preparedShape.superRefine((scene, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  validatePreparedFormat(scene, fail);
  if (!Number.isInteger((scene.durationMs * scene.fps) / 1000))
    fail("Duration must resolve to whole frames");
  const { nodes } = validatePreparedGraph(scene, fail);
  const bindings = new Set<string>();
  const requireNode = (key: string, type?: PreparedNode["type"]) => {
    if (bindings.has(key))
      fail(`Preset roles must bind distinct nodes: ${key}`);
    bindings.add(key);
    const node = nodes.get(key);
    if (!node || (type && node.type !== type))
      fail(`Preset requires ${type ?? "node"} ${key}`);
    return node;
  };
  const requireFollower = (pathId: string, tokenId: string) => {
    const path = requireNode(pathId, "path");
    const token = requireNode(tokenId, "image");
    if (path && token && path.parent !== token.parent)
      fail("Path and travelling token must share a coordinate space");
    return path;
  };
  const recipe = scene.recipe;
  switch (recipe.preset) {
    case "chronicle_reveal":
      [recipe.foreground, recipe.middle, recipe.reveal].forEach((key) =>
        requireNode(key),
      );
      break;
    case "resource_flow":
      for (const branch of recipe.branches) {
        requireFollower(branch.path, branch.token);
        requireNode(branch.destination);
      }
      break;
    case "access_pressure": {
      const route = requireFollower(recipe.route, recipe.token);
      requireNode(recipe.barrier);
      if (route?.type === "path") {
        const length = route.points
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum +
              Math.hypot(
                p[0] - route.points[i]![0],
                p[1] - route.points[i]![1],
              ),
            0,
          );
        const token = nodes.get(recipe.token);
        const radius = token ? Math.hypot(token.width, token.height) / 2 : 0;
        if (
          (route.gapAt - route.gapSize / 2 - recipe.stopAt) * length <=
          radius
        )
          fail("Entire token must stop before the restricted interval");
      }
      break;
    }
    case "comparison_build":
      recipe.panels.forEach((key) => requireNode(key, "group"));
      recipe.variables.forEach((key) => requireNode(key));
      break;
    case "pose_prop_change": {
      const actor = requireNode(recipe.actor, "image");
      requireNode(recipe.prop, "image");
      if (actor?.type === "image" && actor.states.length < 2)
        fail("Pose change requires at least two authored states");
      break;
    }
    case "crisis_fracture":
      recipe.paths.forEach((key) => requireNode(key, "path"));
      recipe.panels.forEach((key) => requireNode(key));
      requireNode(recipe.context, "text");
      break;
  }
});

export const PreparedAnimationResultSchema = z
  .object({
    schemaVersion: z.literal("illustrated-result-1"),
    status: z.literal("rendered"),
    preset: z.enum([
      "chronicle_reveal",
      "resource_flow",
      "access_pressure",
      "comparison_build",
      "pose_prop_change",
      "crisis_fracture",
    ]),
    fps: z.union([z.literal(24), z.literal(30)]),
    durationMs: number.int().positive(),
    frameCount: number.int().positive(),
    outputPath: z.string().min(1),
    sceneManifestPath: z.string().min(1),
    checksums: z
      .object({
        source: asset.shape.sha256,
        scene: asset.shape.sha256,
        output: asset.shape.sha256,
      })
      .strict(),
    metrics: z
      .object({
        frameCount: number.int().positive(),
        durationMs: number.int().positive(),
        format: OutputFormatSchema.optional(),
        width: number.int().positive(),
        height: number.int().positive(),
        totalWallMs: number.nonnegative(),
      })
      .passthrough(),
  })
  .strict()
  .superRefine((result, ctx) => {
    validatePreparedFormat(result.metrics, (message) =>
      ctx.addIssue({ code: "custom", message, path: ["metrics"] }),
    );
    if (
      result.frameCount !== (result.durationMs * result.fps) / 1000 ||
      result.metrics.frameCount !== result.frameCount ||
      result.metrics.durationMs !== result.durationMs
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Export frame count must match the explicit illustrated frame rate and duration",
      });
  });
