/**
 * Primary correction float64 reference: lift, gamma, gain, offset, contrast
 * around a pivot and Rec.709 saturation.
 *
 * Provenance: ported from chroma-node `applyPrimaryCorrection`
 * (`src/shared/colorEngine.ts`, b804dc0). Changes:
 * - no clamps: chroma-node clamps the result to 0–1 and gamma's input to ≥ 0,
 *   so highlights pushed above 1 could not be recovered by a later node;
 *   gamma now leaves negative values unchanged;
 * - contrast and saturation are written as mixes (`v·k + p·(1 − k)`) so the
 *   neutral setting is an exact identity in floating point;
 * - temperature/tint (an RGB scale there) and the controls chroma-node declares
 *   but never evaluates (hue shift, color boost, midtone detail, shadows,
 *   highlights) are not ported; CG2 defines them;
 * - chroma-node's `PRIMARY_RANGES` are not kept: the bounds of the
 *   `grade.primary` zod contract (`@still-shift/scene-contract`) are the
 *   only authoring bounds.
 */
import type { Rgb } from "./matrix.ts";
import { lumaCoefficients } from "./primaries.ts";

export type PrimaryCorrection = {
  lift: Rgb;
  gamma: Rgb;
  gain: Rgb;
  offset: Rgb;
  contrast: number;
  pivot: number;
  saturation: number;
};

export const NEUTRAL_PRIMARY: PrimaryCorrection = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  offset: [0, 0, 0],
  contrast: 1,
  pivot: 0.5,
  saturation: 1,
};

const LUMA = lumaCoefficients("bt709");

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
