/**
 * CGA2: the grade engine for automatic color. The adaptive solver's stages
 * keep their tuned logic and emit CGA's 8-bit corrections internally; under
 * the grade engine each one is translated to the float `grade.*` operator
 * that does the same job, so the whole correction is one unclamped run,
 * quantized once on exit:
 *
 * - `color.white-balance` (linear-light channel gains) → `grade.curves`
 *   red/green/blue curves that apply the same gains (within one code value),
 *   because solver 2 must match CGA's renders before changes that move the
 *   look land (owner decision 2, 2026-11-23). Bradford adaptation
 *   (`grade.white-balance`) moves saturated colors and is A4 work.
 * - `color.levels` (input black/white, gamma) → `grade.cdl` (unclamped): the
 *   same curve inside 0–1, without clipping outside it.
 * - `color.curves` (the S-curve) → `grade.curves` master through the same
 *   points plus guard points around each kink (`piecewiseCurve`), so the
 *   monotone spline (PCHIP) keeps CGA's straight segments within one code.
 * - `color.vibrance` → `grade.primary` `colorBoost` (the same low-saturation
 *   weighting) behind a `grade.key` that holds skin hues back. Vibrance's
 *   factor 1 + v·(1 − sat)·(1 − protect·skin) is exactly a mix of the boosted
 *   and the unboosted pixel by 1 − protect·skin, and the key's HSL hue range
 *   (centre 25°, width 0, softness 25°, inverted, gain protect, offset
 *   1 − protect) is that weight: `1 − smoothstep(0, 25, |h − 25|)` equals
 *   `vibranceSkinWeight`. The qualifier reads only the pixel's own value (no
 *   window, matte or finesse), so the key is pointwise. A hue-vs-saturation
 *   curve was the first choice (owner decision 3, 2026-11-23) and was
 *   replaced: one chroma factor per hue also desaturates strong skin-hued
 *   colors that vibrance leaves alone (up to 26 codes on a saturated orange).
 * - `color.matrix` (a look) → `grade.rgb-mixer` (the same parameters and
 *   design formula in float).
 */
import { mixKeyed, type Rgb } from "@still-shift/color-science";
import {
  compositionEffectDefinition,
  isFloatGradeEffect,
  type FloatGradeEffectId,
} from "@still-shift/scene-contract";
import {
  floatGradeOp,
  floatGradeSegments,
  quantizeGrade,
  type FloatGradeOp,
  type FloatGradeSegment,
} from "../../renderer-core/src/composition/render/float-grade.ts";
import { evaluateKey } from "../../renderer-core/src/composition/render/float-grade-keys.ts";
import {
  linearToSrgb,
  srgbToLinear,
  whiteBalanceGains,
} from "../../renderer-core/src/composition/render/grade-effects.ts";
import { roundTo } from "./composition-color-round.ts";
import type { ColorCorrectionEffect } from "./composition-color-solve.ts";

export const COLOR_ENGINES = ["grade", "legacy"] as const;
export type ColorEngine = (typeof COLOR_ENGINES)[number];
/** The default for new runs until CGA2's A6 switch (owner decision 1). */
export const DEFAULT_COLOR_ENGINE: ColorEngine = "legacy";

const round = (value: number, digits = 6) => roundTo(value, digits);

/**
 * A `grade.curves` channel curve (at most 16 points, y in 0–1) that applies a
 * linear-light gain to encoded sRGB, clipped at 1 as `color.white-balance`'s
 * tables are: 14 points from 0 to the clip knee, spaced more densely toward
 * black (exponent 1.2), a guard point just below the knee so the monotone
 * spline bends only there, and (1, 1). Within one code value of the CGA table
 * for every input (71 of 27,648 values off by one over 36 settings). A gain
 * so close to 1 that its knee rounds to 1 is treated as not clipping, so the
 * knee never repeats the end point (x must increase strictly).
 */
export function gainCurve(gain: number): number[][] {
  const encode = (x: number) =>
    linearToSrgb(Math.min(1, srgbToLinear(x) * gain));
  const clips = gain > 1 && round(linearToSrgb(1 / gain)) < 1;
  const knee = clips ? linearToSrgb(1 / gain) : 1;
  const count = clips ? 14 : 16;
  const xs = Array.from(
    { length: count },
    (_, i) => knee * (i / (count - 1)) ** 1.2,
  );
  if (clips) xs.splice(count - 1, 0, knee - 0.002);
  const points = xs.map((x) => [round(x), round(encode(x))]);
  if (clips) points.push([1, 1]);
  return points;
}

/** Guard-point distance around each kink of a piecewise-linear curve. */
const KINK_GUARD = 0.004;
/**
 * `color.curves` interpolates its points with straight segments; the grade
 * engine's curves are monotone splines (PCHIP), which round every kink. A
 * guard point on each segment, `KINK_GUARD` from each interior point (and
 * from each end), makes the spline's slopes equal the segments' there, so it
 * follows the straight segments except within the guard of a kink. At most
 * 16 points (the curve contract): up to 6 input points.
 */
export function piecewiseCurve(points: readonly (readonly number[])[]) {
  if (points.length > 6)
    throw Error(
      "comp-auto-color: the grade engine maps curves of at most 6 points",
    );
  const out: number[][] = [];
  const at = (a: readonly number[], b: readonly number[], x: number) => [
    round(x),
    round(a[1]! + ((b[1]! - a[1]!) * (x - a[0]!)) / (b[0]! - a[0]!)),
  ];
  points.forEach((point, i) => {
    const next = points[i + 1];
    out.push([point[0]!, point[1]!]);
    if (!next || next[0]! - point[0]! <= 4 * KINK_GUARD) return;
    out.push(at(point, next, point[0]! + KINK_GUARD));
    out.push(at(point, next, next[0]! - KINK_GUARD));
  });
  return out;
}

/** `color.levels` (input black/white, gamma) as an unclamped `grade.cdl`. */
export function gradeLevels(black: number, white: number, gamma: number) {
  const slope = round(1 / (white - black));
  const offset = round(-black / (white - black));
  const power = round(1 / gamma);
  return {
    slopeR: slope,
    slopeG: slope,
    slopeB: slope,
    offsetR: offset,
    offsetG: offset,
    offsetB: offset,
    powerR: power,
    powerG: power,
    powerB: power,
  };
}

/**
 * `grade.key` parameters whose key is 1 − protect·skin(hue), with skin the
 * smoothstep weight of `color.vibrance` (HSV hue 0–50°, 1 at 25°); null when
 * nothing is protected. Effects after it in the run are mixed by that key.
 */
export function skinProtectionKey(protect: number) {
  if (protect <= 0) return null;
  return {
    qualifier: 1,
    hueCenter: 25,
    hueWidth: 0,
    hueSoftness: 25,
    invert: 1,
    gain: round(protect),
    offset: round(1 - protect),
  };
}

/** One CGA correction (or look) as the grade engine's operators. */
export function gradeEngineEffects(
  effect: ColorCorrectionEffect,
): ColorCorrectionEffect[] {
  const p = effect.params as Record<string, number>;
  switch (effect.effect) {
    case "color.white-balance": {
      const gains = whiteBalanceGains(p.temperature ?? 0, p.tint ?? 0);
      return [
        {
          id: effect.id,
          effect: "grade.curves",
          params: {
            red: gainCurve(gains[0]),
            green: gainCurve(gains[1]),
            blue: gainCurve(gains[2]),
          },
        },
      ];
    }
    case "color.levels":
      if ((p.outputBlack ?? 0) !== 0 || (p.outputWhite ?? 1) !== 1)
        throw Error(
          "comp-auto-color: the grade engine maps input levels only (output black/white must be 0/1)",
        );
      return [
        {
          id: effect.id,
          effect: "grade.cdl",
          params: gradeLevels(
            p.inputBlack ?? 0,
            p.inputWhite ?? 1,
            p.gamma ?? 1,
          ),
        },
      ];
    case "color.curves":
      if ((p.amount ?? 1) !== 1)
        throw Error(
          "comp-auto-color: the grade engine maps full-amount curves only",
        );
      return [
        {
          id: effect.id,
          effect: "grade.curves",
          params: {
            master: piecewiseCurve(effect.params.curve as number[][]),
          },
        },
      ];
    case "color.vibrance": {
      if ((p.saturation ?? 0) !== 0)
        throw Error(
          "comp-auto-color: the grade engine maps vibrance without a uniform saturation only",
        );
      const boost = round((p.vibrance ?? 0) / 100, 4);
      const key = boost !== 0 ? skinProtectionKey(p.protectSkin ?? 0.7) : null;
      const skin: ColorCorrectionEffect[] = key
        ? [{ id: `${effect.id}-skin`, effect: "grade.key", params: key }]
        : [];
      return [
        ...skin,
        {
          id: effect.id,
          effect: "grade.primary",
          params: { colorBoost: boost },
        },
      ];
    }
    case "color.matrix":
      return [
        {
          id: effect.id,
          effect: "grade.rgb-mixer",
          params: { ...effect.params },
        },
      ];
    default:
      if (isFloatGradeEffect(effect.effect)) return [effect];
      throw Error(
        `comp-auto-color: no grade-engine mapping for ${effect.effect}`,
      );
  }
}

/** Effects for an engine: unchanged for legacy, translated for grade. */
export const engineEffects = (
  engine: ColorEngine,
  effects: readonly ColorCorrectionEffect[],
): ColorCorrectionEffect[] =>
  engine === "grade" ? effects.flatMap(gradeEngineEffects) : [...effects];

/** Parameters with the effect definition's defaults filled in. */
export function paramsWithDefaults(effect: ColorCorrectionEffect) {
  const definition = compositionEffectDefinition(effect.effect);
  if (!definition)
    throw Error(
      `comp-auto-color: no measurement reference for ${effect.effect}`,
    );
  const defaults = Object.fromEntries(
    Object.entries(definition.properties).map(([name, property]) => [
      name,
      property.default,
    ]),
  );
  return { ...defaults, ...effect.params } as Record<string, never>;
}

/** The float ops of a run of `grade.*` operators (neutral ones dropped). */
export function gradeRunOps(
  effects: readonly ColorCorrectionEffect[],
): FloatGradeOp[] {
  return effects.flatMap((effect) => {
    const op = floatGradeOp(
      effect.effect as FloatGradeEffectId,
      paramsWithDefaults(effect),
    );
    return op ? [op] : [];
  });
}

/**
 * A run's keyed segments, built by the renderer itself
 * (`floatGradeSegments`). The prediction evaluates keys per color, so every
 * key must be pointwise: a qualifier only, no window, gradient, matte,
 * finesse or view.
 */
function gradeRunSegments(
  effects: readonly ColorCorrectionEffect[],
): FloatGradeSegment[] {
  const segments = floatGradeSegments(
    effects.map((effect) => ({
      effect: effect.effect,
      id: effect.id,
      params: paramsWithDefaults(effect),
    })),
  );
  for (const { key } of segments)
    if (
      key &&
      (key.spatial || key.window || key.gradient || key.matte || key.view)
    )
      throw Error(
        `comp-auto-color: grade.key "${key.id}" is not pointwise; the prediction reads qualifiers only`,
      );
  return segments;
}

/**
 * Apply a run of `grade.*` effects to straight opaque RGBA8 in place, exactly
 * as the Canvas backend does: straight bytes / 255, each segment's ops in
 * float64 (a keyed segment mixed with its input by the key, computed from the
 * value entering it), one quantization. Evaluated once per distinct color.
 */
export function applyGradeRun(
  effects: readonly ColorCorrectionEffect[],
  rgba: Uint8Array,
) {
  const segments = gradeRunSegments(effects);
  if (!segments.length) return;
  const index = new Map<number, number>();
  const colors: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
    if (!index.has(key)) {
      index.set(key, colors.length);
      colors.push(key);
    }
  }
  const count = colors.length;
  const value = new Float64Array(count * 3);
  colors.forEach((key, i) => {
    value[i * 3] = (key >>> 16) / 255;
    value[i * 3 + 1] = ((key >>> 8) & 255) / 255;
    value[i * 3 + 2] = (key & 255) / 255;
  });
  const alpha = new Uint8Array(count).fill(255);
  for (const segment of segments) {
    const weights = segment.key
      ? evaluateKey(segment.key, count, 1, value, alpha, new Map())
      : null;
    for (let i = 0; i < count; i++) {
      const k = weights ? weights[i]! : 1;
      if (k <= 0) continue;
      const a: Rgb = [value[i * 3]!, value[i * 3 + 1]!, value[i * 3 + 2]!];
      let b = a;
      for (const op of segment.ops) b = op.apply(b);
      value.set(mixKeyed(a, b, k), i * 3);
    }
  }
  const packed = colors.map(
    (_, i) =>
      (quantizeGrade(value[i * 3]!) << 16) |
      (quantizeGrade(value[i * 3 + 1]!) << 8) |
      quantizeGrade(value[i * 3 + 2]!),
  );
  for (let i = 0; i < rgba.length; i += 4) {
    const out =
      packed[
        index.get((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!)!
      ]!;
    rgba[i] = out >>> 16;
    rgba[i + 1] = (out >>> 8) & 255;
    rgba[i + 2] = out & 255;
  }
}
