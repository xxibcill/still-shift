export type GaussianKernel = {
  radius: number;
  weights: number[];
  divisor: number;
  lengths: number[];
};
function boxLengths(sigma: number) {
  const width = gaussianBoxWidth(sigma);
  return width < 255
    ? [width, width, width + (width % 2 === 0 ? 1 : 0)]
    : [Math.floor((width * 3) / 2), Math.floor((width * 3) / 2)];
}

/** Inspect storage requirements before allocating weights for transformed masks. */
export function blurKernelLength(sigma: number) {
  const lengths = boxLengths(sigma);
  return lengths.reduce((a, b) => a + b, 0) - lengths.length + 1;
}

/** Three centered box filters for Skia's raster Gaussian approximation. */
export function blurKernel(sigma: number): GaussianKernel {
  const lengths = boxLengths(sigma);
  const length = blurKernelLength(sigma);
  const divisor = lengths.reduce((a, b) => a * b, 1);
  const weights = Array.from({ length }, (_, position) => {
    let count = 0;
    for (let mask = 0; mask < 1 << lengths.length; mask++) {
      let remaining = position,
        sign = 1;
      for (let axis = 0; axis < lengths.length; axis++)
        if (mask & (1 << axis)) {
          remaining -= lengths[axis]!;
          sign = -sign;
        }
      if (remaining >= 0)
        count +=
          sign *
          (lengths.length === 3
            ? ((remaining + 1) * (remaining + 2)) / 2
            : remaining + 1);
    }
    return count;
  });
  return { radius: (length - 1) / 2, weights, divisor, lengths };
}

/** Width, weights and divisor change only at the raster Gaussian's integer boundaries. */
export function gaussianBoxWidth(sigma: number) {
  return Math.max(
    1,
    Math.floor((Math.fround(sigma) * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5),
  );
}
