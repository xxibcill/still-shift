/**
 * Primary correction float64 reference: lift, gamma, gain, offset, contrast
 * around a pivot and Rec.709 saturation.
 *
 * Provenance: ported from chroma-node `applyPrimaryCorrection` and
 * `PRIMARY_RANGES` (`src/shared/colorEngine.ts`, b804dc0). Changes:
 * - no clamps: chroma-node clamps the result to 0–1 and gamma's input to ≥ 0,
 *   so highlights pushed above 1 could not be recovered by a later node;
 *   gamma now leaves negative values unchanged;
 * - contrast and saturation are written as mixes (`v·k + p·(1 − k)`) so the
 *   neutral setting is an exact identity in floating point;
 * - temperature/tint (an RGB scale there) and the controls chroma-node declares
 *   but never evaluates (hue shift, color boost, midtone detail, shadows,
 *   highlights) are not ported; CG2 defines them.
 */
import type { Rgb } from "./matrix.ts";

export type PrimaryCorrection = {
  lift: Rgb;
  gamma: Rgb;
  gain: Rgb;
  offset: Rgb;
  contrast: number;
  pivot: number;
  saturation: number;
};

export type NumericRange = {
  min: number;
  max: number;
  neutral: number;
  step: number;
};

/** chroma-node's bounds for the ported controls (authoring bounds, not clamps). */
export const PRIMARY_RANGES = {
  lift: { min: -0.5, max: 0.5, neutral: 0, step: 0.01 },
  gamma: { min: 0.1, max: 3, neutral: 1, step: 0.01 },
  gain: { min: 0, max: 4, neutral: 1, step: 0.01 },
  offset: { min: -0.5, max: 0.5, neutral: 0, step: 0.01 },
  contrast: { min: 0, max: 2, neutral: 1, step: 0.01 },
  pivot: { min: 0, max: 1, neutral: 0.5, step: 0.01 },
  saturation: { min: 0, max: 2, neutral: 1, step: 0.01 },
} as const satisfies Record<keyof PrimaryCorrection, NumericRange>;

export const NEUTRAL_PRIMARY: PrimaryCorrection = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  offset: [0, 0, 0],
  contrast: 1,
  pivot: 0.5,
  saturation: 1,
};

const LUMA = [0.2126, 0.7152, 0.0722] as const;

export function applyPrimaryCorrection(
  rgb: Rgb,
  p: PrimaryCorrection,
): [number, number, number] {
  const v = [0, 1, 2].map((c) => {
    const lifted = rgb[c]! + p.lift[c]!;
    const curved = lifted < 0 ? lifted : Math.pow(lifted, 1 / p.gamma[c]!);
    return (
      (curved * p.gain[c]! + p.offset[c]!) * p.contrast +
      p.pivot * (1 - p.contrast)
    );
  });
  const y = v[0]! * LUMA[0] + v[1]! * LUMA[1] + v[2]! * LUMA[2];
  return v.map((x) => y * (1 - p.saturation) + x * p.saturation) as [
    number,
    number,
    number,
  ];
}
