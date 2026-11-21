/**
 * CG4 curves and tonal-range tools, float64 references. New code (chroma-node's
 * curves were piecewise linear and its hue/saturation curves were declared but
 * never evaluated).
 *
 * Curves are monotone piecewise cubic Hermite splines (PCHIP: Fritsch and
 * Carlson 1980, weighted harmonic-mean derivatives of Fritsch and Butland
 * 1984), exactly as `scipy.interpolate.PchipInterpolator` evaluates them, so a
 * curve never overshoots its control points' range on a segment. For
 * deterministic GPU evaluation every curve is baked on the CPU into a
 * 1024-entry float32 table, linearly interpolated, and extrapolated linearly
 * beyond 0–1 (the unclamped float stage keeps values outside that range).
 * Periodic (hue) curves wrap.
 */
import { limitGrade } from "./grade.ts";
import type { Rgb } from "./matrix.ts";

export type CurvePoints = readonly (readonly [number, number])[];
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const luma = (v: readonly number[]) =>
  LUMA[0] * v[0]! + LUMA[1] * v[1]! + LUMA[2] * v[2]!;
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Control points for one period (x = 1 dropped), extended two each side. */
function periodicKnots(points: CurvePoints): [number, number][] {
  const inner = points
    .filter((p) => p[0] < 1)
    .map((p) => [p[0], p[1]] as [number, number]);
  const head = inner
    .slice(0, 2)
    .map(([x, y]) => [x + 1, y] as [number, number]);
  const tail = inner.slice(-2).map(([x, y]) => [x - 1, y] as [number, number]);
  return [...tail, ...inner, ...head];
}

/** PCHIP end derivative (scipy `_edge_case`). */
function edge(h0: number, h1: number, m0: number, m1: number) {
  let d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (sign(d) !== sign(m0)) d = 0;
  else if (sign(m0) !== sign(m1) && Math.abs(d) > 3 * Math.abs(m0)) d = 3 * m0;
  return d;
}

/** A monotone cubic interpolant of the points (periodic: wraps with period 1). */
export function pchip(
  points: CurvePoints,
  options: { periodic?: boolean } = {},
): (x: number) => number {
  const knots = options.periodic
    ? periodicKnots(points)
    : points.map((p) => [p[0], p[1]] as [number, number]);
  const n = knots.length;
  const xs = knots.map((k) => k[0]),
    ys = knots.map((k) => k[1]);
  const h = xs.slice(1).map((x, i) => x - xs[i]!);
  const m = ys.slice(1).map((y, i) => (y - ys[i]!) / h[i]!);
  const d = new Array<number>(n).fill(0);
  if (n === 2) d[0] = d[1] = m[0]!;
  else {
    for (let k = 1; k < n - 1; k++) {
      const a = m[k - 1]!,
        b = m[k]!;
      if (sign(a) !== sign(b) || a === 0 || b === 0) continue;
      const w1 = 2 * h[k]! + h[k - 1]!,
        w2 = h[k]! + 2 * h[k - 1]!;
      d[k] = 1 / ((w1 / a + w2 / b) / (w1 + w2));
    }
    d[0] = edge(h[0]!, h[1]!, m[0]!, m[1]!);
    d[n - 1] = edge(h[n - 2]!, h[n - 3]!, m[n - 2]!, m[n - 3]!);
  }
  // Coefficients as scipy's CubicHermiteSpline computes them.
  const c3: number[] = [],
    c2: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const t = (d[k]! + d[k + 1]! - 2 * m[k]!) / h[k]!;
    c3.push(t / h[k]!);
    c2.push((m[k]! - d[k]!) / h[k]! - t);
  }
  return (input: number) => {
    const x = options.periodic ? input - Math.floor(input) : input;
    let k = 0;
    while (k < n - 2 && x >= xs[k + 1]!) k++;
    const s = x - xs[k]!;
    return ((c3[k]! * s + c2[k]!) * s + d[k]!) * s + ys[k]!;
  };
}

export const CURVE_TABLE_SIZE = 1024;

/**
 * The curve baked to CURVE_TABLE_SIZE float32 entries: at k/(N−1), or at k/N
 * for a periodic curve.
 */
export function bakeCurve(
  points: CurvePoints,
  options: { periodic?: boolean } = {},
): Float32Array {
  const f = pchip(points, options);
  const span = options.periodic ? CURVE_TABLE_SIZE : CURVE_TABLE_SIZE - 1;
  return Float32Array.from({ length: CURVE_TABLE_SIZE }, (_, k) => f(k / span));
}

/** Linear interpolation of a baked table; linear extrapolation outside 0–1. */
export function sampleCurveTable(
  table: Float32Array,
  x: number,
  periodic = false,
): number {
  const N = table.length;
  if (periodic) {
    const t = (x - Math.floor(x)) * N;
    const i = Math.floor(t) % N;
    const a = table[i]!,
      b = table[(i + 1) % N]!;
    return a + (b - a) * (t - Math.floor(t));
  }
  if (x <= 0) return table[0]! + x * (table[1]! - table[0]!) * (N - 1);
  if (x >= 1)
    return table[N - 1]! + (x - 1) * (table[N - 1]! - table[N - 2]!) * (N - 1);
  const t = x * (N - 1);
  const i = Math.min(Math.floor(t), N - 2);
  const a = table[i]!;
  return a + (table[i + 1]! - a) * (t - i);
}

const isIdentityCurve = (points: CurvePoints) =>
  points.every(([x, y]) => x === y);
const isFlatCurve = (points: CurvePoints, level: number) =>
  points.every(([, y]) => y === level);

// --- grade.curves ---------------------------------------------------------------

export type GradeCurves = {
  master: CurvePoints;
  red: CurvePoints;
  green: CurvePoints;
  blue: CurvePoints;
  /** 0: the master curve on each channel; 1: on luma only (chroma kept). */
  lumaMix: number;
};
export type GradeCurvesControls = {
  master: Float32Array | null;
  red: Float32Array | null;
  green: Float32Array | null;
  blue: Float32Array | null;
  lumaMix: number;
};

/** Baked controls, or null when every curve is the identity. */
export function gradeCurvesControls(
  c: GradeCurves,
): GradeCurvesControls | null {
  const bake = (p: CurvePoints) => (isIdentityCurve(p) ? null : bakeCurve(p));
  const k = {
    master: bake(c.master),
    red: bake(c.red),
    green: bake(c.green),
    blue: bake(c.blue),
    lumaMix: c.lumaMix,
  };
  return k.master || k.red || k.green || k.blue ? k : null;
}

/** Per-channel curves, then the master curve (mixed toward luma by lumaMix). */
export function applyGradeCurves(
  v: Rgb,
  k: GradeCurvesControls,
): [number, number, number] {
  const tables = [k.red, k.green, k.blue];
  const c = [0, 1, 2].map((i) =>
    tables[i] ? limitGrade(sampleCurveTable(tables[i]!, v[i]!)) : v[i]!,
  );
  if (!k.master) return c as [number, number, number];
  const rgb = c.map((x) => limitGrade(sampleCurveTable(k.master!, x)));
  if (k.lumaMix === 0) return rgb as [number, number, number];
  const y = luma(c);
  const lift = sampleCurveTable(k.master, y) - y;
  return c.map((x, i) =>
    limitGrade(rgb[i]! * (1 - k.lumaMix) + (x + lift) * k.lumaMix),
  ) as [number, number, number];
}

// --- grade.hue-curves -----------------------------------------------------------

export type GradeHueCurves = {
  hueVsHue: CurvePoints;
  hueVsSat: CurvePoints;
  hueVsLum: CurvePoints;
  lumVsSat: CurvePoints;
  satVsSat: CurvePoints;
  satVsLum: CurvePoints;
};
export type GradeHueCurvesControls = {
  [K in keyof GradeHueCurves]: Float32Array | null;
};
export const HUE_CURVE_KEYS = [
  "hueVsHue",
  "hueVsSat",
  "hueVsLum",
  "lumVsSat",
  "satVsSat",
  "satVsLum",
] as const;
/** Chroma radius that counts as full saturation on the curves' x axis. */
export const HUE_CURVE_SATURATION_SCALE = 0.5;
/** Luma moved by a curve at y = 0 or 1. */
export const HUE_CURVE_LUMA_AMOUNT = 0.5;
/** Chroma radius over which hue-indexed curves fade in (hue is undefined at 0). */
export const HUE_CURVE_CHROMA_FADE = 0.02;
const periodic = (key: keyof GradeHueCurves) => key.startsWith("hue");

/** Baked controls, or null when every curve is flat at 0.5 (neutral). */
export function gradeHueCurvesControls(
  c: GradeHueCurves,
): GradeHueCurvesControls | null {
  const k = Object.fromEntries(
    HUE_CURVE_KEYS.map((key) => [
      key,
      isFlatCurve(c[key], 0.5)
        ? null
        : bakeCurve(c[key], { periodic: periodic(key) }),
    ]),
  ) as GradeHueCurvesControls;
  return HUE_CURVE_KEYS.some((key) => k[key]) ? k : null;
}

/**
 * In BT.709 Y′, Cb, Cr: hue is the vectorscope angle (turns, x axis of the hue
 * curves), saturation the chroma radius / 0.5 (clamped to 1), luma Y′. Every
 * curve reads the input: hue vs hue rotates by (y − 0.5) turns; the saturation
 * curves multiply the radius by 2y; the luma curves add (y − 0.5)·0.5 to Y′.
 * Hue-indexed curves fade in over a chroma radius of 0.02. Each changes only
 * its own dimension.
 */
export function applyGradeHueCurves(
  v: Rgb,
  k: GradeHueCurvesControls,
): [number, number, number] {
  const y = luma(v);
  const cb = (v[2] - y) / 1.8556,
    cr = (v[0] - y) / 1.5748;
  const radius = Math.hypot(cb, cr);
  const hue = Math.atan2(cr, cb) / (2 * Math.PI);
  const sat = Math.min(1, radius / HUE_CURVE_SATURATION_SCALE);
  const t = Math.min(1, radius / HUE_CURVE_CHROMA_FADE);
  const weight = t * t * (3 - 2 * t);
  const at = (table: Float32Array, x: number, wrap = false) =>
    sampleCurveTable(table, x, wrap);
  let gain = 1,
    offset = 0;
  if (k.hueVsSat) gain *= 1 + weight * (2 * at(k.hueVsSat, hue, true) - 1);
  if (k.lumVsSat) gain *= 2 * at(k.lumVsSat, Math.min(1, Math.max(0, y)));
  if (k.satVsSat) gain *= 2 * at(k.satVsSat, sat);
  if (k.hueVsLum)
    offset +=
      weight * (at(k.hueVsLum, hue, true) - 0.5) * HUE_CURVE_LUMA_AMOUNT;
  if (k.satVsLum) offset += (at(k.satVsLum, sat) - 0.5) * HUE_CURVE_LUMA_AMOUNT;
  let cb2 = cb * gain,
    cr2 = cr * gain;
  if (k.hueVsHue) {
    const turn = weight * (at(k.hueVsHue, hue, true) - 0.5) * 2 * Math.PI;
    const c = Math.cos(turn),
      s = Math.sin(turn);
    [cb2, cr2] = [cb2 * c - cr2 * s, cb2 * s + cr2 * c];
  }
  const y2 = y + offset;
  const r = y2 + 1.5748 * cr2,
    b = y2 + 1.8556 * cb2;
  return [
    limitGrade(r),
    limitGrade((y2 - LUMA[0] * r - LUMA[2] * b) / LUMA[1]),
    limitGrade(b),
  ];
}

// --- grade.tonal ------------------------------------------------------------------

export type GradeTonal = {
  shadowOffset: Rgb;
  midOffset: Rgb;
  highlightOffset: Rgb;
  /** Stops. */
  shadowExposure: number;
  midExposure: number;
  highlightExposure: number;
  /** Luma where shadows hand over to midtones, and midtones to highlights. */
  shadowEnd: number;
  highlightStart: number;
  /** Half-width of each hand-over (smoothstep). */
  falloff: number;
  /** High soft-clip knee (1 is off) and low soft-clip knee (0 is off). */
  softClipHigh: number;
  softClipLow: number;
};
export const NEUTRAL_GRADE_TONAL: GradeTonal = {
  shadowOffset: [0, 0, 0],
  midOffset: [0, 0, 0],
  highlightOffset: [0, 0, 0],
  shadowExposure: 0,
  midExposure: 0,
  highlightExposure: 0,
  shadowEnd: 0.33,
  highlightStart: 0.66,
  falloff: 0.15,
  softClipHigh: 1,
  softClipLow: 0,
};
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Range weights from the input's Y′: shadows 1 − smoothstep(end ± falloff),
 * highlights smoothstep(start ± falloff), midtones the rest. Each channel is
 * scaled by 2^(Σ weight·exposure) and offset by Σ weight·offset; then soft clip:
 * above the high knee k, k + (1 − k)(1 − e^(−(x − k)/(1 − k))) (approaches 1);
 * below the low knee k, k·e^(−(k − x)/k) (approaches 0). Both are C¹ at the
 * knee and strictly increasing.
 */
export function applyGradeTonal(
  v: Rgb,
  t: GradeTonal,
): [number, number, number] {
  const y = luma(v);
  const ws =
    1 - smoothstep(t.shadowEnd - t.falloff, t.shadowEnd + t.falloff, y);
  const wh = smoothstep(
    t.highlightStart - t.falloff,
    t.highlightStart + t.falloff,
    y,
  );
  const wm = Math.max(0, 1 - ws - wh);
  const scale = Math.pow(
    2,
    ws * t.shadowExposure + wm * t.midExposure + wh * t.highlightExposure,
  );
  return [0, 1, 2].map((c) => {
    let x =
      v[c]! * scale +
      (ws * t.shadowOffset[c]! +
        wm * t.midOffset[c]! +
        wh * t.highlightOffset[c]!);
    const hk = t.softClipHigh;
    if (hk < 1 && x > hk)
      x = hk + (1 - hk) * (1 - Math.exp(-(x - hk) / (1 - hk)));
    const lk = t.softClipLow;
    if (lk > 0 && x < lk) x = lk * Math.exp(-(lk - x) / lk);
    return limitGrade(x);
  }) as [number, number, number];
}
