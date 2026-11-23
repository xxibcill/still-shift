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

/** The difference unrounded, and how many 4×4 blocks it covered. */
function measureDifference(
  a: readonly Uint8Array[],
  b: readonly Uint8Array[],
  width: number,
): ColorDifference & { blocks: number } {
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
    for (let i = 0; i < x.length; i += 4) {
      // A pixel differs by its largest channel difference (the p99 is per
      // pixel); RMS stays over channel values.
      let pixel = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(x[i + c]! - y[i + c]!);
        squares += d * d;
        count++;
        if (d > pixel) pixel = d;
      }
      histogram[pixel]!++;
      if (pixel > max) max = pixel;
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
    rms: Math.sqrt(squares / Math.max(1, count)),
    p99: percentile(histogram, count / 3, 0.99),
    max,
    blockRms: Math.sqrt(blockSquares / Math.max(1, blocks)),
    blockP99: percentile(blockHistogram, blocks, 0.99) / 100,
    blocks,
  };
}

const rounded = ({
  blocks: _blocks,
  ...d
}: ColorDifference & { blocks: number }): ColorDifference => ({
  ...d,
  rms: roundTo(d.rms, 4),
  blockRms: roundTo(d.blockRms, 4),
});

/**
 * Difference between two sets of straight RGBA8 frames of one width: RMS
 * over RGB channel values; the 99th percentile and max over pixels, each
 * pixel taken at its largest channel difference; and over 4×4 block means (RMS, 99th percentile in 1/100 code steps; 0 when the frames are smaller
 * than one block). RMS values are rounded to 4 decimals for reports.
 */
export const colorDifference = (
  a: readonly Uint8Array[],
  b: readonly Uint8Array[],
  width: number,
): ColorDifference => rounded(measureDifference(a, b, width));

export type SolverEquivalence = {
  legacy: ColorSolution;
  grade: ColorSolution;
  difference: ColorDifference;
  withinBound: boolean;
};

/**
 * Solve `solverFrames` (the solver's quarter-resolution frames) with both engines
 * and compare their predictions on `frames` (full resolution, one width).
 * `prefix` is a look in CGA form; the grade engine applies its translation.
 */
export function solverEquivalence(
  solverFrames: ColorFrameSet,
  frames: ColorFrameSet,
  options: ColorSolveOptions & {
    prefix?: readonly ColorCorrectionEffect[];
  } = {},
): SolverEquivalence {
  const prefix = options.prefix ?? [];
  const legacy = solveColorCorrection(solverFrames, {
    ...options,
    engine: "legacy",
    prefix,
  });
  const gradePrefix = engineEffects("grade", prefix);
  const grade = solveColorCorrection(solverFrames, {
    ...options,
    engine: "grade",
    prefix: gradePrefix,
  });
  const render = (effects: readonly ColorCorrectionEffect[]) =>
    frames.frames.map((frame) => applyColorEffects(effects, frame.rgba));
  const exact = measureDifference(
    render([...prefix, ...legacy.effects]),
    render([...gradePrefix, ...grade.effects]),
    frames.width,
  );
  // An empty block metric would pass any bound.
  if (!exact.blocks)
    throw Error(
      `comp-auto-color: frames of width ${frames.width} have no ${BLOCK}×${BLOCK} block to compare`,
    );
  return {
    legacy,
    grade,
    difference: rounded(exact),
    // The bound is checked on the unrounded values.
    withinBound:
      exact.blockRms <= CGA2_EQUIVALENCE_BOUND.blockRms &&
      exact.p99 <= CGA2_EQUIVALENCE_BOUND.p99,
  };
}
