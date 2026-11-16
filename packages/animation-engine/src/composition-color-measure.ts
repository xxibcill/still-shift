/**
 * CGA measurement: deterministic tonal, saturation and neutral-cast statistics
 * over straight encoded-sRGB RGBA8 frames. Pure functions; frames come from
 * `readColorFrames` (the engine's media path) or from a predicted correction.
 */
import { srgbToLinear } from "@still-shift/renderer-core";

export const COLOR_STATISTICS_VERSION = "still-shift-color-statistics-1";
/** Encoded byte luma weights (sum 256), as the grade and map effects. */
const LUMA = [54, 183, 19] as const;
/** A channel at or above this byte counts as clipped; at or below CRUSHED as crushed. */
export const CLIPPED_BYTE = 254;
export const CRUSHED_BYTE = 1;

export type ColorStatistics = {
  pixels: number;
  luma: {
    mean: number;
    stdev: number;
    p01: number;
    p05: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    p99: number;
    p995: number;
    p005: number;
  };
  /** Share of pixels with any channel ≥ 254 / any channel ≤ 1. */
  clippedFraction: number;
  crushedFraction: number;
  /** HSV saturation (chroma / max). */
  saturation: {
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    p99: number;
    /** Share of pixels with saturation ≥ 0.6. */
    strongFraction: number;
  };
  /**
   * Neutral-cast estimate from near-neutral midtone pixels (saturation < 0.2,
   * luma 0.15–0.95): their mean linear RGB, and the white-balance controls
   * (`color.white-balance` units) that would make that mean neutral.
   */
  neutral: {
    pixels: number;
    fraction: number;
    linearMean: [number, number, number];
    temperature: number;
    tint: number;
    /**
     * Standard deviation of the per-pixel estimates: small when the
     * near-neutral pixels share one cast (true neutrals under a colored light),
     * large when they are a mix of light, real colors (e.g. beige and white).
     */
    temperatureSpread: number;
    tintSpread: number;
  };
  /** Per-frame median luma and its mean absolute frame-to-frame change. */
  frames: { ordinal: number; medianLuma: number }[];
  medianLumaContinuity: number;
};

const round = (value: number, digits = 6) => {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
};
function percentile(histogram: Float64Array, total: number, q: number) {
  // Lower nearest-rank on bin centres of a 4096-bin histogram over 0–1.
  const target = Math.max(1, Math.ceil(q * total));
  let seen = 0;
  for (let bin = 0; bin < histogram.length; bin++) {
    seen += histogram[bin]!;
    if (seen >= target) return bin / (histogram.length - 1);
  }
  return 1;
}

const spread = (sum: number, squares: number, count: number) =>
  count ? Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2)) : 0;
/** Temperature/tint (white-balance units) that neutralize a linear mean. */
export function neutralizingWhiteBalance(mean: readonly number[]) {
  const [r, g, b] = mean.map((value) => Math.log2(Math.max(1e-6, value)));
  return {
    temperature: 100 * (b! - r!),
    tint: 200 * (g! - (r! + b!) / 2),
  };
}

export type ColorFrameLike = { ordinal: number; rgba: Uint8Array };
/**
 * `step` subsamples pixels on a grid (every step-th column and row) for speed;
 * the default 2 keeps a quarter of each frame.
 */
export function measureColorFrames(
  frames: readonly ColorFrameLike[],
  width: number,
  options: { step?: number } = {},
): ColorStatistics {
  const step = options.step ?? 2;
  const lumaBins = new Float64Array(4096),
    satBins = new Float64Array(4096);
  const linear = Array.from({ length: 256 }, (_, v) => srgbToLinear(v / 255));
  let pixels = 0,
    sum = 0,
    squares = 0,
    clipped = 0,
    crushed = 0,
    satSum = 0,
    strong = 0,
    neutralCount = 0;
  const neutralSum = [0, 0, 0];
  const log2 = Array.from({ length: 256 }, (_, v) =>
    Math.log2(Math.max(1e-6, srgbToLinear(v / 255))),
  );
  let tSum = 0,
    tSquares = 0,
    nSum = 0,
    nSquares = 0;
  const perFrame: { ordinal: number; medianLuma: number }[] = [];
  for (const frame of frames) {
    const data = frame.rgba,
      height = data.length / 4 / width;
    const frameBins = new Uint32Array(256 * 256);
    let frameCount = 0;
    for (let y = 0; y < height; y += step)
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i]!,
          g = data[i + 1]!,
          b = data[i + 2]!;
        const luma256 = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
        const luma = luma256 / (256 * 255);
        lumaBins[Math.round(luma * 4095)]!++;
        frameBins[luma256]!++;
        frameCount++;
        sum += luma;
        squares += luma * luma;
        const max = Math.max(r, g, b),
          min = Math.min(r, g, b);
        if (max >= CLIPPED_BYTE) clipped++;
        if (min <= CRUSHED_BYTE) crushed++;
        const saturation = max ? (max - min) / max : 0;
        satBins[Math.round(saturation * 4095)]!++;
        satSum += saturation;
        if (saturation >= 0.6) strong++;
        if (saturation < 0.2 && luma >= 0.15 && luma <= 0.95) {
          neutralCount++;
          neutralSum[0]! += linear[r]!;
          neutralSum[1]! += linear[g]!;
          neutralSum[2]! += linear[b]!;
          const t = 100 * (log2[b]! - log2[r]!),
            n = 200 * (log2[g]! - (log2[r]! + log2[b]!) / 2);
          tSum += t;
          tSquares += t * t;
          nSum += n;
          nSquares += n * n;
        }
      }
    pixels += frameCount;
    let seen = 0,
      median = 0;
    for (let bin = 0; bin < frameBins.length; bin++) {
      seen += frameBins[bin]!;
      if (seen * 2 >= frameCount) {
        median = bin / (256 * 255);
        break;
      }
    }
    perFrame.push({ ordinal: frame.ordinal, medianLuma: round(median) });
  }
  const mean = pixels ? sum / pixels : 0;
  const linearMean = neutralSum.map((value) =>
    neutralCount ? value / neutralCount : 0,
  ) as [number, number, number];
  const balance = neutralCount
    ? neutralizingWhiteBalance(linearMean)
    : { temperature: 0, tint: 0 };
  let continuity = 0;
  for (let i = 1; i < perFrame.length; i++)
    continuity += Math.abs(
      perFrame[i]!.medianLuma - perFrame[i - 1]!.medianLuma,
    );
  const p = (q: number) => round(percentile(lumaBins, pixels, q));
  const s = (q: number) => round(percentile(satBins, pixels, q));
  return {
    pixels,
    luma: {
      mean: round(mean),
      stdev: round(Math.sqrt(Math.max(0, squares / pixels - mean * mean))),
      p005: p(0.005),
      p01: p(0.01),
      p05: p(0.05),
      p25: p(0.25),
      p50: p(0.5),
      p75: p(0.75),
      p95: p(0.95),
      p99: p(0.99),
      p995: p(0.995),
    },
    clippedFraction: round(clipped / pixels),
    crushedFraction: round(crushed / pixels),
    saturation: {
      mean: round(satSum / pixels),
      p10: s(0.1),
      p50: s(0.5),
      p90: s(0.9),
      p99: s(0.99),
      strongFraction: round(strong / pixels),
    },
    neutral: {
      pixels: neutralCount,
      fraction: round(neutralCount / pixels),
      linearMean: linearMean.map((value) => round(value)) as [
        number,
        number,
        number,
      ],
      temperature: round(balance.temperature, 3),
      tint: round(balance.tint, 3),
      temperatureSpread: round(spread(tSum, tSquares, neutralCount), 3),
      tintSpread: round(spread(nSum, nSquares, neutralCount), 3),
    },
    frames: perFrame,
    medianLumaContinuity: round(
      perFrame.length > 1 ? continuity / (perFrame.length - 1) : 0,
    ),
  };
}
