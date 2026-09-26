import { z } from "zod";
import {
  PreparedSceneFieldsSchema,
  PreparedAnimationResultSchema,
  PreparedFontSchema,
  validatePreparedGraph,
} from "./prepared.ts";
import {
  CommercePresetSchema,
  CommerceProfileSchema,
  CommerceSelectionSchema,
} from "./commerce-catalog.ts";
import { MotionEasingSchema } from "./motion-easing.ts";

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const text = z.string().trim().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const unit = finite.min(0).max(1);
const region = z
  .tuple([unit, unit, unit.positive(), unit.positive()])
  .refine(
    ([x, y, width, height]) => x + width <= 1 && y + height <= 1,
    "Protected region must fit the source image",
  );
export const COMMERCE_PROFILES = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  feed: { width: 1080, height: 1350 },
} as const;

export const CommerceBriefSchema = z
  .object({
    schemaVersion: z.literal("commerce-brief-1"),
    catalogVersion: z.literal("1.0"),
    selection: CommerceSelectionSchema,
    title: text.max(160),
    locale: z.enum(["en", "th"]),
    product: z
      .object({
        id: text,
        name: text.max(80),
        imagePath: text,
        preparation: z.enum(["photo", "cutout"]),
        provenance: text,
        protectedRegion: region,
      })
      .strict(),
    copy: z
      .object({
        headlines: z.array(text.max(300)).min(1).max(3),
        cta: text.max(120),
        source: text,
        callouts: z
          .array(
            z
              .object({
                text: text.max(180),
                target: z.tuple([unit, unit]),
                source: text,
              })
              .strict(),
          )
          .max(2)
          .default([]),
      })
      .strict(),
    profile: CommerceProfileSchema,
    artDirection: z
      .enum(["standard", "editorial", "studio"])
      .default("standard"),
    fps: z.union([z.literal(24), z.literal(30)]),
    frameCount: frame.positive().max(108000),
    safeInset: finite.min(0.03).max(0.1).default(0.055),
    theme: z
      .object({ background: color, ink: color, accent: color, muted: color })
      .strict()
      .default({
        background: "#F2EDE4",
        ink: "#243E35",
        accent: "#C75B39",
        muted: "#656D62",
      }),
    timing: z
      .object({
        entranceEnd: frame.positive(),
        bodyStart: frame.positive(),
        closeStart: frame.positive(),
        closeEnd: frame.positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((brief, ctx) => {
    if (brief.frameCount < brief.fps * 6)
      ctx.addIssue({
        code: "custom",
        message:
          "Commerce scenes need at least six seconds for entrance and reading holds",
      });
  });
export type CommerceBrief = z.infer<typeof CommerceBriefSchema>;
export const CommerceEventSchema = z
  .object({
    node: text,
    property: z.enum([
      "x",
      "y",
      "scaleX",
      "scaleY",
      "rotation",
      "opacity",
      "reveal",
    ]),
    start: frame,
    end: frame,
    from: finite.optional(),
    to: finite,
    easing: MotionEasingSchema.default("out-cubic"),
  })
  .strict();
export type CommerceEvent = z.infer<typeof CommerceEventSchema>;
const shape = PreparedSceneFieldsSchema.omit({
  durationMs: true,
  width: true,
  height: true,
})
  .extend({
    schemaVersion: z.literal("commerce-scene-1"),
    width: finite.int().positive(),
    height: finite.int().positive(),
    fonts: z.array(PreparedFontSchema).min(1).max(12),
    frameCount: frame.positive().max(108000),
    recipe: z.object({ preset: CommercePresetSchema }).strict(),
    events: z.array(CommerceEventSchema).min(1).max(100),
    metadata: z
      .object({
        catalogVersion: z.literal("1.0"),
        selection: CommerceSelectionSchema,
        profile: CommerceProfileSchema,
        productId: text,
        productSource: text,
        copySource: text,
        claimSources: z.array(text),
        locale: z.enum(["en", "th"]),
        protectedRegion: z.tuple([
          finite,
          finite,
          finite.positive(),
          finite.positive(),
        ]),
      })
      .strict(),
  })
  .strict();
export type CommerceScene = z.infer<typeof shape>;
export type PreparedCommerceAssets = {
  product: CommerceScene["assets"][number];
  font: z.infer<typeof PreparedFontSchema>;
};
export const CommerceSceneSchema = shape.superRefine((scene, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const { nodes } = validatePreparedGraph(scene, fail);
  const profile = COMMERCE_PROFILES[scene.metadata.profile];
  if (scene.width !== profile.width || scene.height !== profile.height)
    fail("Commerce output dimensions must match the layout profile");
  if (scene.metadata.selection.id !== scene.recipe.preset)
    fail("Commerce recipe must match the selected catalog entry");
  if (
    (scene.recipe.preset === "A01") !==
    (scene.metadata.selection.kind === "recipe")
  )
    fail("Commerce selection kind does not match the preset");
  for (const node of scene.nodes) {
    if (node.type === "text" && (!node.fontAsset || !node.textBox))
      fail("Commerce text requires a pinned font and measured text box");
    if (node.type === "text" && (node.width <= 0 || node.height <= 0))
      fail("Commerce text boxes need positive dimensions");
  }
  for (const event of scene.events) {
    if (!nodes.has(event.node)) fail("Missing event node " + event.node);
    if (event.end <= event.start || event.end >= scene.frameCount)
      fail("Commerce events must finish inside the rendered timeline");
    const values = [
      event.to,
      ...(event.from === undefined ? [] : [event.from]),
    ];
    if (
      ["opacity", "reveal"].includes(event.property) &&
      values.some((n) => n < 0 || n > 1)
    )
      fail("Opacity and reveal must be between zero and one");
    if (
      event.property.startsWith("scale") &&
      values.some((n) => n <= 0 || n > 4)
    )
      fail("Commerce scale is outside supported bounds");
  }
});
export const CommerceAnimationResultSchema = z
  .object({
    ...PreparedAnimationResultSchema.shape,
    schemaVersion: z.literal("commerce-result-1"),
    preset: CommercePresetSchema,
    durationMs: finite.positive(),
    metrics: PreparedAnimationResultSchema.shape.metrics.extend({
      durationMs: finite.positive(),
      width: finite.int().positive(),
      height: finite.int().positive(),
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
        message: "Commerce export must match authoritative frame count",
      });
  });
