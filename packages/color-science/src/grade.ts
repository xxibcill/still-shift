/**
 * Float64 references for the CG2 `grade.*` operators. New code; every
 * operator is unclamped and its neutral setting is an exact identity.
 *
 * The legacy working space (CG2) is encoded sRGB, as the existing `color.*`
 * effects; `grade.white-balance` linearizes internally (sign-mirrored sRGB) to
 * adapt in linear light. The renderer evaluates a run of these operators in
 * float (GPU float32, Canvas float64 via this module) and quantizes once.
 */
import { ColorScienceError } from "./errors.ts";
import {
  apply,
  invert,
  multiply,
  perChannel,
  type Mat3,
  type Rgb,
} from "./matrix.ts";
import {
  chromaticAdaptationMatrix,
  lumaCoefficients,
  rgbToXyzMatrix,
} from "./primaries.ts";
import { transferFunction } from "./transfer.ts";

const LUMA = lumaCoefficients("bt709");
const luma = (v: readonly number[]) =>
  v[0]! * LUMA[0] + v[1]! * LUMA[1] + v[2]! * LUMA[2];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// --- grade.primary -----------------------------------------------------------

/** Effective per-channel controls (master already combined by the caller). */
export type GradePrimary = {
  lift: Rgb;
  gamma: Rgb;
  gain: Rgb;
  offset: Rgb;
  contrast: number;
  pivot: number;
  saturation: number;
  /** Degrees about the Rec.709 luma axis. */
  hue: number;
  /** Saturation boost weighted toward low-saturation pixels; 0 is neutral. */
  colorBoost: number;
  shadows: number;
  highlights: number;
};
export const NEUTRAL_GRADE_PRIMARY: GradePrimary = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  offset: [0, 0, 0],
  contrast: 1,
  pivot: 0.5,
  saturation: 1,
  hue: 0,
  colorBoost: 0,
  shadows: 0,
  highlights: 0,
};
export type GradePrimaryControls = GradePrimary & {
  /** Hue rotation, or null when the hue is 0. */
  hueMatrix: Mat3 | null;
};

/** Shadow and highlight weights over luma (shared with the GPU kernel). */
export const SHADOW_RANGE = [0, 0.6] as const;
export const HIGHLIGHT_RANGE = [0.4, 1] as const;
/** Shadows/highlights ±1 add at most ±0.25 to every channel at full weight. */
export const TONAL_AMOUNT = 0.25;

/** Rotation by `degrees` in the BT.709 (Cb, Cr) plane; luma is unchanged. */
export function hueRotationMatrix(degrees: number): Mat3 {
  const [kr, , kb] = LUMA;
  const kg = LUMA[1];
  // RGB → (Y, Cb, Cr) and back.
  const toYcc = [
    kr,
    kg,
    kb,
    -kr / (2 * (1 - kb)),
    -kg / (2 * (1 - kb)),
    0.5,
    0.5,
    -kg / (2 * (1 - kr)),
    -kb / (2 * (1 - kr)),
  ];
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians),
    s = Math.sin(radians);
  const rotate = [1, 0, 0, 0, c, -s, 0, s, c];
  return multiply(invert(toYcc), multiply(rotate, toYcc));
}

export function gradePrimaryControls(p: GradePrimary): GradePrimaryControls {
  return { ...p, hueMatrix: p.hue === 0 ? null : hueRotationMatrix(p.hue) };
}

/**
 * lift (v + lift·(1 − v): black moves, white stays) → gamma (v^(1/gamma);
 * negative values unchanged) → gain → offset → contrast about the pivot →
 * shadows/highlights (luma-weighted offset) → saturation about Rec.709 luma →
 * hue rotation → color boost.
 */
export function applyGradePrimary(rgb: Rgb, k: GradePrimaryControls): Rgb {
  const v = perChannel((c) => {
    const lifted = rgb[c] + k.lift[c] * (1 - rgb[c]);
    const curved = lifted < 0 ? lifted : Math.pow(lifted, 1 / k.gamma[c]);
    return (
      (curved * k.gain[c] + k.offset[c]) * k.contrast +
      k.pivot * (1 - k.contrast)
    );
  });
  const y0 = luma(v);
  const tonal =
    TONAL_AMOUNT *
    (k.shadows * (1 - smoothstep(SHADOW_RANGE[0], SHADOW_RANGE[1], y0)) +
      k.highlights * smoothstep(HIGHLIGHT_RANGE[0], HIGHLIGHT_RANGE[1], y0));
  const t = perChannel((c) => v[c] + tonal);
  const y1 = luma(t);
  let s = perChannel((c) => y1 * (1 - k.saturation) + t[c] * k.saturation);
  if (k.hueMatrix) s = apply(k.hueMatrix, s);
  const max = Math.max(...s),
    min = Math.min(...s);
  const sat = max > 0 ? Math.min(1, Math.max(0, (max - min) / max)) : 0;
  const factor = 1 + k.colorBoost * (1 - sat);
  const y2 = luma(s);
  return perChannel((c) => y2 * (1 - factor) + s[c] * factor);
}

// --- grade.white-balance -------------------------------------------------------

/** Planckian locus xy, Kang et al. (2002), valid 1667–25000 K. */
export function planckianXy(cct: number): [number, number] {
  if (!(cct >= 1667 && cct <= 25000))
    throw new ColorScienceError(
      `Colour temperature ${cct} K is outside 1667–25000 K`,
    );
  const t3 = cct ** 3,
    t2 = cct ** 2;
  const x =
    cct <= 4000
      ? (-0.2661239 * 10 ** 9) / t3 -
        (0.2343589 * 10 ** 6) / t2 +
        (0.8776956 * 10 ** 3) / cct +
        0.17991
      : (-3.0258469 * 10 ** 9) / t3 +
        (2.1070379 * 10 ** 6) / t2 +
        (0.2226347 * 10 ** 3) / cct +
        0.24039;
  const x3 = x ** 3,
    x2 = x ** 2;
  const y =
    cct <= 2222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : cct <= 4000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** dy/dx of the locus polynomial in use at `cct`. */
function locusSlope(cct: number, x: number) {
  const [p, q, r] =
    cct <= 2222
      ? [-1.1063814, -1.3481102, 2.18555832]
      : cct <= 4000
        ? [-0.9549476, -1.37418593, 2.09137015]
        : [3.081758, -5.8733867, 3.75112997];
  return 3 * p * x * x + 2 * q * x + r;
}

/** Tint ±100 is Duv ±0.02 in CIE 1960 uv; positive is greener (above the locus). */
export const TINT_DUV_PER_UNIT = 1 / 5000;
export const REFERENCE_CCT = 6500;

/** The illuminant white for a temperature and tint, as xy. */
export function temperatureTintWhite(
  cct: number,
  tint: number,
): [number, number] {
  const [x, y] = planckianXy(cct);
  if (tint === 0) return [x, y];
  const d = -2 * x + 12 * y + 3;
  const u = (4 * x) / d,
    v = (6 * y) / d;
  // Tangent in uv from the xy tangent (1, dy/dx) through the Jacobian.
  const dydx = locusSlope(cct, x);
  const tu = (4 * d + 8 * x - 48 * x * dydx) / (d * d);
  const tv = (12 * y + (6 * d - 72 * y) * dydx) / (d * d);
  const norm = Math.hypot(tu, tv);
  let nu = -tv / norm,
    nv = tu / norm;
  if (nv < 0) {
    nu = -nu;
    nv = -nv;
  }
  const duv = tint * TINT_DUV_PER_UNIT;
  const u2 = u + duv * nu,
    v2 = v + duv * nv;
  const e = 2 * u2 - 8 * v2 + 4;
  return [(3 * u2) / e, (2 * v2) / e];
}

/**
 * Linear BT.709 RGB matrix adapting the stated illuminant (temperature, tint)
 * to the 6500 K locus white with Bradford; null (identity) at 6500 K, tint 0.
 */
export function whiteBalanceMatrix(cct: number, tint: number): Mat3 | null {
  if (cct === REFERENCE_CCT && tint === 0) return null;
  const npm = rgbToXyzMatrix("bt709");
  const cat = chromaticAdaptationMatrix(
    temperatureTintWhite(cct, tint),
    planckianXy(REFERENCE_CCT),
    "bradford",
  );
  return multiply(invert(npm), multiply(cat, npm));
}

const srgb = transferFunction("srgb");
/** Sign-mirrored sRGB, so values below 0 survive a linear-light step. */
export const srgbDecodeMirrored = (v: number) =>
  v < 0 ? -srgb.decode(-v) : srgb.decode(v);
export const srgbEncodeMirrored = (v: number) =>
  v < 0 ? -srgb.encode(-v) : srgb.encode(v);

/** Encoded sRGB → linear → matrix → encoded sRGB. */
export function applyLinearMatrixEncoded(rgb: Rgb, m: Mat3): Rgb {
  const linear = apply(
    m,
    perChannel((c) => srgbDecodeMirrored(rgb[c])),
  );
  return perChannel((c) => srgbEncodeMirrored(linear[c]));
}

// --- grade.rgb-mixer -------------------------------------------------------------

export type RgbMixer = { matrix: Mat3; offset: Rgb };

/** (I + strength·(M − I))·rgb + strength·offset, as `color.matrix` designs it. */
export function rgbMixer(
  matrix: Mat3,
  offset: Rgb,
  strength: number,
): RgbMixer {
  return {
    matrix: matrix.map((value, i) => {
      const identity = i % 4 === 0 ? 1 : 0;
      return identity + strength * (value - identity);
    }),
    offset: perChannel((c) => strength * offset[c]),
  };
}
export function applyRgbMixer(rgb: Rgb, mixer: RgbMixer): Rgb {
  const mixed = apply(mixer.matrix, rgb);
  return perChannel((c) => mixed[c] + mixer.offset[c]);
}
