import { type WebglDevice, type WebglSurface } from "./webgl-device.ts";

/** Average byte samples in order, combining the final addition with the resolve. */
export function accumulateWebglExposure(
  device: WebglDevice,
  dst: WebglSurface,
  count: number,
  render: (index: number) => void,
) {
  if (count === 1) {
    render(0);
    return;
  }
  const sum = device.surface(dst.width, dst.height, true);
  let next: WebglSurface | undefined;
  let output: WebglSurface | undefined;
  try {
    next = device.surface(dst.width, dst.height, true);
    // A screen input is snapshotted by the device. Texture destinations require
    // a separate output to avoid framebuffer feedback on the final sample.
    output = dst.screen
      ? dst
      : device.surface(dst.width, dst.height, false, dst.opaque);
    for (let i = 0; i < count; i++) {
      render(i);
      if (i === count - 1) {
        // At the 64-sample cap every sum is an exact integer <= 16,320, so
        // omitting its intermediate float store preserves the original average.
        device.pass(
          "uniform float count; void main() { pixel = floor((texture(backdrop,uv) + floor(texture(source,uv)*255.0+0.5))/count+0.5)/255.0; }",
          output,
          [dst, sum],
          { count },
        );
        if (output !== dst) device.swap(dst, output);
      } else {
        device.pass(
          "void main() { pixel = texture(backdrop,uv) + floor(texture(source,uv)*255.0+0.5); }",
          next,
          [dst, sum],
        );
        device.swap(sum, next);
      }
    }
  } finally {
    device.release(sum);
    if (next) device.release(next);
    if (output && output !== dst) device.release(output);
  }
}
