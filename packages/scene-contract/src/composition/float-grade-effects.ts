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
  extra: Partial<CompositionEffectDefinition> = {},
) =>
  defineCompositionEffect({
    version: "1.0.0",
    properties,
    preservesOpaque: true,
    ...(validateParams ? { validateParams } : {}),
    ...extra,
  });
const vec2 = (
  x: number,
  y: number,
  min: number,
  max: number,
): EffectProperty => ({
  type: "vec2",
  default: [x, y],
  min,
  max,
});
const flag = (value = 0) => scalar(value, 0, 1, true);
/** CG6: the most picked samples a sampled 3D key holds. */
export const GRADE_KEY_SAMPLES = 8;
/** CG6: `grade.key`'s optional external matte slot. */
export const GRADE_KEY_MATTE_SLOT = "matte";
/**
 * `grade.key` finesse and `invert` at their neutral values. They refine the
 * qualifier matte, so a key without a qualifier must leave them here.
 */
const KEY_FINESSE_NEUTRAL: Readonly<Record<string, number>> = {
  clipBlack: 0,
  clipWhite: 1,
  denoise: 0,
  cleanBlack: 0,
  cleanWhite: 0,
  shrinkGrow: 0,
  blur: 0,
  inOutRatio: 0,
  invert: 0,
};
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
  "grade.lut",
  "grade.key",
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
  /**
   * CG5: the pinned `.cube` LUT asset bound to the `lut` slot, from its
   * declared input space to its output space (both the working space).
   * Inputs are clamped to the table's domain (and the shaper's); 3D tables
   * interpolate tetrahedrally (`interpolation` 0, default) or trilinearly
   * (1). `intensity` mixes the result with the input; 0 drops the operator.
   */
  "grade.lut": effect(
    {
      intensity: scalar(1, 0, 1),
      interpolation: scalar(0, 0, 1, true),
    },
    undefined,
    { requiresAssets: { lut: "lut" } },
  ),
  /**
   * CG6: a key for the `grade.*` operations after it in its grade run, up to
   * the next `grade.key` or the end of the run, computed from the value
   * entering the key (the operations' input, never their output). Key =
   * clamp(gain · Q · W · G · M + offset, 0, 1): Q the qualifier (`qualifier`
   * 0 none, 1 HSL, 2 RGB, 3 luma, 4 sampled OKLab) after matte finesse and
   * `invert` (finesse and invert need a qualifier: without one, setting
   * them is an error); W the ellipse (1) or
   * rectangle (2) window, a layer mask in layer space; G the linear gradient;
   * M the optional `matte` layer (alpha 0 or luma 1, levels, invert; a depth
   * image or matte sequence is such a layer, read by luma). Each
   * pixel mixes input and result by the key; `view` 1–3 shows the key (gray,
   * highlight, high contrast) for preview, and export refuses a set view.
   * Every default selects everything (key 1).
   */
  "grade.key": effect(
    {
      qualifier: scalar(0, 0, 4, true),
      hueCenter: scalar(0, 0, 360),
      hueWidth: scalar(360, 0, 360),
      hueSoftness: scalar(0, 0, 180),
      saturationMin: scalar(0, 0, 1),
      saturationMax: scalar(1, 0, 1),
      saturationSoftness: scalar(0, 0, 1),
      luminanceMin: scalar(0, 0, 1),
      luminanceMax: scalar(1, 0, 1),
      luminanceSoftness: scalar(0, 0, 1),
      redMin: scalar(0, 0, 1),
      redMax: scalar(1, 0, 1),
      greenMin: scalar(0, 0, 1),
      greenMax: scalar(1, 0, 1),
      blueMin: scalar(0, 0, 1),
      blueMax: scalar(1, 0, 1),
      rgbSoftness: scalar(0, 0, 1),
      sampleCount: scalar(0, 0, GRADE_KEY_SAMPLES, true),
      ...Object.fromEntries(
        Array.from({ length: GRADE_KEY_SAMPLES }, (_, i) => [
          `sample${i + 1}`,
          { type: "color", default: "#808080" } as EffectProperty,
        ]),
      ),
      sampleRadius: scalar(0.05, 0, 1),
      sampleSoftness: scalar(0.05, 0, 1),
      clipBlack: scalar(0, 0, 1),
      clipWhite: scalar(1, 0, 1),
      denoise: scalar(0, 0, 8, true),
      cleanBlack: scalar(0, 0, 32, true),
      cleanWhite: scalar(0, 0, 32, true),
      shrinkGrow: scalar(0, -32, 32, true),
      blur: scalar(0, 0, 64),
      inOutRatio: scalar(0, -1, 1),
      invert: flag(),
      window: scalar(0, 0, 2, true),
      windowCenter: vec2(0, 0, -100000, 100000),
      windowSize: vec2(100, 100, 0, 100000),
      windowRotation: scalar(0, -3600, 3600),
      windowRoundness: scalar(0, 0, 100000),
      windowFeather: scalar(0, 0, 1000),
      windowExpansion: scalar(0, -1000, 1000),
      windowInvert: flag(),
      gradient: flag(),
      gradientStart: vec2(0, 0, -100000, 100000),
      gradientEnd: vec2(0, 100, -100000, 100000),
      matteMode: flag(),
      matteLow: scalar(0, 0, 1),
      matteHigh: scalar(1, 0, 1),
      matteInvert: flag(),
      gain: scalar(1, 0, 4),
      offset: scalar(0, -1, 1),
      view: scalar(0, 0, 3, true),
    },
    (params) => {
      if ((params.clipBlack as number) >= (params.clipWhite as number))
        throw Error("clipBlack must be below clipWhite");
      if (!params.qualifier) {
        const set = Object.entries(KEY_FINESSE_NEUTRAL).flatMap(([k, v]) =>
          params[k] !== undefined && params[k] !== v ? [k] : [],
        );
        if (set.length)
          throw Error(
            `${set.join(", ")} refine the qualifier matte and need a qualifier (qualifier is 0)`,
          );
      }
      if (params.matteLow === params.matteHigh)
        throw Error("matteLow and matteHigh must differ");
    },
    { usesLayerSpace: true, optionalLayers: [GRADE_KEY_MATTE_SLOT] },
  ),
};
