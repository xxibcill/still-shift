export type AlphaPixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** Cache transparent-pixel counts for constant-time source rectangle checks. */
export function prepareAlphaCoverage(pixels: AlphaPixels) {
  const stride = pixels.width + 1;
  const counts = new Uint32Array(stride * (pixels.height + 1));
  for (let y = 0; y < pixels.height; y++) {
    let transparentInRow = 0;
    for (let x = 0; x < pixels.width; x++) {
      if (pixels.data[(y * pixels.width + x) * 4 + 3]! < 254)
        transparentInRow++;
      counts[(y + 1) * stride + x + 1] =
        counts[y * stride + x + 1]! + transparentInRow;
    }
  }
  return (left: number, top: number, right: number, bottom: number) => {
    const x0 = Math.max(0, Math.floor(left));
    const y0 = Math.max(0, Math.floor(top));
    const x1 = Math.min(pixels.width, Math.ceil(right));
    const y1 = Math.min(pixels.height, Math.ceil(bottom));
    return (
      counts[y1 * stride + x1]! -
        counts[y0 * stride + x1]! -
        counts[y1 * stride + x0]! +
        counts[y0 * stride + x0]! >
      0
    );
  };
}
