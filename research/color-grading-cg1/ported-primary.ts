/**
 * The CG1 port of chroma-node's primary correction, kept with the CG1
 * float-stage spike that measured it. The package's only primary correction is
 * CG2's `applyGradePrimary` (`grade.primary`); this one differs in its lift
 * (`v + lift`, not `v + lift·(1 − v)`) and has no tonal, hue or boost controls.
 *
 * Provenance: ported from chroma-node `applyPrimaryCorrection`
 * (`src/shared/colorEngine.ts`, b804dc0; GPL-3.0 by owner decision 2). Changes:
 * - no clamps: chroma-node clamps the result to 0–1 and gamma's input to ≥ 0,
 *   so highlights pushed above 1 could not be recovered by a later node;
 *   gamma now leaves negative values unchanged;
 * - contrast and saturation are written as mixes (`v·k + p·(1 − k)`) so the
 *   neutral setting is an exact identity in floating point.
 */
import {
  lumaCoefficients,
  type Rgb,
} from "../../packages/color-science/src/index.ts";

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
