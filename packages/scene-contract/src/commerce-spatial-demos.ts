import { z } from "zod";
export const SpatialDemoKindSchema = z.enum([
  "anchor",
  "scale",
  "rotate",
  "attachment",
  "detail",
  "layout",
  "matte",
  "sequence",
]);
export const SpatialDemoSettingsSchema = z
  .object({
    scale: z.number().min(0.8).max(1.2).default(1.08),
    rotation: z.number().min(-8).max(8).default(3),
    anchor: z
      .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
      .default([0.5, 0.12]),
    invert: z.boolean().default(false),
    profile: z.enum(["feed", "square", "portrait"]).default("feed"),
  })
  .strict();
export const SPATIAL_DEMOS = [
  {
    id: "anchor",
    name: "Product Anchor",
    group: "Geometry",
    description: "An authored point stays on the intact product as it moves.",
  },
  {
    id: "scale",
    name: "Uniform Scale",
    group: "Motion",
    description:
      "A gentle push-in around a fixed pivot, preserving product proportions.",
  },
  {
    id: "rotate",
    name: "Rotate",
    group: "Motion",
    description: "A small two-dimensional tilt around the product’s base.",
  },
  {
    id: "attachment",
    name: "Following Callout",
    group: "Composition",
    description: "The label stays still while its connector follows the cap.",
  },
  {
    id: "detail",
    name: "Detail Window",
    group: "Composition",
    description:
      "A closer look at the same source pixels, alongside the complete product.",
  },
  {
    id: "layout",
    name: "Measured Layout",
    group: "Layout",
    description:
      "Supplied copy fits a bounded type size; the panel follows its measured height.",
  },
  {
    id: "matte",
    name: "Alpha Matte",
    group: "Compositing",
    description:
      "An independently moving soft mask controls the product’s visibility.",
  },
  {
    id: "sequence",
    name: "Sequence",
    group: "Timing",
    description:
      "Introduction, feature hold and closing message share one explicit timeline.",
  },
] as const;
