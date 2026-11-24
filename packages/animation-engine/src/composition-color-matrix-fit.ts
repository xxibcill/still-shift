/**
 * CGA look fitting: 4×4 block means of before/after frame pairs, a trimmed
 * least-squares 3×3 + offset fit in encoded sRGB, and residuals through the
 * exact `color.matrix` integer path.
 */
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
} from "@still-shift/scene-contract";
import { gradeBytes, gradeControls } from "@still-shift/renderer-core";
import { roundTo } from "./composition-color-round.ts";
import type { ColorLookResidual } from "./composition-color-look.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const round = (value: number, digits = 6) => roundTo(value, digits);
/** 4×4 pixel blocks: the 16 before and 16 after RGB pixels of each block. */
export type ColorBlockSet = {
  shot: number;
  count: number;
  before: Uint8Array;
  after: Uint8Array;
};
/** Block edge in pixels, and bytes per block side (16 RGB pixels). */
export const COLOR_BLOCK = 4;
export const COLOR_BLOCK_BYTES = COLOR_BLOCK * COLOR_BLOCK * 3;
const BLOCK = COLOR_BLOCK,
  BLOCK_BYTES = COLOR_BLOCK_BYTES;
/** Blocks on a `step` grid; frames are straight RGBA8 of one size. */
export function colorBlocks(
  shot: number,
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  height: number,
  step: number,
): ColorBlockSet {
  const columns = Math.floor((width - BLOCK) / step) + 1,
    rows = Math.floor((height - BLOCK) / step) + 1;
  const count = columns * rows;
  const set: ColorBlockSet = {
    shot,
    count,
    before: new Uint8Array(count * BLOCK_BYTES),
    after: new Uint8Array(count * BLOCK_BYTES),
  };
  let at = 0;
  for (let by = 0; by < rows; by++)
    for (let bx = 0; bx < columns; bx++)
      for (let y = 0; y < BLOCK; y++)
        for (let x = 0; x < BLOCK; x++) {
          const i = ((by * step + y) * width + bx * step + x) * 4;
          for (let c = 0; c < 3; c++) {
            set.before[at] = before[i + c]!;
            set.after[at++] = after[i + c]!;
          }
        }
  return set;
}
/**
 * 4×4 block means of before/after values (0–1), in encoded code values or
 * through `decode` (a 256-entry table, e.g. to linear light), with the blocks
 * that hold no near-clipped pixel marked usable.
 */
export type ColorBlockMeans = {
  before: Float64Array;
  after: Float64Array;
  usable: Uint8Array;
};
type BlockMeans = ColorBlockMeans;
export function colorBlockMeans(
  sets: readonly ColorBlockSet[],
  decode?: Float64Array,
): ColorBlockMeans {
  const total = sets.reduce((sum, set) => sum + set.count, 0);
  const means: BlockMeans = {
    before: new Float64Array(total * 3),
    after: new Float64Array(total * 3),
    usable: new Uint8Array(total),
  };
  let block = 0;
  for (const set of sets)
    for (let b = 0; b < set.count; b++, block++) {
      let usable = 1;
      for (let p = 0; p < BLOCK * BLOCK; p++)
        for (let c = 0; c < 3; c++) {
          const i = b * BLOCK_BYTES + p * 3 + c;
          const x = set.before[i]!,
            y = set.after[i]!;
          if (decode) {
            means.before[block * 3 + c]! += decode[x]! / (BLOCK * BLOCK);
            means.after[block * 3 + c]! += decode[y]! / (BLOCK * BLOCK);
          } else {
            means.before[block * 3 + c]! += x / (BLOCK * BLOCK * 255);
            means.after[block * 3 + c]! += y / (BLOCK * BLOCK * 255);
          }
          if (x >= 250 || y >= 250 || x <= 4 || y <= 4) usable = 0;
        }
      means.usable[block] = usable;
    }
  return means;
}
const blockMeans = (sets: readonly ColorBlockSet[]) => colorBlockMeans(sets);
/** 4-parameter least squares per output channel over selected blocks. */
function fitMatrix(means: BlockMeans, selected: ArrayLike<number>) {
  const rows: number[][] = [];
  for (let channel = 0; channel < 3; channel++) {
    const a = Array.from({ length: 4 }, () => new Float64Array(4)),
      v = new Float64Array(4);
    const x = [0, 0, 0, 1];
    for (let k = 0; k < selected.length; k++) {
      const block = selected[k]!;
      x[0] = means.before[block * 3]!;
      x[1] = means.before[block * 3 + 1]!;
      x[2] = means.before[block * 3 + 2]!;
      const y = means.after[block * 3 + channel]!;
      for (let i = 0; i < 4; i++) {
        v[i]! += x[i]! * y;
        for (let j = 0; j < 4; j++) a[i]![j]! += x[i]! * x[j]!;
      }
    }
    rows.push(solve4(a, v));
  }
  return rows;
}
function solve4(a: Float64Array[], v: Float64Array): number[] {
  const m = a.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++)
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12)
      passageError(
        "comp-look-fit",
        "Look fit is degenerate: the matched frames have too little color variation",
        { path: "before" },
      );
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = m[row]![col]! / p;
      for (let k = col; k < 5; k++) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[4]! / row[i]!);
}
export function colorMatrixParams(rows: number[][]): Record<string, number> {
  const params: Record<string, number> = {};
  rows.forEach((row, output) => {
    COLOR_MATRIX_COEFFICIENTS[output]!.forEach((name, input) => {
      params[name] = round(row[input]!);
    });
    params[COLOR_MATRIX_OFFSETS[output]!] = round(row[3]!);
  });
  return params;
}
/**
 * Robust fit on 4×4 block means (codec noise and sub-pixel softening average
 * out; the affine map commutes with averaging): least squares over unclipped
 * blocks, drop the worst 5% by residual, refit twice.
 */
export function fitColorMatrix(sets: readonly ColorBlockSet[]) {
  return colorMatrixParams(fitColorMatrixRows(blockMeans(sets)));
}
/**
 * The trimmed fit on block means (any space): rows of [r, g, b, offset] per
 * output channel, and the blocks kept by the last trim.
 */
export function fitColorMatrixRows(means: ColorBlockMeans): number[][] {
  const total = means.usable.length;
  let selected: number[] = [];
  for (let block = 0; block < total; block++)
    if (means.usable[block]) selected.push(block);
  if (selected.length < 64)
    selected = Array.from({ length: total }, (_, block) => block);
  let rows = fitMatrix(means, selected);
  for (let pass = 0; pass < 2; pass++) {
    const errors = selected.map((block) => {
      let error = 0;
      for (let c = 0; c < 3; c++) {
        const predicted =
          rows[c]![0]! * means.before[block * 3]! +
          rows[c]![1]! * means.before[block * 3 + 1]! +
          rows[c]![2]! * means.before[block * 3 + 2]! +
          rows[c]![3]!;
        error += (predicted - means.after[block * 3 + c]!) ** 2;
      }
      return error;
    });
    const order = selected
      .map((block, index) => [block, errors[index]!] as const)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    selected = order
      .slice(0, Math.max(64, Math.floor(order.length * 0.95)))
      .map(([block]) => block);
    rows = fitMatrix(means, selected);
  }
  return rows;
}
/**
 * Residuals of `color.matrix` (strength 1) through its exact integer path:
 * per pixel (code values) and per 4×4 block mean.
 */
export function colorLookResidual(
  params: Record<string, number>,
  sets: readonly ColorBlockSet[],
): ColorLookResidual {
  const controls = gradeControls("color.matrix", { ...params, strength: 1 });
  const histogram = new Float64Array(256);
  const blockErrors: number[] = [];
  const out = [0, 0, 0];
  let squares = 0,
    blockSquares = 0,
    pixels = 0;
  for (const set of sets)
    for (let b = 0; b < set.count; b++) {
      const predicted = [0, 0, 0],
        target = [0, 0, 0];
      for (let p = 0; p < BLOCK * BLOCK; p++) {
        const i = b * BLOCK_BYTES + p * 3;
        gradeBytes(
          controls,
          set.before[i]!,
          set.before[i + 1]!,
          set.before[i + 2]!,
          out,
        );
        for (let c = 0; c < 3; c++) {
          const error = Math.abs(out[c]! - set.after[i + c]!);
          histogram[error]!++;
          squares += error * error;
          predicted[c]! += out[c]!;
          target[c]! += set.after[i + c]!;
        }
        pixels++;
      }
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(predicted[c]! - target[c]!) / (BLOCK * BLOCK);
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
