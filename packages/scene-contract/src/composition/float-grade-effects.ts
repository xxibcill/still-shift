import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectProperty,
} from "./effect-definition.ts";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
} from "./grade-effects.ts";

const scalar = (
  value: number,
  min: number,
  max: number,
  integer = false,
): EffectProperty => ({
  type: "scalar",
  default: value,
  min,
  max,
  ...(integer ? { integer: true } : {}),
});
const effect = (
  properties: Record<string, EffectProperty>,
  validateParams?: CompositionEffectDefinition["validateParams"],
) =>
  defineCompositionEffect({
    version: "1.0.0",
    properties,
    preservesOpaque: true,
    ...(validateParams ? { validateParams } : {}),
  });
const curve = (
  defaultPoints: readonly (readonly [number, number])[],
): EffectProperty => ({ type: "curve", default: defaultPoints });
const IDENTITY_CURVE = [
  [0, 0],
  [1, 1],
] as const;
const FLAT_CURVE = [
  [0, 0.5],
  [1, 0.5],
] as const;
/** CG4: hue-indexed curves are periodic; their two ends are one point. */
export const PERIODIC_GRADE_CURVES = ["hueVsHue", "hueVsSat", "hueVsLum"];
const channels = (
  name: string,
  value: number,
  min: number,
  max: number,
  master = true,
) =>
  Object.fromEntries(
    [...["R", "G", "B"], ...(master ? ["Master"] : [])].map((suffix) => [
      `${name}${suffix}`,
      scalar(value, min, max),
    ]),
  );

/**
 * CG2 float grade operators. A run of consecutive `grade.*` effects on a layer
 * is evaluated unclamped in floating point (WebGL float32, Canvas float64 from
 * @still-shift/color-science) on straight color and quantized once on exit.
 * The working space is encoded sRGB (as `color.*`); white balance adapts in
 * linear light. Neutral settings leave pixels unchanged.
 */
export const FLOAT_GRADE_EFFECT_IDS = [
  "grade.primary",
  "grade.white-balance",
  "grade.cdl",
  "grade.rgb-mixer",
  "grade.curves",
  "grade.hue-curves",
  "grade.tonal",
] as const;
export type FloatGradeEffectId = (typeof FLOAT_GRADE_EFFECT_IDS)[number];
export const isFloatGradeEffect = (id: string): id is FloatGradeEffectId =>
  (FLOAT_GRADE_EFFECT_IDS as readonly string[]).includes(id);

export const FLOAT_GRADE_EFFECT_DEFINITIONS: Readonly<
  Record<FloatGradeEffectId, CompositionEffectDefinition>
> = {
  /**
   * Per channel (master combined: lift and offset add, gamma and gain
   * multiply): v + lift·(1 − v) → v^(1/gamma) (negatives unchanged) → ·gain →
   * +offset → contrast about pivot → shadows/highlights → saturation → hue →
   * color boost.
   */
  "grade.primary": effect({
    ...channels("lift", 0, -1, 1),
    ...channels("gamma", 1, 0.1, 10),
    ...channels("gain", 1, 0, 16),
    ...channels("offset", 0, -1, 1),
    contrast: scalar(1, 0, 4),
    pivot: scalar(0.5, 0, 1),
    saturation: scalar(1, 0, 4),
    hue: scalar(0, -180, 180),
    colorBoost: scalar(0, -1, 1),
    shadows: scalar(0, -1, 1),
    highlights: scalar(0, -1, 1),
  }),
  /**
   * Chromatic adaptation (Bradford) in linear light from the stated
   * illuminant to D65, BT.709's white: temperature in kelvin on the Planckian
   * locus, tint as Duv/5000 (positive greener) from a tint-0 line that keeps
   * D65's offset above the locus, so 6500 K with tint 0 is D65 (identity).
   */
  "grade.white-balance": effect({
    temperature: scalar(6500, 1667, 25000),
    tint: scalar(0, -100, 100),
  }),
  /**
   * ASC CDL; `clamp` 0 (default) is the unclamped style, so the default is
   * neutral inside a run; 1 is Release 1.2 (clamped to 0–1).
   */
  "grade.cdl": effect({
    ...channels("slope", 1, 0, 8, false),
    ...channels("offset", 0, -1, 1, false),
    ...channels("power", 1, 0.1, 8, false),
    saturation: scalar(1, 0, 4),
    clamp: scalar(0, 0, 1, true),
  }),
  /** `color.matrix`'s parameters and design formula, evaluated in float. */
  "grade.rgb-mixer": effect({
    ...Object.fromEntries(
      COLOR_MATRIX_COEFFICIENTS.flatMap((row, output) =>
        row.map((name, input) => [
          name,
          scalar(output === input ? 1 : 0, -4, 4),
        ]),
      ),
    ),
    ...Object.fromEntries(
      COLOR_MATRIX_OFFSETS.map((name) => [name, scalar(0, -1, 1)]),
    ),
    strength: scalar(1, 0, 1),
  }),
  /**
   * CG4: monotone cubic (PCHIP) curves, per channel then master; `lumaMix`
   * moves the master curve from every channel (0) to luma only (1, chroma
   * kept). Identity curves leave pixels unchanged.
   */
  "grade.curves": effect({
    master: curve(IDENTITY_CURVE),
    red: curve(IDENTITY_CURVE),
    green: curve(IDENTITY_CURVE),
    blue: curve(IDENTITY_CURVE),
    lumaMix: scalar(0, 0, 1),
  }),
  /**
   * CG4: curves over hue (vectorscope angle, periodic), luma and saturation
   * (chroma radius / 0.5), in BT.709 Y′CbCr. y = 0.5 is neutral: hue vs hue
   * rotates by (y − 0.5) turns, the saturation curves multiply chroma by 2y,
   * the luma curves add (y − 0.5)·0.5. Each changes only its own dimension.
   */
  "grade.hue-curves": effect(
    {
      hueVsHue: curve(FLAT_CURVE),
      hueVsSat: curve(FLAT_CURVE),
      hueVsLum: curve(FLAT_CURVE),
      lumVsSat: curve(FLAT_CURVE),
      satVsSat: curve(FLAT_CURVE),
      satVsLum: curve(FLAT_CURVE),
    },
    (params) => {
      for (const key of PERIODIC_GRADE_CURVES) {
        const points = params[key] as readonly (readonly number[])[];
        if (points[0]![1] !== points.at(-1)![1])
          throw Error(
            `${key} is periodic: its points at x = 0 and x = 1 must have the same y`,
          );
      }
    },
  ),
  /**
   * CG4: shadow/midtone/highlight color offsets and exposure (stops) weighted
   * by luma with movable boundaries and smooth falloff, then high and low soft
   * clip (knee 1 and 0 are off).
   */
  "grade.tonal": effect(
    {
      ...channels("shadow", 0, -1, 1, false),
      ...channels("mid", 0, -1, 1, false),
      ...channels("highlight", 0, -1, 1, false),
      shadowExposure: scalar(0, -4, 4),
      midExposure: scalar(0, -4, 4),
      highlightExposure: scalar(0, -4, 4),
      shadowEnd: scalar(0.33, 0, 1),
      highlightStart: scalar(0.66, 0, 1),
      falloff: scalar(0.15, 0.01, 0.5),
      softClipHigh: scalar(1, 0.5, 1),
      softClipLow: scalar(0, 0, 0.5),
    },
    (params) => {
      if ((params.shadowEnd as number) > (params.highlightStart as number))
        throw Error("shadowEnd must not be above highlightStart");
    },
  ),
};
