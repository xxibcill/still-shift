/**
 * CGA2 A3: look 2's models. Each is fitted to the matched pairs' 4×4 block
 * means in one of two spaces and expressed as an ordered list of float
 * `grade.*` operators, so the residuals are measured through the renderer's
 * own ops (float64, one quantization), exactly as Canvas renders the look:
 *
 * 1. `matrix`: 3×3 + offset → `grade.rgb-mixer` (look 1's fit);
 * 2. `cdl`: slope/offset/power + saturation → `grade.cdl` (unclamped);
 * 3. `matrix-curves`: 3×3 + offset, then a monotone curve per channel →
 *    `grade.rgb-mixer` + `grade.curves` (16 PCHIP points per channel);
 * 4. `lut`: a regularized 33³ table → `grade.lut`, fitted as a correction of
 *    model 3; nodes without samples nearby keep model 3 (opt-in only).
 *
 * Spaces: `encoded-srgb` (the working space's code values) and
 * `linear-gamma-2.2` (linear light as a pure 2.2 power, applied by an
 * unclamped `grade.cdl` power before the model and its inverse after, so it
 * renders and exports exactly).
 */
import {
  bakeCubeLut,
  pchip,
  sampleLut,
  type CubeLut,
  type Rgb,
} from "@still-shift/color-science";
import type { FloatGradeEffectId } from "@still-shift/scene-contract";
import {
  floatGradeOp,
  quantizeGrade,
  type FloatGradeOp,
} from "../../renderer-core/src/composition/render/float-grade.ts";
import {
  EFFECT_LUTS,
  preparedLut,
} from "../../renderer-core/src/composition/render/luts.ts";
import { paramsWithDefaults } from "./composition-color-engine.ts";
import {
  COLOR_BLOCK,
  COLOR_BLOCK_BYTES,
  colorBlockMeans,
  colorMatrixParams,
  fitColorMatrixRows,
  type ColorBlockMeans,
  type ColorBlockSet,
} from "./composition-color-matrix-fit.ts";
import type { ColorLookResidual } from "./composition-color-look.ts";
import { roundTo } from "./composition-color-round.ts";

const round = (value: number, digits = 6) => roundTo(value, digits);

export const COLOR_LOOK_MODELS = [
  "matrix",
  "cdl",
  "matrix-curves",
  "lut",
] as const;
export type ColorLookModel = (typeof COLOR_LOOK_MODELS)[number];
/** Models `comp look fit` chooses between; `lut` is opt-in (decision 5). */
export const COLOR_LOOK_AUTO_MODELS = [
  "matrix",
  "cdl",
  "matrix-curves",
] as const;
export const COLOR_LOOK_SPACES = ["encoded-srgb", "linear-gamma-2.2"] as const;
export type ColorLookSpace = (typeof COLOR_LOOK_SPACES)[number];
/** The linear-light space's transfer: encoded = linear^(1/2.2). */
export const COLOR_LOOK_LINEAR_GAMMA = 2.2;
/**
 * Model selection: score = mean leave-one-shot-out per-pixel RMS (of 255)
 * plus this many code values per free parameter; the lowest score wins.
 * Stated before the first measurement (2026-11-23): model 3 (60 parameters)
 * must beat model 1 (12) by about 0.1 of a code to be chosen.
 */
export const COLOR_LOOK_PENALTY_PER_PARAMETER = 0.002;
/** Look 2's LUT edge (33³), and the curve points per channel. */
export const COLOR_LOOK_LUT_SIZE = 33;
export const COLOR_LOOK_CURVE_POINTS = 16;

/** A look effect: a float grade operator, optionally bound to a LUT asset. */
export type ColorLookEffect = {
  id: string;
  effect: FloatGradeEffectId;
  params: Record<string, number | number[][]>;
  assets?: Record<string, string>;
};

export type ColorLookModelFit = {
  model: ColorLookModel;
  space: ColorLookSpace;
  /** Free parameters (the space transfer is fixed). */
  parameters: number;
  effects: ColorLookEffect[];
  /** The fitted table of a `lut` model. */
  lut?: CubeLut;
  /** `lut` only: table nodes with no sample nearby, kept at model 3. */
  lutFill?: { nodes: number; filled: number };
};

// --- spaces ---------------------------------------------------------------------

const LINEAR_TABLE = Float64Array.from(
  { length: 256 },
  (_, v) => (v / 255) ** COLOR_LOOK_LINEAR_GAMMA,
);
const encodePower = round(1 / COLOR_LOOK_LINEAR_GAMMA);
const cdlPower = (id: string, power: number): ColorLookEffect => ({
  id,
  effect: "grade.cdl",
  params: { powerR: power, powerG: power, powerB: power },
});
/** The model's effects, wrapped in the space's transfer. */
function inSpace(
  space: ColorLookSpace,
  effects: ColorLookEffect[],
): ColorLookEffect[] {
  if (space === "encoded-srgb") return effects;
  return [
    cdlPower("look-linear", COLOR_LOOK_LINEAR_GAMMA),
    ...effects,
    cdlPower("look-encode", encodePower),
  ];
}
export const colorLookMeans = (
  sets: readonly ColorBlockSet[],
  space: ColorLookSpace,
) => colorBlockMeans(sets, space === "encoded-srgb" ? undefined : LINEAR_TABLE);

// --- ops and residuals ------------------------------------------------------------

/** The float ops of a look's effects (neutral ones dropped). */
export function colorLookOps(
  effects: readonly ColorLookEffect[],
  luts: ReadonlyMap<string, CubeLut> = new Map(),
): FloatGradeOp[] {
  return effects.flatMap((effect) => {
    const lutId = effect.assets?.lut;
    const lut = lutId === undefined ? undefined : luts.get(lutId);
    if (lutId !== undefined && !lut)
      throw Error(`comp-look: LUT asset "${lutId}" is not loaded`);
    const op = floatGradeOp(
      effect.effect,
      paramsWithDefaults(effect),
      lut ? { [EFFECT_LUTS]: { lut: preparedLut("look", lut) } } : undefined,
    );
    return op ? [op] : [];
  });
}

/**
 * Residuals of a run of float ops through the renderer's math (straight
 * bytes / 255, float64, one quantization): per pixel and per 4×4 block mean.
 */
export function colorLookOpsResidual(
  ops: readonly FloatGradeOp[],
  sets: readonly ColorBlockSet[],
): ColorLookResidual {
  const cache = new Int32Array(1 << 24).fill(-1);
  const histogram = new Float64Array(256);
  const blockErrors: number[] = [];
  let squares = 0,
    blockSquares = 0,
    pixels = 0;
  const outputOf = (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    let out = cache[key]!;
    if (out < 0) {
      let v: Rgb = [r / 255, g / 255, b / 255];
      for (const op of ops) v = op.apply(v);
      out =
        (quantizeGrade(v[0]) << 16) |
        (quantizeGrade(v[1]) << 8) |
        quantizeGrade(v[2]);
      cache[key] = out;
    }
    return out;
  };
  for (const set of sets)
    for (let b = 0; b < set.count; b++) {
      const predicted = [0, 0, 0],
        target = [0, 0, 0];
      for (let p = 0; p < COLOR_BLOCK * COLOR_BLOCK; p++) {
        const i = b * COLOR_BLOCK_BYTES + p * 3;
        const out = outputOf(
          set.before[i]!,
          set.before[i + 1]!,
          set.before[i + 2]!,
        );
        const o = [out >>> 16, (out >>> 8) & 255, out & 255];
        for (let c = 0; c < 3; c++) {
          const error = Math.abs(o[c]! - set.after[i + c]!);
          histogram[error]!++;
          squares += error * error;
          predicted[c]! += o[c]!;
          target[c]! += set.after[i + c]!;
        }
        pixels++;
      }
      for (let c = 0; c < 3; c++) {
        const error =
          Math.abs(predicted[c]! - target[c]!) / (COLOR_BLOCK * COLOR_BLOCK);
        blockErrors.push(error);
        blockSquares += error * error;
      }
    }
  if (!pixels)
    return {
      pixels: 0,
      rms: 0,
      p95: 0,
      p99: 0,
      max: 0,
      blockRms: 0,
      blockP95: 0,
      blockP99: 0,
    };
  const values = pixels * 3;
  const at = (q: number) => {
    let seen = 0;
    for (let error = 0; error < 256; error++) {
      seen += histogram[error]!;
      if (seen >= q * values) return error;
    }
    return 255;
  };
  let max = 0;
  for (let error = 0; error < 256; error++) if (histogram[error]) max = error;
  blockErrors.sort((a, b) => a - b);
  const blockAt = (q: number) =>
    round(
      blockErrors[
        Math.min(blockErrors.length - 1, Math.floor(q * blockErrors.length))
      ]!,
      3,
    );
  return {
    pixels,
    rms: round(Math.sqrt(squares / values), 4),
    p95: at(0.95),
    p99: at(0.99),
    max,
    blockRms: round(Math.sqrt(blockSquares / blockErrors.length), 4),
    blockP95: blockAt(0.95),
    blockP99: blockAt(0.99),
  };
}

// --- shared fitting helpers ---------------------------------------------------------

/** Usable blocks (or all, when too few), evenly thinned to at most `limit`. */
function sampleBlocks(means: ColorBlockMeans, limit: number): number[] {
  let blocks: number[] = [];
  for (let b = 0; b < means.usable.length; b++)
    if (means.usable[b]) blocks.push(b);
  if (blocks.length < 64)
    blocks = Array.from({ length: means.usable.length }, (_, b) => b);
  if (blocks.length <= limit) return blocks;
  const stride = blocks.length / limit;
  return Array.from(
    { length: limit },
    (_, k) => blocks[Math.floor(k * stride)]!,
  );
}
/** The blocks with the smallest errors: the worst 5% dropped. */
function trimmed(blocks: readonly number[], errors: readonly number[]) {
  return blocks
    .map((block, index) => [block, errors[index]!] as const)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, Math.max(64, Math.floor(blocks.length * 0.95)))
    .map(([block]) => block);
}
/** Solve a small dense symmetric system (Gaussian elimination, pivoting). */
function solveDense(a: number[][], v: number[]): number[] | null {
  const n = v.length;
  const m = a.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-14) return null;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row]![col]! / p;
      if (!factor) continue;
      for (let k = col; k <= n; k++) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}
/**
 * Levenberg–Marquardt on a residual vector with a forward-difference
 * Jacobian, parameters clamped to their bounds after each step.
 */
function levenbergMarquardt(
  residuals: (theta: readonly number[], out: Float64Array) => void,
  count: number,
  start: readonly number[],
  bounds: readonly (readonly [number, number])[],
  iterations = 40,
): number[] {
  let theta = [...start];
  const n = theta.length;
  const r = new Float64Array(count),
    trial = new Float64Array(count);
  const columns = Array.from({ length: n }, () => new Float64Array(count));
  const cost = (out: Float64Array) => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += out[i]! ** 2;
    return sum;
  };
  const clampTheta = (t: number[]) =>
    t.map((v, k) => Math.min(bounds[k]![1], Math.max(bounds[k]![0], v)));
  residuals(theta, r);
  let current = cost(r),
    lambda = 1e-3;
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let k = 0; k < n; k++) {
      const h = 1e-6 * Math.max(1, Math.abs(theta[k]!));
      const shifted = [...theta];
      shifted[k]! += h;
      residuals(shifted, columns[k]!);
      for (let i = 0; i < count; i++)
        columns[k]![i] = (columns[k]![i]! - r[i]!) / h;
    }
    const jtj = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const jtr = new Array<number>(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let i = 0; i < count; i++) jtr[a]! -= columns[a]![i]! * r[i]!;
      for (let b = a; b < n; b++) {
        let sum = 0;
        for (let i = 0; i < count; i++)
          sum += columns[a]![i]! * columns[b]![i]!;
        jtj[a]![b] = jtj[b]![a] = sum;
      }
    }
    let improved = false;
    for (let attempt = 0; attempt < 8 && !improved; attempt++) {
      const damped = jtj.map((row, a) =>
        row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)),
      );
      const step = solveDense(damped, jtr);
      if (!step) {
        lambda *= 10;
        continue;
      }
      const next = clampTheta(theta.map((v, k) => v + step[k]!));
      residuals(next, trial);
      const value = cost(trial);
      if (value < current) {
        const gain = (current - value) / Math.max(current, 1e-30);
        theta = next;
        current = value;
        r.set(trial);
        lambda = Math.max(1e-9, lambda / 10);
        improved = true;
        if (gain < 1e-10) return theta;
      } else lambda *= 10;
    }
    if (!improved) break;
  }
  return theta;
}

// --- model 1: matrix + offset ---------------------------------------------------------

type Rows = number[][];
const applyRows = (rows: Rows, x: readonly number[], c: number) =>
  rows[c]![0]! * x[0]! +
  rows[c]![1]! * x[1]! +
  rows[c]![2]! * x[2]! +
  rows[c]![3]!;
const mixerEffect = (rows: Rows, id = "look-mixer"): ColorLookEffect => ({
  id,
  effect: "grade.rgb-mixer",
  params: colorMatrixParams(rows),
});

function fitMatrixModel(
  means: ColorBlockMeans,
  space: ColorLookSpace,
): ColorLookModelFit {
  const rows = fitColorMatrixRows(means);
  return {
    model: "matrix",
    space,
    parameters: 12,
    effects: inSpace(space, [
      mixerEffect(rows, space === "encoded-srgb" ? "look" : "look-mixer"),
    ]),
  };
}

// --- model 2: CDL ---------------------------------------------------------------------

const CDL_BOUNDS: [number, number][] = [
  ...Array.from({ length: 3 }, () => [0, 8] as [number, number]),
  ...Array.from({ length: 3 }, () => [-1, 1] as [number, number]),
  ...Array.from({ length: 3 }, () => [0.1, 8] as [number, number]),
  [0, 4],
];
const LUMA = [0.2126, 0.7152, 0.0722];
/** `grade.cdl` (unclamped) on one value: θ = slope×3, offset×3, power×3, saturation. */
function cdlValue(
  theta: readonly number[],
  x: readonly number[],
  out: number[],
) {
  for (let c = 0; c < 3; c++) {
    const v = x[c]! * theta[c]! + theta[3 + c]!;
    out[c] = v > 0 ? v ** theta[6 + c]! : v;
  }
  const y = out[0]! * LUMA[0]! + out[1]! * LUMA[1]! + out[2]! * LUMA[2]!;
  for (let c = 0; c < 3; c++) out[c] = y + theta[9]! * (out[c]! - y);
}

function fitCdlModel(
  means: ColorBlockMeans,
  space: ColorLookSpace,
): ColorLookModelFit {
  let blocks = sampleBlocks(means, 40_000);
  let theta = [1, 1, 1, 0, 0, 0, 1, 1, 1, 1];
  const out = [0, 0, 0];
  for (let pass = 0; pass < 3; pass++) {
    const chosen = blocks;
    theta = levenbergMarquardt(
      (t, r) => {
        for (let k = 0; k < chosen.length; k++) {
          const b = chosen[k]!;
          cdlValue(
            t,
            [
              means.before[b * 3]!,
              means.before[b * 3 + 1]!,
              means.before[b * 3 + 2]!,
            ],
            out,
          );
          for (let c = 0; c < 3; c++)
            r[k * 3 + c] = out[c]! - means.after[b * 3 + c]!;
        }
      },
      chosen.length * 3,
      theta,
      CDL_BOUNDS,
    );
    if (pass === 2) break;
    const errors = blocks.map((b) => {
      cdlValue(
        theta,
        [
          means.before[b * 3]!,
          means.before[b * 3 + 1]!,
          means.before[b * 3 + 2]!,
        ],
        out,
      );
      let e = 0;
      for (let c = 0; c < 3; c++) e += (out[c]! - means.after[b * 3 + c]!) ** 2;
      return e;
    });
    blocks = trimmed(blocks, errors);
  }
  const channels = ["R", "G", "B"];
  const params: Record<string, number> = {};
  channels.forEach((name, c) => {
    params[`slope${name}`] = round(theta[c]!);
    params[`offset${name}`] = round(theta[3 + c]!);
    params[`power${name}`] = round(theta[6 + c]!);
  });
  params.saturation = round(theta[9]!);
  return {
    model: "cdl",
    space,
    parameters: 10,
    effects: inSpace(space, [
      {
        id: space === "encoded-srgb" ? "look" : "look-cdl",
        effect: "grade.cdl",
        params,
      },
    ]),
  };
}

// --- model 3: matrix + per-channel monotone curves ------------------------------------

/** Curve knots: x at quantiles of the inputs that fall inside 0–1, plus 0 and 1. */
function curveKnots(u: Float64Array): number[] {
  const inside = Array.from(u).filter((v) => v > 0 && v < 1);
  inside.sort((a, b) => a - b);
  const interior = COLOR_LOOK_CURVE_POINTS - 2;
  const xs = [0];
  for (let k = 1; k <= interior; k++) {
    const q = inside.length
      ? inside[
          Math.min(
            inside.length - 1,
            Math.floor((k / (interior + 1)) * inside.length),
          )
        ]!
      : k / (interior + 1);
    // At least 1/64 apart, and inside 0–1.
    const x = Math.min(
      1 - (interior + 1 - k) / 64,
      Math.max(xs.at(-1)! + 1 / 64, q),
    );
    xs.push(round(x));
  }
  xs.push(1);
  return xs;
}
/** Pool adjacent violators: the closest non-decreasing sequence (weighted). */
function monotone(values: readonly number[], weights: readonly number[]) {
  const blocks: { value: number; weight: number; count: number }[] = [];
  values.forEach((value, i) => {
    blocks.push({ value, weight: Math.max(weights[i]!, 1e-9), count: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.value > blocks.at(-1)!.value) {
      const b = blocks.pop()!,
        a = blocks.pop()!;
      const weight = a.weight + b.weight;
      blocks.push({
        value: (a.value * a.weight + b.value * b.weight) / weight,
        weight,
        count: a.count + b.count,
      });
    }
  });
  return blocks.flatMap((block) =>
    new Array<number>(block.count).fill(block.value),
  );
}
/**
 * A channel's curve y values at `xs`: least squares with a piecewise-linear
 * (hat) basis, a small second-difference penalty (so unsampled ends continue
 * the trend instead of bending), then made monotone and clamped to 0–1; then
 * Gauss–Newton steps on the PCHIP curve the renderer evaluates.
 */
function fitCurve(
  xs: readonly number[],
  u: Float64Array,
  y: Float64Array,
): number[] {
  const n = xs.length;
  const a = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const v = new Array<number>(n).fill(0);
  const mass = new Array<number>(n).fill(0);
  const segment = (x: number) => {
    let k = 0;
    while (k < n - 2 && x >= xs[k + 1]!) k++;
    return k;
  };
  for (let i = 0; i < u.length; i++) {
    const x = u[i]!;
    const k = segment(Math.min(1, Math.max(0, x)));
    const t = (x - xs[k]!) / (xs[k + 1]! - xs[k]!);
    const w = [1 - t, t];
    for (let p = 0; p < 2; p++) {
      v[k + p]! += w[p]! * y[i]!;
      mass[k + p]! += Math.abs(w[p]!);
      for (let q = 0; q < 2; q++) a[k + p]![k + q]! += w[p]! * w[q]!;
    }
  }
  // Second differences of slopes, scaled to the data's weight.
  const smooth = 1e-4 * Math.max(1, u.length);
  for (let k = 1; k < n - 1; k++) {
    const h0 = xs[k]! - xs[k - 1]!,
      h1 = xs[k + 1]! - xs[k]!;
    const d = [1 / h0, -(1 / h0 + 1 / h1), 1 / h1];
    const scale = smooth * ((h0 + h1) / 2) ** 2;
    for (let p = 0; p < 3; p++)
      for (let q = 0; q < 3; q++)
        a[k - 1 + p]![k - 1 + q]! += scale * d[p]! * d[q]!;
  }
  let ys = solveDense(a, v) ?? xs.map((x) => x);
  ys = monotone(ys, mass).map((value) => Math.min(1, Math.max(0, value)));
  // Gauss–Newton refinement on the PCHIP curve (forward differences).
  const sample = Math.max(1, Math.floor(u.length / 20_000));
  const idx: number[] = [];
  for (let i = 0; i < u.length; i += sample) idx.push(i);
  const curveAt = (values: readonly number[]) =>
    pchip(xs.map((x, k) => [x, values[k]!] as const));
  for (let iteration = 0; iteration < 4; iteration++) {
    const f = curveAt(ys);
    const base = idx.map((i) => f(u[i]!));
    const columns: Float64Array[] = [];
    for (let k = 0; k < n; k++) {
      const shifted = [...ys];
      shifted[k]! += 1e-4;
      const g = curveAt(shifted);
      columns.push(
        Float64Array.from(idx, (i, j) => (g(u[i]!) - base[j]!) / 1e-4),
      );
    }
    const jtj = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const jtr = new Array<number>(n).fill(0);
    for (let p = 0; p < n; p++) {
      for (let j = 0; j < idx.length; j++)
        jtr[p]! += columns[p]![j]! * (y[idx[j]!]! - base[j]!);
      for (let q = p; q < n; q++) {
        let sum = 0;
        for (let j = 0; j < idx.length; j++)
          sum += columns[p]![j]! * columns[q]![j]!;
        jtj[p]![q] = jtj[q]![p] = sum;
      }
    }
    const ridge = (smooth * idx.length) / Math.max(1, u.length);
    for (let k = 1; k < n - 1; k++) {
      const h0 = xs[k]! - xs[k - 1]!,
        h1 = xs[k + 1]! - xs[k]!;
      const d = [1 / h0, -(1 / h0 + 1 / h1), 1 / h1];
      const scale = ridge * ((h0 + h1) / 2) ** 2;
      let current = 0;
      for (let p = 0; p < 3; p++) current += d[p]! * ys[k - 1 + p]!;
      for (let p = 0; p < 3; p++) {
        jtr[k - 1 + p]! -= scale * d[p]! * current;
        for (let q = 0; q < 3; q++)
          jtj[k - 1 + p]![k - 1 + q]! += scale * d[p]! * d[q]!;
      }
    }
    for (let k = 0; k < n; k++) jtj[k]![k]! += 1e-9 + 1e-3 * jtj[k]![k]!;
    const step = solveDense(jtj, jtr);
    if (!step) break;
    ys = monotone(
      ys.map((value, k) => value + step[k]!),
      mass,
    ).map((value) => Math.min(1, Math.max(0, value)));
  }
  return ys.map((value) => round(value));
}

type CurvesState = { rows: Rows; xs: number[][]; ys: number[][] };
function curvesPredict(state: CurvesState) {
  const curves = [0, 1, 2].map((c) =>
    pchip(state.xs[c]!.map((x, k) => [x, state.ys[c]![k]!] as const)),
  );
  return (x: readonly number[], c: number) => {
    const u = applyRows(state.rows, x, c);
    // The renderer extrapolates linearly beyond 0–1 from its baked table.
    if (u < 0) {
      const f = curves[c]!;
      return f(0) + u * (f(1 / 1023) - f(0)) * 1023;
    }
    if (u > 1) {
      const f = curves[c]!;
      return f(1) + (u - 1) * (f(1) - f(1022 / 1023)) * 1023;
    }
    return curves[c]!(u);
  };
}

function fitCurvesState(means: ColorBlockMeans): CurvesState {
  let blocks = sampleBlocks(means, 120_000);
  const rows = fitColorMatrixRows(means).map((row) => [...row]);
  const state: CurvesState = { rows, xs: [], ys: [] };
  const x = (b: number) => [
    means.before[b * 3]!,
    means.before[b * 3 + 1]!,
    means.before[b * 3 + 2]!,
  ];
  for (let iteration = 0; iteration < 4; iteration++) {
    // Curves for the current matrix.
    for (let c = 0; c < 3; c++) {
      const u = Float64Array.from(blocks, (b) =>
        applyRows(state.rows, x(b), c),
      );
      const y = Float64Array.from(blocks, (b) => means.after[b * 3 + c]!);
      if (iteration === 0) state.xs[c] = curveKnots(u);
      state.ys[c] = fitCurve(state.xs[c]!, u, y);
    }
    if (iteration === 3) break;
    // Gauss–Newton on each matrix row for the current curves.
    const curves = [0, 1, 2].map((c) =>
      pchip(state.xs[c]!.map((xv, k) => [xv, state.ys[c]![k]!] as const)),
    );
    for (let c = 0; c < 3; c++) {
      const a = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
      const v = new Array<number>(4).fill(0);
      const f = curves[c]!;
      for (const b of blocks) {
        const input = [...x(b), 1];
        const u = applyRows(state.rows, input, c);
        const clamped = Math.min(1, Math.max(0, u));
        const slope =
          (f(Math.min(1, clamped + 1e-3)) - f(Math.max(0, clamped - 1e-3))) /
          (Math.min(1, clamped + 1e-3) - Math.max(0, clamped - 1e-3));
        const residual =
          means.after[b * 3 + c]! - f(clamped) - (u - clamped) * slope;
        for (let i = 0; i < 4; i++) {
          v[i]! += slope * input[i]! * residual;
          for (let j = 0; j < 4; j++)
            a[i]![j]! += slope * slope * input[i]! * input[j]!;
        }
      }
      for (let i = 0; i < 4; i++) a[i]![i]! += 1e-9 + 1e-4 * a[i]![i]!;
      const step = solveDense(a, v);
      if (step)
        state.rows[c] = state.rows[c]!.map((value, i) => value + step[i]!);
    }
    // Drop the worst 5% once the shape has settled.
    if (iteration === 1) {
      const predict = curvesPredict(state);
      blocks = trimmed(
        blocks,
        blocks.map((b) => {
          let e = 0;
          for (let c = 0; c < 3; c++)
            e += (predict(x(b), c) - means.after[b * 3 + c]!) ** 2;
          return e;
        }),
      );
    }
  }
  return state;
}

function curvesEffects(state: CurvesState): ColorLookEffect[] {
  const points = (c: number) =>
    state.xs[c]!.map((x, k) => [x, state.ys[c]![k]!]);
  return [
    mixerEffect(state.rows),
    {
      id: "look-curves",
      effect: "grade.curves",
      params: { red: points(0), green: points(1), blue: points(2) },
    },
  ];
}

function fitCurvesModel(
  means: ColorBlockMeans,
  space: ColorLookSpace,
): ColorLookModelFit {
  return {
    model: "matrix-curves",
    space,
    parameters: 12 + 3 * COLOR_LOOK_CURVE_POINTS,
    effects: inSpace(space, curvesEffects(fitCurvesState(means))),
  };
}

// --- model 4: 3D LUT ---------------------------------------------------------------------

/**
 * The 4 tetrahedral weights of an input inside a `size`³ grid over 0–1, as
 * `sampleLut` interpolates (node indices into the .cube order).
 */
function tetrahedron(
  size: number,
  rgb: readonly number[],
  nodes: number[],
  weights: number[],
) {
  const n = size - 1;
  const s = rgb.map((v) => Math.min(1, Math.max(0, v)) * n);
  const r0 = Math.min(Math.floor(s[0]!), n - 1),
    g0 = Math.min(Math.floor(s[1]!), n - 1),
    b0 = Math.min(Math.floor(s[2]!), n - 1);
  const fr = s[0]! - r0,
    fg = s[1]! - g0,
    fb = s[2]! - b0;
  const at = (r: number, g: number, b: number) =>
    ((b0 + b) * size + (g0 + g)) * size + (r0 + r);
  // Same branch order as sampleLut: corners and weights of each path.
  let path: [number, number, number][], f: number[];
  if (fr > fg) {
    if (fg > fb) {
      path = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ];
      f = [fr, fg, fb];
    } else if (fr > fb) {
      path = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
      ];
      f = [fr, fb, fg];
    } else {
      path = [
        [0, 0, 0],
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
      ];
      f = [fb, fr, fg];
    }
  } else if (fb > fg) {
    path = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ];
    f = [fb, fg, fr];
  } else if (fb > fr) {
    path = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
    ];
    f = [fg, fb, fr];
  } else {
    path = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 1, 1],
    ];
    f = [fg, fr, fb];
  }
  // c000 + f0(c1 − c0) + f1(c2 − c1) + f2(c3 − c2).
  const w = [1 - f[0]!, f[0]! - f[1]!, f[1]! - f[2]!, f[2]!];
  for (let k = 0; k < 4; k++) {
    const [r, g, b] = path[k]!;
    nodes[k] = at(r, g, b);
    weights[k] = w[k]!;
  }
}

/**
 * Model 4: model 3 in its better space, baked to a 33³ table in encoded
 * values, plus a correction fitted to the residual block means: least squares
 * through the tetrahedral weights with a Laplacian smoothness term (conjugate
 * gradients). Nodes no sample touches keep model 3 exactly and are counted.
 */
export function fitColorLookLut(
  sets: readonly ColorBlockSet[],
  base: ColorLookModelFit,
): ColorLookModelFit {
  const size = COLOR_LOOK_LUT_SIZE;
  const ops = colorLookOps(base.effects);
  const lut = bakeCubeLut(
    (v) => {
      let value: Rgb = v;
      for (const op of ops) value = op.apply(value);
      return value;
    },
    size,
    { title: "still-shift-look-2" },
  );
  const means = colorBlockMeans(sets);
  const blocks = sampleBlocks(means, Number.POSITIVE_INFINITY);
  const total = size ** 3;
  // Normal equations, stored per node with its 27 neighbours.
  const offsets: number[] = [];
  for (let db = -1; db <= 1; db++)
    for (let dg = -1; dg <= 1; dg++)
      for (let dr = -1; dr <= 1; dr++)
        offsets.push((db * size + dg) * size + dr);
  const slotOf = new Map(offsets.map((offset, slot) => [offset, slot]));
  const normal = new Float64Array(total * 27);
  const rhs = new Float64Array(total * 3);
  const weight = new Float64Array(total);
  const nodes = [0, 0, 0, 0],
    weights = [0, 0, 0, 0];
  for (const b of blocks) {
    const x = [
      means.before[b * 3]!,
      means.before[b * 3 + 1]!,
      means.before[b * 3 + 2]!,
    ];
    const predicted = sampleLut(lut, x as unknown as Rgb);
    tetrahedron(size, x, nodes, weights);
    for (let p = 0; p < 4; p++) {
      const wp = weights[p]!;
      if (!wp) continue;
      weight[nodes[p]!]! += wp;
      for (let c = 0; c < 3; c++)
        rhs[nodes[p]! * 3 + c]! +=
          wp * (means.after[b * 3 + c]! - predicted[c]!);
      for (let q = 0; q < 4; q++)
        normal[nodes[p]! * 27 + slotOf.get(nodes[q]! - nodes[p]!)!]! +=
          wp * weights[q]!;
    }
  }
  // Smoothness: λ·Σ over grid edges (c_i − c_j)², relative to samples per node.
  const lambda = 0.05 * Math.max(1, blocks.length / total);
  const neighbours = [1, size, size * size];
  const coordinate = (i: number) => [
    i % size,
    Math.floor(i / size) % size,
    Math.floor(i / (size * size)),
  ];
  const free = new Uint8Array(total);
  for (let i = 0; i < total; i++) free[i] = weight[i]! > 1e-6 ? 1 : 0;
  const apply = (input: Float64Array, output: Float64Array) => {
    output.fill(0);
    for (let i = 0; i < total; i++) {
      if (!free[i]) continue;
      const at = coordinate(i);
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let slot = 0; slot < 27; slot++) {
          const value = normal[i * 27 + slot]!;
          if (value) sum += value * input[(i + offsets[slot]!) * 3 + c]!;
        }
        output[i * 3 + c] = sum;
      }
      for (let axis = 0; axis < 3; axis++)
        for (const direction of [-1, 1]) {
          const next = at[axis]! + direction;
          if (next < 0 || next >= size) continue;
          const j = i + direction * neighbours[axis]!;
          for (let c = 0; c < 3; c++)
            output[i * 3 + c]! +=
              lambda * (input[i * 3 + c]! - input[j * 3 + c]!);
        }
    }
  };
  // Conjugate gradients over the nodes samples touch; others stay 0.
  const correction = new Float64Array(total * 3);
  const residual = new Float64Array(rhs);
  for (let i = 0; i < total; i++)
    if (!free[i]) residual.fill(0, i * 3, i * 3 + 3);
  const direction = new Float64Array(residual);
  const product = new Float64Array(total * 3);
  let rr = residual.reduce((sum, v) => sum + v * v, 0);
  const tolerance = rr * 1e-12;
  for (let iteration = 0; iteration < 400 && rr > tolerance; iteration++) {
    apply(direction, product);
    let dAd = 0;
    for (let k = 0; k < product.length; k++) dAd += direction[k]! * product[k]!;
    if (dAd <= 0) break;
    const alpha = rr / dAd;
    let next = 0;
    for (let k = 0; k < product.length; k++) {
      correction[k]! += alpha * direction[k]!;
      residual[k]! -= alpha * product[k]!;
      next += residual[k]! ** 2;
    }
    const beta = next / rr;
    rr = next;
    for (let k = 0; k < direction.length; k++)
      direction[k] = residual[k]! + beta * direction[k]!;
  }
  const data = new Float64Array(lut.data);
  for (let k = 0; k < data.length; k++) data[k]! += correction[k]!;
  const fitted: CubeLut = { ...lut, data };
  let filled = 0;
  for (let i = 0; i < total; i++) if (!free[i]) filled++;
  return {
    model: "lut",
    space: base.space,
    parameters: 3 * total,
    effects: [
      {
        id: "look-lut",
        effect: "grade.lut",
        params: {},
        assets: { lut: "look-lut" },
      },
    ],
    lut: fitted,
    lutFill: { nodes: total, filled },
  };
}

// --- fitting entry point -------------------------------------------------------------------

/** Fit one model (not `lut`) in one space to the block pairs. */
export function fitColorLookModel(
  sets: readonly ColorBlockSet[],
  model: Exclude<ColorLookModel, "lut">,
  space: ColorLookSpace,
): ColorLookModelFit {
  const means = colorLookMeans(sets, space);
  if (model === "matrix") return fitMatrixModel(means, space);
  if (model === "cdl") return fitCdlModel(means, space);
  return fitCurvesModel(means, space);
}

/** A fitted model's ops (a `lut` model reads its own table). */
export const colorLookModelOps = (fit: ColorLookModelFit): FloatGradeOp[] =>
  colorLookOps(
    fit.effects,
    fit.lut ? new Map([["look-lut", fit.lut]]) : new Map(),
  );
