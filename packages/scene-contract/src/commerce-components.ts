import {
  SpatialDemoKindSchema,
  SpatialDemoSettingsSchema,
  SPATIAL_DEMOS,
} from "./commerce-spatial-demos.ts";
import {
  EffectDemoKindSchema,
  EffectDemoSettingsSchema,
  EFFECT_DEMOS,
} from "./commerce-effects.ts";
import { z } from "zod";
const finite = z.number().finite();
export const ComponentDemoKindSchema = z.enum([
  "product",
  "background",
  "shadow",
  "panel",
  "text",
  "path",
  "float",
  "translate",
  "fade",
  "studio",
  "introduction",
  "callout",
  ...EffectDemoKindSchema.options,
  ...SpatialDemoKindSchema.options,
]);
export type ComponentDemoKind = z.infer<typeof ComponentDemoKindSchema>;
export const ComponentDemoSchema = z
  .object({
    schemaVersion: z.literal("commerce-component-demo-1"),
    kind: ComponentDemoKindSchema,
    fps: z.union([z.literal(24), z.literal(30)]),
    frameCount: finite.int().min(72).max(1800),
    background: z.string().regex(/^#[\da-fA-F]{6}$/),
    product: z
      .object({ x: finite, y: finite, width: finite.positive().max(1080) })
      .strict(),
    shadow: z
      .object({
        x: finite,
        y: finite,
        width: finite.positive().max(1080),
        height: finite.positive().max(600),
        opacity: finite.min(0).max(1),
        softness: finite.min(0.05).max(1),
        color: z.string().regex(/^#[\da-fA-F]{6}$/),
      })
      .strict(),
    travel: finite.min(0).max(100),
    cycles: finite.int().min(1).max(8),
    text: z.string().min(1).max(500),
    locale: z.enum(["en", "th"]),
    treatment: EffectDemoSettingsSchema.optional(),
    spatial: SpatialDemoSettingsSchema.optional(),
  })
  .strict()
  .superRefine((options, ctx) => {
    if (options.frameCount < options.fps * 4)
      ctx.addIssue({
        code: "custom",
        message: "Component demos require at least four seconds",
        path: ["frameCount"],
      });
  });
export type ComponentDemo = z.infer<typeof ComponentDemoSchema>;
export const COMPONENT_DEMOS: {
  id: ComponentDemoKind;
  name: string;
  group: string;
  description: string;
}[] = [
  {
    id: "product",
    name: "Product Layer",
    group: "Visual",
    description: "The approved image, intact and still.",
  },
  {
    id: "background",
    name: "Background",
    group: "Visual",
    description: "A quiet field behind the product.",
  },
  {
    id: "shadow",
    name: "Product Shadow",
    group: "Visual",
    description: "A separate soft ellipse on a flat surface.",
  },
  {
    id: "panel",
    name: "Panel",
    group: "Visual",
    description: "A simple surface for supplied information.",
  },
  {
    id: "text",
    name: "Text Block",
    group: "Visual",
    description: "Supplied words, measured with a pinned font.",
  },
  {
    id: "path",
    name: "Path + Draw",
    group: "Visual + motion",
    description: "A connector drawn between explicit points.",
  },
  {
    id: "float",
    name: "Float",
    group: "Motion",
    description: "Only the product’s vertical position changes.",
  },
  {
    id: "translate",
    name: "Translate",
    group: "Motion",
    description: "One rigid entrance, then a quiet hold.",
  },
  {
    id: "fade",
    name: "Fade",
    group: "Motion",
    description: "A gradual appearance and disappearance.",
  },
  {
    id: "studio",
    name: "Studio Float",
    group: "Composition",
    description: "Product + float + a stationary soft shadow.",
  },
  {
    id: "introduction",
    name: "Product Introduction",
    group: "Composition",
    description: "Product entrance, supplied message, reading hold.",
  },
  {
    id: "callout",
    name: "Visible-detail Callout",
    group: "Composition",
    description: "A settled product and a label attached to its cap.",
  },
];
COMPONENT_DEMOS.push(...EFFECT_DEMOS, ...SPATIAL_DEMOS);

export function defaultComponentDemo(kind: ComponentDemoKind): ComponentDemo {
  return {
    ...(EffectDemoKindSchema.safeParse(kind).success
      ? { treatment: EffectDemoSettingsSchema.parse({}) }
      : {}),
    ...(SpatialDemoKindSchema.safeParse(kind).success
      ? { spatial: SpatialDemoSettingsSchema.parse({}) }
      : {}),
    schemaVersion: "commerce-component-demo-1",
    kind,
    fps: 30,
    frameCount: 240,
    background: "#F2EDE3",
    product:
      kind === "detail"
        ? { x: 60, y: 280, width: 600 }
        : { x: 240, y: 220, width: 600 },
    shadow: {
      x: 540,
      y: 996,
      width: 250,
      height: 62,
      opacity: 0.18,
      softness: 0.9,
      color: "#32271F",
    },
    travel: 18,
    cycles: 2,
    text: ["callout", "attachment"].includes(kind)
      ? "Attached\ncap"
      : kind === "detail"
        ? "The original.\nUp close."
        : kind === "layout"
          ? "SAMPLE 01.\nA considered daily ritual."
          : "Meet SAMPLE 01.",
    locale: "en",
  };
}
