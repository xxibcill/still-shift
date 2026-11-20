/**
 * 3×3 matrices, row-major, float64.
 *
 * Provenance: `invert3x3`, `multiplyMatrices` and `multiplyMatrixVector` are
 * ported from chroma-node `src/shared/colorEngine.ts` at b804dc0 (GPL-3.0 by
 * the owner's decision, 2026-11-20). Change: a singular matrix throws instead
 * of silently returning the identity.
 */
import { ColorScienceError } from "./errors.ts";

export type Rgb = readonly [number, number, number];
/** Row-major: [m00, m01, m02, m10, …]. */
export type Mat3 = readonly number[];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiply(left: Mat3, right: Mat3): number[] {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      out[row * 3 + col] =
        left[row * 3]! * right[col]! +
        left[row * 3 + 1]! * right[3 + col]! +
        left[row * 3 + 2]! * right[6 + col]!;
  return out;
}

export function apply(m: Mat3, v: Rgb): [number, number, number] {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
}

export function invert(m: Mat3): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300)
    throw new ColorScienceError("Matrix is singular and cannot be inverted");
  const k = 1 / det;
  return [
    (e * i - f * h) * k,
    (c * h - b * i) * k,
    (b * f - c * e) * k,
    (f * g - d * i) * k,
    (a * i - c * g) * k,
    (c * d - a * f) * k,
    (d * h - e * g) * k,
    (b * g - a * h) * k,
    (a * e - b * d) * k,
  ];
}

export const diagonal = (v: Rgb): number[] => [
  v[0],
  0,
  0,
  0,
  v[1],
  0,
  0,
  0,
  v[2],
];
