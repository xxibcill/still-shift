/**
 * RGB color spaces: primaries, white points, normalized primary matrices,
 * conversions and chromatic adaptation.
 *
 * Provenance: the normalized primary matrix (SMPTE RP 177-1993 method,
 * `buildRgbToXyzMatrix` / `buildPrimariesConversionMatrix`) is ported from
 * chroma-node `src/shared/colorEngine.ts` at b804dc0; chroma-node matches the
 * CG0 BT.709 matrix to 1.1e-16. Its primaries table (5 spaces) is replaced by
 * the 19 spaces below, each from its published document. Chromatic adaptation
 * is new (chroma-node has none).
 */
import { ColorScienceError } from "./errors.ts";
import { apply, diagonal, invert, multiply, type Mat3 } from "./matrix.ts";

type Xy = readonly [number, number];
export type ColorSpace = {
  id: string;
  name: string;
  primaries: { r: Xy; g: Xy; b: Xy };
  /** White point chromaticity. */
  white: Xy;
  whiteName: string;
  source: string;
};

const D65: Xy = [0.3127, 0.329];
const ACES_WHITE: Xy = [0.32168, 0.33767];
const BT709 = { r: [0.64, 0.33], g: [0.3, 0.6], b: [0.15, 0.06] } as const;
const BT2020 = {
  r: [0.708, 0.292],
  g: [0.17, 0.797],
  b: [0.131, 0.046],
} as const;
const P3 = { r: [0.68, 0.32], g: [0.265, 0.69], b: [0.15, 0.06] } as const;

const space = (
  id: string,
  name: string,
  primaries: ColorSpace["primaries"],
  white: Xy,
  whiteName: string,
  source: string,
): ColorSpace => ({ id, name, primaries, white, whiteName, source });

export const COLOR_SPACES: readonly ColorSpace[] = [
  space(
    "bt709",
    "ITU-R BT.709",
    BT709,
    D65,
    "D65",
    "ITU-R BT.709-6, Part 2 items 1.3-1.4",
  ),
  space("srgb", "sRGB", BT709, D65, "D65", "IEC 61966-2-1:1999"),
  space(
    "bt2020",
    "ITU-R BT.2020",
    BT2020,
    D65,
    "D65",
    "ITU-R BT.2020-2, Table 3",
  ),
  space(
    "dci-p3",
    "DCI-P3",
    P3,
    [0.314, 0.351],
    "DCI-P3",
    "SMPTE RP 431-2:2011",
  ),
  space("p3-d65", "P3-D65", P3, D65, "D65", "SMPTE EG 432-1:2010"),
  space(
    "display-p3",
    "Display P3",
    P3,
    D65,
    "D65",
    "Apple Display P3 (P3 primaries, D65)",
  ),
  space(
    "aces-ap0",
    "ACES2065-1",
    { r: [0.7347, 0.2653], g: [0, 1], b: [0.0001, -0.077] },
    ACES_WHITE,
    "ACES",
    "SMPTE ST 2065-1:2012 / Academy S-2014-004",
  ),
  space(
    "aces-ap1",
    "ACEScg",
    { r: [0.713, 0.293], g: [0.165, 0.83], b: [0.128, 0.044] },
    ACES_WHITE,
    "ACES",
    "Academy S-2014-004",
  ),
  space(
    "arri-awg3",
    "ARRI Wide Gamut 3",
    { r: [0.684, 0.313], g: [0.221, 0.848], b: [0.0861, -0.102] },
    D65,
    "D65",
    "ARRI (2012), ALEXA Log C Curve - Usage in VFX",
  ),
  space(
    "arri-awg4",
    "ARRI Wide Gamut 4",
    { r: [0.7347, 0.2653], g: [0.1424, 0.8576], b: [0.0991, -0.0308] },
    D65,
    "D65",
    "ARRI (2022), ARRI LogC4 Logarithmic Color Space Specification",
  ),
  space(
    "sony-sgamut3",
    "S-Gamut3",
    { r: [0.73, 0.28], g: [0.14, 0.855], b: [0.1, -0.05] },
    D65,
    "D65",
    "Sony, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
  ),
  space(
    "sony-sgamut3-cine",
    "S-Gamut3.Cine",
    { r: [0.766, 0.275], g: [0.225, 0.8], b: [0.089, -0.087] },
    D65,
    "D65",
    "Sony, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
  ),
  space(
    "panasonic-vgamut",
    "V-Gamut",
    { r: [0.73, 0.28], g: [0.165, 0.84], b: [0.1, -0.03] },
    D65,
    "D65",
    "Panasonic (2014), VARICAM V-Log/V-Gamut reference manual",
  ),
  space(
    "red-wide-gamut",
    "REDWideGamutRGB",
    {
      r: [0.780308, 0.304253],
      g: [0.121595, 1.493994],
      b: [0.095612, -0.084589],
    },
    D65,
    "D65",
    "RED Digital Cinema (2017), White Paper on REDWideGamutRGB and Log3G10",
  ),
  space(
    "canon-cinema-gamut",
    "Cinema Gamut",
    { r: [0.74, 0.27], g: [0.17, 1.14], b: [0.08, -0.1] },
    D65,
    "D65",
    "Canon (2014), EOS C500 Cinema Gamut white paper",
  ),
  space(
    "bmd-wide-gamut",
    "Blackmagic Wide Gamut",
    {
      r: [0.7177215, 0.3171181],
      g: [0.228041, 0.861569],
      b: [0.1005841, -0.0820452],
    },
    [0.312717, 0.3290312],
    "Blackmagic Wide Gamut",
    "Blackmagic Design (2021), Blackmagic Generation 5 Color Science technical reference",
  ),
  space(
    "dji-dgamut",
    "DJI D-Gamut",
    { r: [0.71, 0.31], g: [0.21, 0.88], b: [0.09, -0.08] },
    D65,
    "D65",
    "DJI (2017), White Paper on D-Log and D-Gamut of DJI Cinema Color System",
  ),
  space(
    "fujifilm-fgamut",
    "F-Gamut",
    BT2020,
    D65,
    "D65",
    "FUJIFILM (2016), F-Log Data Sheet (F-Gamut = BT.2020)",
  ),
  space(
    "nikon-ngamut",
    "N-Gamut",
    BT2020,
    D65,
    "D65",
    "Nikon (2018), N-Log Specification 1.0.0 (N-Gamut = BT.2020)",
  ),
];

export const COLOR_SPACE_IDS = COLOR_SPACES.map((s) => s.id);

export function colorSpace(id: string): ColorSpace {
  const found = COLOR_SPACES.find((s) => s.id === id);
  if (!found) throw new ColorScienceError(`Unknown color space "${id}"`);
  return found;
}

const xyToXyz = ([x, y]: Xy): [number, number, number] => {
  if (y === 0) throw new ColorScienceError("Chromaticity y must not be 0");
  return [x / y, 1, (1 - x - y) / y];
};

/** Linear RGB → CIE XYZ with Y(white) = 1 (SMPTE RP 177-1993). */
export function normalizedPrimaryMatrix(
  primaries: ColorSpace["primaries"],
  white: Xy,
): number[] {
  const r = xyToXyz(primaries.r),
    g = xyToXyz(primaries.g),
    b = xyToXyz(primaries.b);
  const p = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
  const s = apply(invert(p), xyToXyz(white));
  return multiply(p, diagonal(s));
}

export function rgbToXyzMatrix(
  id: string,
  direction: "forward" | "inverse" = "forward",
): number[] {
  const s = colorSpace(id);
  const m = normalizedPrimaryMatrix(s.primaries, s.white);
  return direction === "forward" ? m : invert(m);
}

export type ChromaticAdaptation = "bradford" | "cat02";
const CONE_RESPONSE: Record<ChromaticAdaptation, Mat3> = {
  // Lam (1985), as used by ICC and SMPTE.
  bradford: [
    0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
  ],
  // CIE 159:2004 (CIECAM02).
  cat02: [
    0.7328, 0.4296, -0.1624, -0.7036, 1.6975, 0.0061, 0.003, 0.0136, 0.9834,
  ],
};

/** Von Kries adaptation of XYZ from one white point to another. */
export function chromaticAdaptationMatrix(
  source: Xy,
  target: Xy,
  method: ChromaticAdaptation,
): number[] {
  const m = CONE_RESPONSE[method];
  const s = apply(m, xyToXyz(source)),
    t = apply(m, xyToXyz(target));
  return multiply(
    invert(m),
    multiply(diagonal([t[0] / s[0], t[1] / s[1], t[2] / s[2]]), m),
  );
}

const sameWhite = (a: Xy, b: Xy) => a[0] === b[0] && a[1] === b[1];

/**
 * Linear RGB in `source` → linear RGB in `target`. A white-point change needs
 * a stated adaptation; it is never assumed.
 */
export function rgbConversionMatrix(
  source: string,
  target: string,
  adaptation?: ChromaticAdaptation,
): number[] {
  const s = colorSpace(source),
    t = colorSpace(target);
  const toXyz = normalizedPrimaryMatrix(s.primaries, s.white);
  const fromXyz = invert(normalizedPrimaryMatrix(t.primaries, t.white));
  if (adaptation === undefined) {
    if (!sameWhite(s.white, t.white))
      throw new ColorScienceError(
        `"${source}" (${s.whiteName}) and "${target}" (${t.whiteName}) have different white points; state a chromatic adaptation`,
      );
    return multiply(fromXyz, toXyz);
  }
  return multiply(
    fromXyz,
    multiply(chromaticAdaptationMatrix(s.white, t.white, adaptation), toXyz),
  );
}

/** Published luma coefficients (Kr, Kg, Kb). */
const LUMA: Record<string, readonly [number, number, number]> = {
  bt601: [0.299, 0.587, 0.114],
  bt709: [0.2126, 0.7152, 0.0722],
  bt2020: [0.2627, 0.678, 0.0593],
};
export function lumaCoefficients(
  id: "bt601" | "bt709" | "bt2020",
): [number, number, number] {
  const found = LUMA[id];
  if (!found) throw new ColorScienceError(`Unknown luma coefficients "${id}"`);
  return [...found];
}
