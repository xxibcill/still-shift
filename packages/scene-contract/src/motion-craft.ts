import { z } from "zod";
import { CurveEasingSchema } from "./motion-easing.ts";

const finite = z.number().finite();
const frame = finite.int().nonnegative();
const unit = finite.min(0).max(1);
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const pair = z.tuple([finite, finite]);
export const MotionLayerSchema = z.enum([
  "action",
  "response",
  "current",
  "carrier",
]);
export const MotionBlendSchema = z.enum(["replace", "add", "multiply"]);
export const TemporalHandleSchema = z
  .object({ ease: unit, speed: finite.optional() })
  .strict();
export const curveFields = {
  easing: CurveEasingSchema.optional(),
  smooth: z.boolean().optional(),
  interpolation: z
    .enum(["hold", "linear", "ease", "bezier", "smooth"])
    .optional(),
  bezier: z.tuple([unit, finite, unit, finite]).optional(),
  in: TemporalHandleSchema.optional(),
  out: TemporalHandleSchema.optional(),
};
export const ScalarKeySchema = z
  .object({ frame, value: finite, ...curveFields })
  .strict();
export const ScalarCurveSchema = z
  .array(ScalarKeySchema)
  .min(2)
  .max(100)
  .superRefine((keys, ctx) => {
    keys.forEach((key, i) => {
      if (i && key.frame <= keys[i - 1]!.frame)
        ctx.addIssue({
          code: "custom",
          path: [i, "frame"],
          message: "motion-key-order: key frames must increase",
        });
      if (
        (key.smooth || key.interpolation === "smooth") &&
        (!i || i === keys.length - 1)
      )
        ctx.addIssue({
          code: "custom",
          path: [i, "smooth"],
          message: "motion-smooth-neighbors: smooth keys require neighbors",
        });
      if (key.interpolation === "bezier" && !key.bezier)
        ctx.addIssue({
          code: "custom",
          path: [i, "bezier"],
          message:
            "motion-bezier-handles: bezier interpolation requires handles",
        });
    });
  });
export const layerFields = {
  layer: MotionLayerSchema.optional(),
  blend: MotionBlendSchema.optional(),
  weight: ScalarCurveSchema.refine(
    (keys) => keys.every((k) => k.value >= 0 && k.value <= 1),
    "motion-weight-range: weights must be between 0 and 1",
  ).optional(),
};
export const OscillatorSchema = z
  .object({
    period: frame.positive(),
    amplitude: finite,
    phase: finite.optional(),
  })
  .strict();
export const NoiseSchema = z
  .object({
    seed: finite.int().min(0).max(2147483647),
    period: frame.positive(),
    amplitude: finite,
  })
  .strict();
export const NumericMotionPropertySchema = z.enum([
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "reveal",
  "gap",
  "pulse",
  "pinch",
  "strokeWidth",
  "trimStart",
  "trimEnd",
  "trimOffset",
  "blur",
  "skewX",
  "skewY",
  "anchorX",
  "anchorY",
]);
export type NumericMotionProperty = z.infer<typeof NumericMotionPropertySchema>;
export const MotionTargetSchema = z
  .string()
  .regex(
    /^[a-zA-Z][\w-]*\.(x|y|scaleX|scaleY|rotation|opacity|reveal|gap|pulse|pinch|strokeWidth|trimStart|trimEnd|trimOffset|blur|skewX|skewY|anchorX|anchorY)$/,
  );
export const SignalSchema = z
  .object({
    id,
    cue: id.optional(),
    keys: ScalarCurveSchema,
    add: z
      .array(
        z.union([
          z
            .object({
              pulse: z
                .object({ at: frame, half: frame.positive(), depth: finite })
                .strict(),
            })
            .strict(),
          z.object({ oscillate: OscillatorSchema }).strict(),
          z.object({ noise: NoiseSchema }).strict(),
        ]),
      )
      .max(40)
      .optional(),
  })
  .strict();
export const DriverMapSchema = z
  .object({
    offset: finite.optional(),
    scale: finite.optional(),
    range: pair.optional(),
    to: pair.optional(),
    easing: CurveEasingSchema.optional(),
    clamp: pair.optional(),
    step: finite.positive().optional(),
    delay: frame.optional(),
    lag: finite.positive().max(300).optional(),
  })
  .strict()
  .superRefine((map, ctx) => {
    if (
      !!map.range !== !!map.to ||
      (map.range && map.range[0] === map.range[1]) ||
      (map.clamp && map.clamp[0] > map.clamp[1])
    )
      ctx.addIssue({
        code: "custom",
        message:
          "motion-range: range needs distinct endpoints and a to pair; clamp must be ordered",
      });
  });
export const DriverSchema = z
  .object({
    target: MotionTargetSchema,
    signal: id.optional(),
    source: MotionTargetSchema.optional(),
    sum: z
      .array(z.union([id, MotionTargetSchema]))
      .min(1)
      .max(16)
      .optional(),
    map: DriverMapSchema.optional(),
    ...layerFields,
  })
  .strict()
  .refine(
    (d) =>
      [d.signal, d.source, d.sum].filter((v) => v !== undefined).length === 1,
    "motion-source: driver needs exactly one of signal, source, sum",
  );
const point = z.tuple([unit, unit]);
const constraintFields = { target: id, ...layerFields };
export const ConstraintSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("attach"),
      ...constraintFields,
      anchor: id,
      point: point.optional(),
      offset: pair.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("contact"),
      ...constraintFields,
      surface: id,
      point,
      edge: z.enum(["top", "bottom", "left", "right"]).optional(),
      solve: z
        .array(z.enum(["x", "y", "scaleX", "scaleY", "rotation"]))
        .min(1)
        .max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("look-at"),
      ...constraintFields,
      toward: id,
      offset: finite.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("follow-path"),
      ...constraintFields,
      path: id,
      progress: id,
      orient: z.literal("tangent").optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("keep-in-safe-area"),
      ...constraintFields,
      inset: finite.nonnegative(),
      clamp: z.boolean().optional(),
    })
    .strict(),
]);
export const PeriodicMotionSchema = z
  .object({
    node: id,
    property: NumericMotionPropertySchema,
    start: frame,
    end: frame,
    cue: id.optional(),
    oscillate: OscillatorSchema.optional(),
    noise: NoiseSchema.optional(),
    ...layerFields,
  })
  .strict()
  .refine(
    (m) => m.end > m.start && !!m.oscillate !== !!m.noise,
    "motion-periodic: needs a positive window and exactly one generator",
  );
export const IntentPresetSchema = z
  .object({
    schemaVersion: z.literal("story-motion-presets-1"),
    motions: z
      .array(
        z
          .object({
            preset: z.enum([
              "settle",
              "press",
              "recoil",
              "handoff",
              "breathe",
              "draw-on",
              "land",
            ]),
            node: id,
            property: NumericMotionPropertySchema.optional(),
            amount: finite.optional(),
            window: z
              .object({ start: frame, end: frame, cue: id.optional() })
              .strict()
              .refine(
                (w) => w.end > w.start,
                "Intent window must have positive duration",
              ),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type IntentPresets = z.infer<typeof IntentPresetSchema>;
export const SemanticCheckSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("stable-anchors"),
      nodes: z.array(id).min(1).max(40),
    })
    .strict(),
  z
    .object({
      type: z.literal("clearance"),
      path: id,
      sides: z.tuple([id, id]),
      minimum: finite.nonnegative(),
    })
    .strict(),
]);
export const motionCraftFields = {
  checks: z.array(SemanticCheckSchema).max(40).optional(),
  intentPresets: IntentPresetSchema.optional(),
  motionModel: z.literal("curves-1").optional(),
  entranceProfile: z.literal("accelerate").optional(),
  signals: z.array(SignalSchema).max(100).optional(),
  drivers: z.array(DriverSchema).max(200).optional(),
  constraints: z.array(ConstraintSchema).max(100).optional(),
  periodic: z.array(PeriodicMotionSchema).max(100).optional(),
};
export type MotionLayer = z.infer<typeof MotionLayerSchema>;
export type MotionBlend = z.infer<typeof MotionBlendSchema>;
export type ScalarKey = z.infer<typeof ScalarKeySchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Driver = z.infer<typeof DriverSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type PeriodicMotion = z.infer<typeof PeriodicMotionSchema>;

const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const xy = z.tuple([finite, finite]);
export const spatialFields = {
  spatialIn: xy.optional(),
  spatialOut: xy.optional(),
};
export const paintFields = {
  fill: color.optional(),
  stroke: color.optional(),
  color: color.optional(),
};
export const SpatialPathSchema = z
  .object({
    node: id,
    segments: z
      .array(z.tuple([xy, xy, xy, xy]))
      .min(1)
      .max(64),
  })
  .strict();
export const PathMorphSchema = z
  .object({
    node: id,
    keys: z
      .array(
        z
          .object({
            frame,
            points: z.array(xy).min(2).max(256),
            easing: CurveEasingSchema.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(40),
  })
  .strict()
  .superRefine((m, ctx) => {
    m.keys.forEach((key, i) => {
      if (key.points.length !== m.keys[0]!.points.length)
        ctx.addIssue({
          code: "custom",
          path: ["keys", i, "points"],
          message: "motion-morph-count: point counts must match",
        });
      if (i && key.frame <= m.keys[i - 1]!.frame)
        ctx.addIssue({
          code: "custom",
          path: ["keys", i, "frame"],
          message: "motion-key-order: key frames must increase",
        });
    });
  });
export const TextAnimatorSchema = z
  .object({
    node: id,
    unit: z.enum(["line", "word", "glyph"]),
    start: frame,
    end: frame,
    stagger: frame.max(120),
    selector: z
      .object({
        start: unit,
        end: unit,
        offset: finite.min(-1).max(1).optional(),
        shape: z.enum(["square", "ramp", "triangle"]).optional(),
        easing: CurveEasingSchema.optional(),
      })
      .strict(),
    from: z
      .object({
        opacity: unit.optional(),
        offset: xy.optional(),
        scale: finite.positive().max(4).optional(),
        rotation: finite.optional(),
        blur: finite.min(0).max(40).optional(),
        color: color.optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (a) => a.end > a.start && a.selector.end >= a.selector.start,
    "motion-text-range: invalid animator range",
  );
export const motionAppearanceFields = {
  spatialPaths: z.array(SpatialPathSchema).max(40).optional(),
  pathMorphs: z.array(PathMorphSchema).max(40).optional(),
  textAnimators: z.array(TextAnimatorSchema).max(40).optional(),
};
export type SpatialPath = z.infer<typeof SpatialPathSchema>;
export type TextAnimator = z.infer<typeof TextAnimatorSchema>;
