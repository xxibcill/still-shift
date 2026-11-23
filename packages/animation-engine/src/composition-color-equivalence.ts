/**
 * CGA2 A0: the equivalence gate between CGA's solver (solver 1, 8-bit
 * `color.*` effects) and the same solver on the grade engine (solver 2,
 * `grade.*`). Both solve the same frames; their exact Canvas predictions are
 * compared per pixel and as 4×4 block means. Owner decision 2 (2026-11-23):
 * solver 2 must stay within the bound before improvements that move the look
 * land, or each difference is listed with its cause.
 */
import { roundTo } from "./composition-color-round.ts";
import type { ColorFrameSet } from "./composition-color-measure.ts";
import {
  applyColorEffects,
  solveColorCorrection,
  type ColorCorrectionEffect,
  type ColorSolveOptions,
  type ColorSolution,
} from "./composition-color-solve.ts";
import { engineEffects } from "./composition-color-engine.ts";

/**
 * The equivalence bound, of 255, stated before the first measurement
 * (2026-11-23): 4×4 block-mean RMS ≤ 1 and per-pixel 99th percentile ≤ 3.
 * Both are reported; the look-bound question (block means or pixels, owner
 * decision 4) stays open.
 */
export const CGA2_EQUIVALENCE_BOUND = { blockRms: 1, p99: 3 } as const;
const BLOCK = 4;

export type ColorDifference = {
  pixels: number;
  rms: number;
  p99: number;
  max: number;
  blockRms: number;
  blockP99: number;
};

const percentile = (
  histogram: Float64Array | number[],
  count: number,
  q: number,
) => {
  const rank = Math.ceil(q * count);
  let seen = 0;
  for (let v = 0; v < histogram.length; v++) {
    seen += histogram[v]!;
    if (seen >= rank) return v;
  }
  return histogram.length - 1;
};

/**
 * Difference between two sets of straight RGBA8 frames of one width, over
 * RGB channel values: per pixel (RMS, 99th percentile, max) and over 4×4 block
 * means (RMS, 99th percentile in 1/100 code steps).
 */
export function colorDifference(
  a: readonly Uint8Array[],
  b: readonly Uint8Array[],
  width: number,
): ColorDifference {
  const histogram = new Float64Array(256);
  const blockHistogram = new Float64Array(25601);
  let squares = 0,
    count = 0,
    max = 0,
    blockSquares = 0,
    blocks = 0;
  for (let f = 0; f < a.length; f++) {
    const x = a[f]!,
      y = b[f]!;
    const height = x.length / 4 / width;
    for (let i = 0; i < x.length; i += 4)
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(x[i + c]! - y[i + c]!);
        histogram[d]!++;
        squares += d * d;
        count++;
        if (d > max) max = d;
      }
    for (let by = 0; by + BLOCK <= height; by += BLOCK)
      for (let bx = 0; bx + BLOCK <= width; bx += BLOCK)
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let py = 0; py < BLOCK; py++)
            for (let px = 0; px < BLOCK; px++) {
              const i = ((by + py) * width + bx + px) * 4 + c;
              sum += x[i]! - y[i]!;
            }
          const d = Math.abs(sum / (BLOCK * BLOCK));
          blockHistogram[Math.min(25600, Math.round(d * 100))]!++;
          blockSquares += d * d;
          blocks++;
        }
  }
  return {
    pixels: count / 3,
    rms: roundTo(Math.sqrt(squares / Math.max(1, count)), 4),
    p99: percentile(histogram, count, 0.99),
    max,
    blockRms: roundTo(Math.sqrt(blockSquares / Math.max(1, blocks)), 4),
    blockP99: percentile(blockHistogram, blocks, 0.99) / 100,
  };
}

export type SolverEquivalence = {
  legacy: ColorSolution;
  grade: ColorSolution;
  difference: ColorDifference;
  withinBound: boolean;
};

/**
 * Solve `solve` (the solver's quarter-resolution frames) with both engines
 * and compare their predictions on `frames` (full resolution, one width).
 * `prefix` is a look in CGA form; the grade engine applies its translation.
 */
export function solverEquivalence(
  solve: ColorFrameSet,
  frames: ColorFrameSet,
  options: ColorSolveOptions & {
    prefix?: readonly ColorCorrectionEffect[];
  } = {},
): SolverEquivalence {
  const prefix = options.prefix ?? [];
  const legacy = solveColorCorrection(solve, {
    ...options,
    engine: "legacy",
    prefix,
  });
  const gradePrefix = engineEffects("grade", prefix) as ColorCorrectionEffect[];
  const grade = solveColorCorrection(solve, {
    ...options,
    engine: "grade",
    prefix: gradePrefix,
  });
  const render = (effects: readonly ColorCorrectionEffect[]) =>
    frames.frames.map((frame) => applyColorEffects(effects, frame.rgba));
  const difference = colorDifference(
    render([...prefix, ...legacy.effects]),
    render([...gradePrefix, ...grade.effects]),
    frames.width,
  );
  return {
    legacy,
    grade,
    difference,
    withinBound:
      difference.blockRms <= CGA2_EQUIVALENCE_BOUND.blockRms &&
      difference.p99 <= CGA2_EQUIVALENCE_BOUND.p99,
  };
}
