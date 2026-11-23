/**
 * Float64 references for the CG2 `grade.*` operators. New code; every
 * operator is unclamped within ±GRADE_LIMIT and its neutral setting is an
 * exact identity.
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
  colorSpace,
  lumaCoefficients,
  rgbToXyzMatrix,
} from "./primaries.ts";
import { transferFunction } from "./transfer.ts";

/** BT.709 luma weights Kr, Kg, Kb (the grade operators' and scopes' Y′). */
export const BT709_LUMA = lumaCoefficients("bt709");
const LUMA = BT709_LUMA;
/** BT.709 Y′ of encoded R′G′B′. */
export const luma709 = (v: readonly number[]) =>
  v[0]! * LUMA[0] + v[1]! * LUMA[1] + v[2]! * LUMA[2];
const luma = luma709;
/**
 * BT.709 Y′CbCr chroma scales, 2(1 − Kb) and 2(1 − Kr):
 * Cb = (B′ − Y′) / BT709_CB_SCALE, Cr = (R′ − Y′) / BT709_CR_SCALE.
 */
export const BT709_CB_SCALE = 1.8556;
export const BT709_CR_SCALE = 1.5748;
/**
 * The magnitude every operator saturates at, so no value in a grade run can
 * overflow to Infinity or become NaN in float32 (the GPU) or float64. It is
 * far outside any displayable value; inside ±GRADE_LIMIT nothing is clamped.
 */
export const GRADE_LIMIT = 10_000;
/** log2(GRADE_LIMIT): `gradePow` saturates once x^p would reach the limit. */
export const LOG2_GRADE_LIMIT = Math.log2(GRADE_LIMIT);
/** Clamp to ±GRADE_LIMIT (an operator's output). */
export const limitGrade = (v: number) =>
  Math.min(GRADE_LIMIT, Math.max(-GRADE_LIMIT, v));
/**
 * x^p for the grade operators: negative x and p = 1 pass through, and a
 * result that would reach GRADE_LIMIT is GRADE_LIMIT (decided in log2, so it
 * never overflows). The GPU kernel mirrors this branch for branch.
 */
export function gradePow(x: number, p: number) {
  if (x < 0 || p === 1) return x;
  if (x > 1 && Math.log2(x) * p >= LOG2_GRADE_LIMIT) return GRADE_LIMIT;
  return Math.pow(x, p);
}

/** Hermite smoothstep of x between e0 and e1 (clamped to 0–1). */
export const smoothstep = (e0: number, e1: number, x: number) => {
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
 * negative values unchanged; `gradePow`) → gain → offset → contrast about the
 * pivot → shadows/highlights (luma-weighted offset) → saturation about
 * Rec.709 luma → hue rotation → color boost, limited to ±GRADE_LIMIT.
 */
export function applyGradePrimary(rgb: Rgb, k: GradePrimaryControls): Rgb {
  const v = perChannel((c) => {
    const lifted = rgb[c] + k.lift[c] * (1 - rgb[c]);
    const curved = gradePow(lifted, 1 / k.gamma[c]);
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
  return perChannel((c) => limitGrade(y2 * (1 - factor) + s[c] * factor));
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

/**
 * Tint ±100 moves the illuminant ±0.02 Duv in CIE 1960 uv, perpendicular to
 * the locus; positive is greener.
 */
export const TINT_DUV_PER_UNIT = 1 / 5000;
export const REFERENCE_CCT = 6500;
/** The white `grade.white-balance` adapts to: BT.709's (D65). */
export const WHITE_BALANCE_TARGET = colorSpace("bt709").white;

type Uv = [number, number];
const xyToUv = ([x, y]: readonly [number, number]): Uv => {
  const d = -2 * x + 12 * y + 3;
  return [(4 * x) / d, (6 * y) / d];
};
const uvToXy = ([u, v]: readonly [number, number]): [number, number] => {
  const e = 2 * u - 8 * v + 4;
  return [(3 * u) / e, (2 * v) / e];
};

/**
 * The locus point at `cct` in CIE 1960 uv with its unit tangent (toward
 * lower temperatures) and unit normal (toward greener, positive Duv).
 */
function locusFrame(cct: number) {
  const [x, y] = planckianXy(cct);
  const d = -2 * x + 12 * y + 3;
  // Tangent in uv from the xy tangent (1, dy/dx) through the Jacobian.
  const dydx = locusSlope(cct, x);
  const tu = (4 * d + 8 * x - 48 * x * dydx) / (d * d);
  const tv = (12 * y + (6 * d - 72 * y) * dydx) / (d * d);
  const norm = Math.hypot(tu, tv);
  const tangent: Uv = [tu / norm, tv / norm];
  const normal: Uv =
    tangent[0] >= 0 ? [-tangent[1], tangent[0]] : [tangent[1], -tangent[0]];
  return { point: xyToUv([x, y]), tangent, normal };
}

/**
 * D65's position relative to the 6500 K locus point, in that point's frame:
 * about +0.0032 along the normal (daylight lies above the black-body locus)
 * and a much smaller amount along the tangent. The tint-0 line keeps this
 * offset in the frame of every temperature, so 6500 K with tint 0 is D65
 * exactly and a light on the locus itself (tungsten, a black body) is
 * neutralized by tint ≈ −16 at its own temperature.
 */
export const TINT_ZERO_OFFSET: {
  readonly normal: number;
  readonly tangent: number;
} = (() => {
  const { point, tangent, normal } = locusFrame(REFERENCE_CCT);
  const target = xyToUv(WHITE_BALANCE_TARGET);
  const du = target[0] - point[0],
    dv = target[1] - point[1];
  return {
    normal: du * normal[0] + dv * normal[1],
    tangent: du * tangent[0] + dv * tangent[1],
  };
})();

/**
 * The illuminant white for a temperature and tint, as xy: the locus point
 * moved by the tint-0 offset and then by `tint` Duv along the normal.
 */
export function temperatureTintWhite(
  cct: number,
  tint: number,
): [number, number] {
  if (cct === REFERENCE_CCT && tint === 0) return [...WHITE_BALANCE_TARGET];
  const { point, tangent, normal } = locusFrame(cct);
  const n = TINT_ZERO_OFFSET.normal + tint * TINT_DUV_PER_UNIT,
    t = TINT_ZERO_OFFSET.tangent;
  return uvToXy([
    point[0] + n * normal[0] + t * tangent[0],
    point[1] + n * normal[1] + t * tangent[1],
  ]);
}

/**
 * Linear BT.709 RGB matrix adapting the stated illuminant (temperature, tint)
 * to D65, BT.709's white, with Bradford, so a grey lit by that illuminant
 * becomes neutral; null (identity) at 6500 K, tint 0, which is D65.
 */
export function whiteBalanceMatrix(cct: number, tint: number): Mat3 | null {
  if (cct === REFERENCE_CCT && tint === 0) return null;
  const npm = rgbToXyzMatrix("bt709");
  const cat = chromaticAdaptationMatrix(
    temperatureTintWhite(cct, tint),
    WHITE_BALANCE_TARGET,
    "bradford",
  );
  return multiply(invert(npm), multiply(cat, npm));
}

/** `grade.white-balance`'s temperature and tint bounds (the effect contract). */
export const WHITE_BALANCE_TEMPERATURE_RANGE = [1667, 25000] as const;
export const WHITE_BALANCE_TINT_RANGE = [-100, 100] as const;

/**
 * The inverse of `temperatureTintWhite`: the temperature (kelvin) and tint
 * whose illuminant white is `white` (xy), so `whiteBalanceMatrix` of the
 * result maps a grey lit by `white` to D65. Solved by Newton's method in
 * mired and tint against the CIE 1960 uv error. `reached` is false when the
 * white lies outside the effect's bounds; the result is then clamped to them
 * and `residualUv` says how far it stays from `white`.
 */
export function temperatureTintForWhite(white: readonly [number, number]): {
  temperature: number;
  tint: number;
  reached: boolean;
  residualUv: number;
} {
  const [minK, maxK] = WHITE_BALANCE_TEMPERATURE_RANGE;
  const [minTint, maxTint] = WHITE_BALANCE_TINT_RANGE;
  const goal = xyToUv(white);
  const uvAt = (mired: number, tint: number) =>
    xyToUv(temperatureTintWhite(1e6 / mired, tint));
  const clampMired = (m: number) =>
    Math.min(1e6 / minK, Math.max(1e6 / maxK, m));
  const clampTint = (t: number) => Math.min(maxTint, Math.max(minTint, t));
  let mired = 1e6 / REFERENCE_CCT,
    tint = 0;
  for (let i = 0; i < 50; i++) {
    const at = uvAt(mired, tint);
    const eu = goal[0] - at[0],
      ev = goal[1] - at[1];
    if (Math.hypot(eu, ev) < 1e-12) break;
    const h = 1e-3;
    const dm = uvAt(
      clampMired(mired + h) === mired ? mired - h : mired + h,
      tint,
    );
    const sm = clampMired(mired + h) === mired ? -h : h;
    const dt = uvAt(mired, tint + h);
    const a = (dm[0] - at[0]) / sm,
      b = (dt[0] - at[0]) / h,
      c = (dm[1] - at[1]) / sm,
      d = (dt[1] - at[1]) / h;
    const det = a * d - b * c;
    if (det === 0) break;
    const nextMired = clampMired(mired + (d * eu - b * ev) / det),
      nextTint = clampTint(tint + (a * ev - c * eu) / det);
    if (nextMired === mired && nextTint === tint) break;
    mired = nextMired;
    tint = nextTint;
  }
  const at = uvAt(mired, tint);
  const residualUv = Math.hypot(goal[0] - at[0], goal[1] - at[1]);
  return {
    temperature: 1e6 / mired,
    tint,
    reached: residualUv < 1e-9,
    residualUv,
  };
}

const srgb = transferFunction("srgb");
/** Sign-mirrored sRGB, so values below 0 survive a linear-light step. */
export const srgbDecodeMirrored = (v: number) =>
  v < 0 ? -srgb.decode(-v) : srgb.decode(v);
export const srgbEncodeMirrored = (v: number) =>
  v < 0 ? -srgb.encode(-v) : srgb.encode(v);

/** Encoded sRGB → linear → matrix → encoded sRGB, limited to ±GRADE_LIMIT. */
export function applyLinearMatrixEncoded(rgb: Rgb, m: Mat3): Rgb {
  const linear = apply(
    m,
    perChannel((c) => srgbDecodeMirrored(rgb[c])),
  );
  return perChannel((c) => limitGrade(srgbEncodeMirrored(linear[c])));
}

// --- grade.rgb-mixer -------------------------------------------------------------

export type RgbMixer = { matrix: Mat3; offset: Rgb };

/**
 * (I + strength·(M − I))·rgb + strength·offset, as `color.matrix` designs it
 * (`applyRgbMixer` limits the result to ±GRADE_LIMIT).
 */
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
  return perChannel((c) => limitGrade(mixed[c] + mixer.offset[c]));
}
