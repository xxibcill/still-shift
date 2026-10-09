/** Convert owned premultiplied readback bytes in place; alpha remains linear. */
export function unpremultiplyRgba(pixels: Uint8Array): Uint8ClampedArray {
  const result = new Uint8ClampedArray(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength,
  );
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3]!;
    for (let channel = 0; channel < 3; channel++)
      result[offset + channel] = alpha
        ? Math.round((pixels[offset + channel]! * 255) / alpha)
        : 0;
  }
  return result;
}

/** Match Canvas capture's normalized float32 conversion for a transparent drawing buffer. */
export function unpremultiplyDrawingBufferRgba(
  pixels: Uint8Array,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength,
  );
  const f = Math.fround;
  const byteToUnit = f(1 / 255);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3]!;
    const scale = alpha ? f(1 / f(alpha * byteToUnit)) : 0;
    for (let channel = 0; channel < 3; channel++)
      result[offset + channel] = f(
        f(f(pixels[offset + channel]! * byteToUnit) * scale) * 255,
      );
  }
  return result;
}
