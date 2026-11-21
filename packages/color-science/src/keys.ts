/**
 * CG6 keys: qualifiers, matte finesse, windows, mixing, matte views and the
 * matte-stability metric, as the float64 reference of `grade.key`.
 *
 * Qualifiers read the key's input clamped to 0–1 in the encoded working space.
 * The HSL qualifier is ported from chroma-node `evaluateQualifierMask`
 * (PROVENANCE.md) with one fix: a neutral pixel has no hue, so a hue range
 * selects it only at full width (chroma-node read it as hue 0°, red).
 */
import { ColorScienceError } from "./errors.ts";
import { BT709_LUMA, smoothstep } from "./grade.ts";
import type { Rgb } from "./matrix.ts";
import { transferFunction } from "./transfer.ts";

// --- Qualifiers ----------------------------------------------------------------

/** `grade.key` `qualifier`: 0 none, 1 HSL, 2 RGB, 3 luma, 4 sampled 3D. */
export const KEY_QUALIFIER_MODES = ["none", "hsl", "rgb", "luma", "sampled"];

/** Names follow `comp probe`'s qualifier suggestion (chroma-node `HslQualifier`). */
export type HslRanges = {
  /** Degrees 0–360; width 360 selects every hue, neutral pixels included. */
  hueCenter: number;
  hueWidth: number;
  /** Degrees beyond each side of the width. */
  hueSoftness: number;
  saturationMin: number;
  saturationMax: number;
  saturationSoftness: number;
  /** BT.709 luma Y′ of the encoded input. */
  luminanceMin: number;
  luminanceMax: number;
  luminanceSoftness: number;
};
export type RgbRanges = {
  redMin: number;
  redMax: number;
  greenMin: number;
  greenMax: number;
  blueMin: number;
  blueMax: number;
  rgbSoftness: number;
};
export type SampledRange = {
  /** Picked sample colors in OKLab (see `encodedToOklab`). */
  samplesOklab: readonly Rgb[];
  /** OKLab distance within which the key is 1. */
  sampleRadius: number;
  /** Distance beyond the radius over which the key falls to 0. */
  sampleSoftness: number;
};
export type KeyQualifier = HslRanges &
  RgbRanges &
  SampledRange & {
    qualifier: number;
  };

/** Every range open: each qualifier selects everything. */
export const NEUTRAL_KEY_QUALIFIER: Readonly<KeyQualifier> = Object.freeze({
  qualifier: 0,
  hueCenter: 0,
  hueWidth: 360,
  hueSoftness: 0,
  saturationMin: 0,
  saturationMax: 1,
  saturationSoftness: 0,
  luminanceMin: 0,
  luminanceMax: 1,
  luminanceSoftness: 0,
  redMin: 0,
  redMax: 1,
  greenMin: 0,
  greenMax: 1,
  blueMin: 0,
  blueMax: 1,
  rgbSoftness: 0,
  samplesOklab: Object.freeze([]) as readonly Rgb[],
  sampleRadius: 0.05,
  sampleSoftness: 0.05,
});

/**
 * 1 inside [min, max] (bounds included), falling to 0 over `softness` beyond
 * each bound (Hermite). Reversed bounds are swapped (chroma-node
 * `evaluateLinearRange`).
 */
export function linearRange(
  value: number,
  min: number,
  max: number,
  softness: number,
) {
  const lower = Math.min(min, max),
    upper = Math.max(min, max);
  if (softness <= 0) return value >= lower && value <= upper ? 1 : 0;
  return Math.min(
    smoothstep(lower - softness, lower, value),
    1 - smoothstep(upper, upper + softness, value),
  );
}

/**
 * Hue range on the circle (chroma-node `evaluateHueRange`); `hue` null is a
 * neutral pixel, selected only at full width.
 */
export function hueRange(
  hue: number | null,
  center: number,
  width: number,
  softness: number,
) {
  if (width >= 360) return 1;
  if (hue === null) return 0;
  const raw = Math.abs(hue - center) % 360;
  const distance = Math.min(raw, 360 - raw);
  const half = width / 2;
  if (softness <= 0) return distance <= half ? 1 : 0;
  return 1 - smoothstep(half, half + softness, distance);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const encodedLuma = (v: Rgb) =>
  BT709_LUMA[0] * v[0] + BT709_LUMA[1] * v[1] + BT709_LUMA[2] * v[2];

/** Hexcone hue in degrees (null when neutral) and HSL saturation (chroma-node `rgbToHsl`). */
export function hueSaturation(v: Rgb): [number | null, number] {
  const [r, g, b] = v;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (delta === 0) return [null, 0];
  const lightness = (max + min) / 2;
  const saturation = clamp01(delta / (1 - Math.abs(2 * lightness - 1)));
  const sector =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [(((sector * 60) % 360) + 360) % 360, saturation];
}

/** HSL qualifier on an input already in 0–1. */
export function hslQualifier(v: Rgb, q: HslRanges) {
  const [hue, saturation] = hueSaturation(v);
  return (
    hueRange(hue, q.hueCenter, q.hueWidth, q.hueSoftness) *
    linearRange(
      saturation,
      q.saturationMin,
      q.saturationMax,
      q.saturationSoftness,
    ) *
    linearRange(
      encodedLuma(v),
      q.luminanceMin,
      q.luminanceMax,
      q.luminanceSoftness,
    )
  );
}

export const lumaQualifier = (v: Rgb, q: HslRanges) =>
  linearRange(
    encodedLuma(v),
    q.luminanceMin,
    q.luminanceMax,
    q.luminanceSoftness,
  );

export const rgbQualifier = (v: Rgb, q: RgbRanges) =>
  linearRange(v[0], q.redMin, q.redMax, q.rgbSoftness) *
  linearRange(v[1], q.greenMin, q.greenMax, q.rgbSoftness) *
  linearRange(v[2], q.blueMin, q.blueMax, q.rgbSoftness);

const srgb = transferFunction("srgb");
/** OKLab (Ottosson 2020) of linear BT.709. */
export function linearToOklab(linear: Rgb): Rgb {
  const [r, g, b] = linear;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** OKLab of an encoded sRGB value (the sRGB transfer, BT.709 primaries). */
export const encodedToOklab = (v: Rgb): Rgb =>
  linearToOklab(v.map((c) => srgb.decode(c)) as unknown as Rgb);

/** Sampled 3D key: OKLab distance to the nearest sample (no samples: 0). */
export function sampledQualifier(v: Rgb, q: SampledRange) {
  if (!q.samplesOklab.length) return 0;
  const lab = encodedToOklab(v);
  let nearest = Infinity;
  for (const s of q.samplesOklab)
    nearest = Math.min(
      nearest,
      Math.hypot(lab[0] - s[0], lab[1] - s[1], lab[2] - s[2]),
    );
  if (nearest <= q.sampleRadius) return 1;
  if (q.sampleSoftness <= 0) return 0;
  return (
    1 - smoothstep(q.sampleRadius, q.sampleRadius + q.sampleSoftness, nearest)
  );
}

/** The qualifier matte of an input (clamped to 0–1); mode 0 selects everything. */
export function qualify(v: Rgb, q: KeyQualifier) {
  if (!q.qualifier) return 1;
  const c: Rgb = [clamp01(v[0]), clamp01(v[1]), clamp01(v[2])];
  switch (q.qualifier) {
    case 1:
      return hslQualifier(c, q);
    case 2:
      return rgbQualifier(c, q);
    case 3:
      return lumaQualifier(c, q);
    case 4:
      return sampledQualifier(c, q);
  }
  throw new ColorScienceError(`Unknown qualifier mode ${q.qualifier}`);
}

// --- Matte finesse -------------------------------------------------------------

export type MatteFinesse = {
  /** Levels: values at or below clipBlack → 0, at or above clipWhite → 1. */
  clipBlack: number;
  clipWhite: number;
  /** Passes of a 3×3 median. */
  denoise: number;
  /** Opening radius (removes white specks in black areas). */
  cleanBlack: number;
  /** Closing radius (fills black holes in white areas). */
  cleanWhite: number;
  /** Dilation (> 0) or erosion (< 0) radius. */
  shrinkGrow: number;
  /** Gaussian σ in pixels (the caller supplies the kernel). */
  blur: number;
  /** −1 keeps the blur's softness inside the edge, +1 outside, 0 both. */
  inOutRatio: number;
  invert: number;
};
export const NEUTRAL_MATTE_FINESSE: Readonly<MatteFinesse> = Object.freeze({
  clipBlack: 0,
  clipWhite: 1,
  denoise: 0,
  cleanBlack: 0,
  cleanWhite: 0,
  shrinkGrow: 0,
  blur: 0,
  inOutRatio: 0,
  invert: 0,
});
/** A symmetric odd-length separable kernel: weights[i] / divisor. */
export type MatteKernel = {
  readonly weights: readonly number[];
  readonly divisor: number;
};

/** Whether finesse reads neighbouring pixels (needs the whole matte). */
export const finesseIsSpatial = (f: MatteFinesse) =>
  f.denoise > 0 ||
  f.cleanBlack > 0 ||
  f.cleanWhite > 0 ||
  f.shrinkGrow !== 0 ||
  f.blur > 0;

/** Levels with clipBlack < clipWhite; the default (0, 1) is exact. */
export const clipMatte = (v: number, black: number, white: number) =>
  black === 0 && white === 1
    ? v
    : Math.min(1, Math.max(0, (v - black) / (white - black)));

type Plane = { data: Float64Array; width: number; height: number };
const clampIndex = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);

function median3({ data, width, height }: Plane): Float64Array {
  const out = new Float64Array(data.length);
  const window = new Float64Array(9);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          window[k++] =
            data[
              clampIndex(y + dy, height) * width + clampIndex(x + dx, width)
            ]!;
      window.sort();
      out[y * width + x] = window[4]!;
    }
  return out;
}

/** Separable square min (erode) or max (dilate) of radius r, edges clamped. */
function morph({ data, width, height }: Plane, r: number, dilate: boolean) {
  const pick = dilate ? Math.max : Math.min;
  const row = new Float64Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = data[y * width + x]!;
      for (let d = -r; d <= r; d++)
        v = pick(v, data[y * width + clampIndex(x + d, width)]!);
      row[y * width + x] = v;
    }
  const out = new Float64Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = row[y * width + x]!;
      for (let d = -r; d <= r; d++)
        v = pick(v, row[clampIndex(y + d, height) * width + x]!);
      out[y * width + x] = v;
    }
  return out;
}

/** Separable convolution with a symmetric kernel, edges clamped. */
function convolve({ data, width, height }: Plane, kernel: MatteKernel) {
  const radius = (kernel.weights.length - 1) / 2;
  const row = new Float64Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < kernel.weights.length; i++)
        sum +=
          kernel.weights[i]! *
          data[y * width + clampIndex(x + i - radius, width)]!;
      row[y * width + x] = sum / kernel.divisor;
    }
  const out = new Float64Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < kernel.weights.length; i++)
        sum +=
          kernel.weights[i]! *
          row[clampIndex(y + i - radius, height) * width + x]!;
      out[y * width + x] = sum / kernel.divisor;
    }
  return out;
}

/** In/out ratio: blend the blurred matte toward min (−1) or max (+1) with the unblurred one. */
export function inOutBlend(sharp: number, blurred: number, ratio: number) {
  if (ratio === 0) return blurred;
  const bound = ratio < 0 ? Math.min(sharp, blurred) : Math.max(sharp, blurred);
  const t = Math.abs(ratio);
  return t === 1 ? bound : blurred + (bound - blurred) * t;
}

/**
 * Matte finesse in order: clip → denoise → clean black (opening) → clean
 * white (closing) → shrink/grow → blur with in/out ratio → invert. Neutral
 * finesse returns an identical copy.
 */
export function refineMatte(
  matte: Float64Array,
  width: number,
  height: number,
  f: MatteFinesse,
  kernel?: MatteKernel,
): Float64Array {
  if (matte.length !== width * height)
    throw new ColorScienceError("The matte size does not match its dimensions");
  let data: Float64Array = Float64Array.from(matte, (v) =>
    clipMatte(v, f.clipBlack, f.clipWhite),
  );
  const plane = () => ({ data, width, height });
  for (let i = 0; i < f.denoise; i++) data = median3(plane());
  if (f.cleanBlack > 0)
    data = morph(
      { data: morph(plane(), f.cleanBlack, false), width, height },
      f.cleanBlack,
      true,
    );
  if (f.cleanWhite > 0)
    data = morph(
      { data: morph(plane(), f.cleanWhite, true), width, height },
      f.cleanWhite,
      false,
    );
  if (f.shrinkGrow !== 0)
    data = morph(plane(), Math.abs(f.shrinkGrow), f.shrinkGrow > 0);
  if (f.blur > 0) {
    if (!kernel)
      throw new ColorScienceError("A matte blur needs its Gaussian kernel");
    const blurred = convolve(plane(), kernel);
    data = blurred.map((b, i) => inOutBlend(data[i]!, b, f.inOutRatio));
  }
  if (f.invert) data = data.map((v) => 1 - v);
  return data;
}

// --- Windows, mattes, mixing, views ---------------------------------------------

/** Linear gradient window: 0 at `start`, 1 at `end`, clamped (same points: 1). */
export function gradientWindow(
  x: number,
  y: number,
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return 1;
  return clamp01(((x - start[0]) * dx + (y - start[1]) * dy) / length2);
}

/** External matte levels: (v − low) / (high − low) clamped (low > high reverses), then invert. */
export function matteRange(
  value: number,
  low: number,
  high: number,
  invert: number,
) {
  const v =
    low === 0 && high === 1
      ? clamp01(value)
      : clamp01((value - low) / (high - low));
  return invert ? 1 - v : v;
}

/** The key: clamp(gain · Q · W · G · M + offset, 0, 1). */
export const combineKey = (
  qualifier: number,
  window: number,
  gradient: number,
  matte: number,
  gain: number,
  offset: number,
) => clamp01(gain * qualifier * window * gradient * matte + offset);

/** Input `a` where the key is 0, the scoped result `b` where it is 1. */
export function mixKeyed(a: Rgb, b: Rgb, k: number): Rgb {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

/** Mid gray behind a highlight view. */
export const KEY_VIEW_GRAY = 0.5;
/** `view` 1 gray key, 2 highlight (the scoped result over mid gray), 3 high contrast. */
export function keyView(view: number, k: number, scoped: Rgb): Rgb {
  if (view === 1) return [k, k, k];
  if (view === 2)
    return mixKeyed([KEY_VIEW_GRAY, KEY_VIEW_GRAY, KEY_VIEW_GRAY], scoped, k);
  const c = k > 0 ? 1 : 0;
  return [c, c, c];
}

// --- Matte stability ------------------------------------------------------------

/**
 * Frame-to-frame matte change: mean and largest absolute change (0–1) and
 * the fraction of pixels that changed, over the pixels `include` accepts.
 * Byte mattes are read as value / 255.
 */
export function matteFlicker(
  previous: ArrayLike<number>,
  current: ArrayLike<number>,
  include?: (index: number) => boolean,
  scale = previous instanceof Uint8Array ||
  previous instanceof Uint8ClampedArray
    ? 255
    : 1,
) {
  if (previous.length !== current.length)
    throw new ColorScienceError("Mattes of different sizes");
  let sum = 0,
    changed = 0,
    max = 0,
    n = 0;
  for (let i = 0; i < previous.length; i++) {
    if (include && !include(i)) continue;
    const d = Math.abs(current[i]! - previous[i]!) / scale;
    sum += d;
    if (d > 0) changed++;
    max = Math.max(max, d);
    n++;
  }
  return {
    pixels: n,
    meanChange: n ? sum / n : 0,
    changedFraction: n ? changed / n : 0,
    maxChange: max,
  };
}
