/**
 * ASC CDL, float64. New code (chroma-node has no CDL).
 *
 * `asc`: ASC CDL Release 1.2 (2009): out = clamp(in·slope + offset)^power,
 * then saturation with Rec.709 luma weights, then clamp to 0–1.
 * `no-clamp`: OpenColorIO's CDL_NO_CLAMP style: no clamps, and the power is
 * not applied to negative values (they pass through).
 */
import { perChannel, type Rgb } from "./matrix.ts";
import { lumaCoefficients } from "./primaries.ts";

export type Cdl = {
  slope: Rgb;
  offset: Rgb;
  power: Rgb;
  saturation: number;
};
export const NEUTRAL_CDL: Cdl = {
  slope: [1, 1, 1],
  offset: [0, 0, 0],
  power: [1, 1, 1],
  saturation: 1,
};
const LUMA = lumaCoefficients("bt709");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function applyCdl(
  rgb: Rgb,
  cdl: Cdl,
  style: "asc" | "no-clamp" = "asc",
): Rgb {
  const sop = perChannel((c) => {
    const v = rgb[c] * cdl.slope[c] + cdl.offset[c];
    if (style === "asc") return Math.pow(clamp01(v), cdl.power[c]);
    return v < 0 ? v : Math.pow(v, cdl.power[c]);
  });
  const luma = sop[0] * LUMA[0] + sop[1] * LUMA[1] + sop[2] * LUMA[2];
  return perChannel((c) => {
    const v = luma + cdl.saturation * (sop[c] - luma);
    return style === "asc" ? clamp01(v) : v;
  });
}
