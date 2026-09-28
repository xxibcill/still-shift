import { z } from "zod";
import { ScalarCurveSchema, layerFields } from "./motion-craft.ts";
import { CurveEasingSchema } from "./motion-easing.ts";
import { NarrationTimingSchema } from "./narration-timing.ts";

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const FontAxisSchema = z
  .object({ min: finite, default: finite, max: finite })
  .strict()
  .refine(
    (a) => a.min <= a.default && a.default <= a.max,
    "Invalid font axis range",
  );
export const FontAxesSchema = z.record(
  z.string().regex(/^[A-Za-z0-9]{4}$/),
  FontAxisSchema,
);
export const TextStyleSchema = z
  .object({
    fontAsset: id.optional(),
    size: finite.min(16).max(640).optional(),
    tracking: finite.min(-500).max(2000).optional(),
    leading: finite.min(0.5).max(4).optional(),
    case: z.enum(["none", "upper", "lower", "small-caps"]).optional(),
    figures: z
      .union([
        z.enum(["proportional", "tabular"]),
        z
          .object({
            spacing: z.enum(["proportional", "tabular"]),
            style: z.enum(["lining", "oldstyle"]).optional(),
          })
          .strict(),
      ])
      .optional(),
    features: z
      .record(
        z
          .string()
          .regex(
            /^(kern|liga|clig|calt|case|smcp|c2sc|tnum|pnum|lnum|onum|ss0[1-9]|ss1[0-9]|ss20)$/,
          ),
        finite.int().min(0).max(99),
      )
      .optional(),
    axes: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/), finite).optional(),
    opticalTracking: z.boolean().optional(),
  })
  .strict();
export const TextSpanSchema = z
  .object({
    id: id.optional(),
    start: frame,
    end: frame.positive(),
    style: id.optional(),
    color: color.optional(),
  })
  .strict()
  .refine((s) => s.end > s.start, "Text span end must exceed start");
export const TextDecorationSchema = z
  .object({
    span: id.optional(),
    kind: z.enum(["underline", "strike", "highlight", "box"]),
    color,
    thickness: finite.positive().max(1280).optional(),
    offset: finite.optional(),
    lineStyle: z.enum(["uniform", "ink", "brush"]).optional(),
    reveal: ScalarCurveSchema.optional(),
  })
  .strict();
export const TextTransitionSchema = z
  .object({
    kind: z.enum(["cut", "crossfade", "roll", "retype", "count"]),
    window: z
      .object({ start: frame, end: frame })
      .strict()
      .refine(
        (w) => w.end > w.start,
        "Text transition needs positive duration",
      ),
    easing: CurveEasingSchema.optional(),
    caret: z.boolean().optional(),
    stagger: frame.max(120).optional(),
    fromState: frame.optional(),
    toState: frame.optional(),
    decimals: frame.max(6).optional(),
  })
  .strict();
export const NarrationWordAnchorSchema = z
  .object({
    narrationWord: z.union([
      z.string().trim().min(1),
      z.object({ segment: frame, index: frame }).strict(),
    ]),
    occurrence: frame.positive().optional(),
    offset: finite.int().optional(),
  })
  .strict();
export const TextEventSchema = z
  .object({
    id: id.optional(),
    node: id,
    verb: z.enum([
      "reveal",
      "emphasize",
      "correct",
      "qualify",
      "retype",
      "count",
      "redact",
      "release",
    ]),
    span: id.optional(),
    target: id.optional(),
    replacement: z.string().min(1).optional(),
    manner: z
      .enum(["weight", "color", "underline", "highlight", "compress", "expand"])
      .optional(),
    color: color.optional(),
    amount: finite.optional(),
    signal: id.optional(),
    at: z.union([frame, NarrationWordAnchorSchema]),
    duration: frame.positive(),
    ...layerFields,
  })
  .strict();
export const typographyNodeFields = {
  style: id.optional(),
  spans: z.array(TextSpanSchema).max(128).optional(),
  locale: z.string().min(2).max(35).optional(),
  anchor: z.enum(["top", "cap", "baseline"]).optional(),
  wrap: z.enum(["greedy", "balance", "pretty"]).optional(),
  orphanFraction: finite.min(0).max(0.5).optional(),
  decorations: z.array(TextDecorationSchema).max(40).optional(),
  transition: TextTransitionSchema.optional(),
  transitions: z.array(TextTransitionSchema).max(40).optional(),
  feather: finite.min(0).max(2).optional(),
  lineOverlap: finite.min(0).max(1).optional(),
};
export const typographySceneFields = {
  typography: z.literal("type-1").optional(),
  textStyles: z.record(id, TextStyleSchema).optional(),
  textEvents: z.array(TextEventSchema).max(100).optional(),
  narrationTiming: NarrationTimingSchema.optional(),
};
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type TextSpan = z.infer<typeof TextSpanSchema>;
export type TextDecoration = z.infer<typeof TextDecorationSchema>;
export type TextTransition = z.infer<typeof TextTransitionSchema>;
export type TextEvent = z.infer<typeof TextEventSchema>;
export type NarrationWordAnchor = z.infer<typeof NarrationWordAnchorSchema>;
export type FontAxes = z.infer<typeof FontAxesSchema>;
export const tabularFigures = (style?: TextStyle) =>
  style?.figures === "tabular" ||
  (typeof style?.figures === "object" && style.figures.spacing === "tabular");
