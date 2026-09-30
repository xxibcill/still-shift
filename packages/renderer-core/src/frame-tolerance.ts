/**
 * Frame comparison metrics and tolerance tiers for composition-engine parity
 * (docs/composition-engine-plan.md, CE0). Frames are RGBA or RGB byte arrays of equal
 * size; alpha is ignored because exports are opaque.
 */

export const FRAME_TOLERANCE_VERSION = "frame-tolerance-1" as const;

export type ToleranceTier = "exact" | "near" | "perceptual";

export type FrameComparison = {
  /** Largest absolute difference on any colour channel, 0–255. */
  maxChannelDelta: number;
  /** Number of colour channel values that differ at all. */
  differingChannels: number;
  /** Peak signal-to-noise ratio over RGB in dB; `Infinity` for identical frames. */
  psnr: number;
  /** Mean structural similarity of luma over 8×8 windows with stride 4; 1 when identical. */
  ssim: number;
};

/**
 * Tier thresholds. A frame meets a tier when it satisfies that tier's limits; tiers are
 * ordered from strictest to loosest.
 */
export const TOLERANCE_TIERS = {
  exact: { maxChannelDelta: 0 },
  near: { maxChannelDelta: 2, minPsnr: 50 },
  perceptual: { minPsnr: 40, minSsim: 0.99 },
} as const;

const TIER_ORDER: ToleranceTier[] = ["exact", "near", "perceptual"];

function channels(frame: Uint8Array | Uint8ClampedArray, pixels: number) {
  if (frame.length === pixels * 4) return 4;
  if (frame.length === pixels * 3) return 3;
  throw new Error("Frame size does not match its dimensions");
}

/** Rec. 709 luma of every pixel, in 0–255. */
function luma(
  frame: Uint8Array | Uint8ClampedArray,
  pixels: number,
  stride: number,
) {
  const values = new Float64Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * stride;
    values[pixel] =
      0.2126 * frame[offset]! +
      0.7152 * frame[offset + 1]! +
      0.0722 * frame[offset + 2]!;
  }
  return values;
}

function structuralSimilarity(
  a: Float64Array,
  b: Float64Array,
  width: number,
  height: number,
) {
  const window = Math.min(8, width, height);
  const step = Math.max(1, window >> 1);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const count = window * window;
  let total = 0;
  let windows = 0;
  for (let top = 0; top + window <= height; top += step)
    for (let left = 0; left + window <= width; left += step) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      for (let y = top; y < top + window; y += 1)
        for (let x = left; x < left + window; x += 1) {
          const va = a[y * width + x]!;
          const vb = b[y * width + x]!;
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      const meanA = sumA / count;
      const meanB = sumB / count;
      const varianceA = sumAA / count - meanA * meanA;
      const varianceB = sumBB / count - meanB * meanB;
      const covariance = sumAB / count - meanA * meanB;
      total +=
        ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
        ((meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2));
      windows += 1;
    }
  return windows ? total / windows : 1;
}

export function compareFrames(
  reference: Uint8Array | Uint8ClampedArray,
  actual: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): FrameComparison {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1)
    throw new Error("Frame dimensions must be positive integers");
  const pixels = width * height;
  const strideA = channels(reference, pixels);
  const strideB = channels(actual, pixels);
  let maxChannelDelta = 0;
  let differingChannels = 0;
  let squaredError = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1)
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(
        reference[pixel * strideA + channel]! -
          actual[pixel * strideB + channel]!,
      );
      if (delta) {
        differingChannels += 1;
        if (delta > maxChannelDelta) maxChannelDelta = delta;
        squaredError += delta * delta;
      }
    }
  if (!differingChannels)
    return { maxChannelDelta, differingChannels, psnr: Infinity, ssim: 1 };
  const meanSquaredError = squaredError / (pixels * 3);
  return {
    maxChannelDelta,
    differingChannels,
    psnr: 10 * Math.log10((255 * 255) / meanSquaredError),
    ssim: structuralSimilarity(
      luma(reference, pixels, strideA),
      luma(actual, pixels, strideB),
      width,
      height,
    ),
  };
}

export function meetsTier(comparison: FrameComparison, tier: ToleranceTier) {
  switch (tier) {
    case "exact":
      return comparison.maxChannelDelta === 0;
    case "near":
      return (
        comparison.maxChannelDelta <= TOLERANCE_TIERS.near.maxChannelDelta &&
        comparison.psnr >= TOLERANCE_TIERS.near.minPsnr
      );
    case "perceptual":
      return (
        comparison.psnr >= TOLERANCE_TIERS.perceptual.minPsnr &&
        comparison.ssim >= TOLERANCE_TIERS.perceptual.minSsim
      );
  }
}

/** Strictest tier the comparison meets, or `null` when it misses every tier. */
export function strictestTier(comparison: FrameComparison) {
  return TIER_ORDER.find((tier) => meetsTier(comparison, tier)) ?? null;
}

/** The loosest tier among several comparisons, e.g. every sampled frame of a fixture. */
export function worstTier(
  tiers: (ToleranceTier | null)[],
): ToleranceTier | null {
  if (tiers.some((tier) => tier === null)) return null;
  return (
    [...TIER_ORDER].reverse().find((tier) => tiers.includes(tier)) ?? "exact"
  );
}
