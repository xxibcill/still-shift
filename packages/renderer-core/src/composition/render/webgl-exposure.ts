import { type WebglDevice, type WebglSurface } from "./webgl-device.ts";
import type { Bounds } from "../evaluate/types.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

/** Outside painted bounds, an opaque screen contains these packed RGBA clear bytes. */
type SampleBounds = { background: number | undefined; painted: Bounds | null };
const BOUNDED_SAMPLE = `uniform vec2 origin; uniform vec4 backgroundBytes;
vec4 sampleBytes() {
  return floor(texelFetch(source,ivec2(gl_FragCoord.xy)-ivec2(origin),0)*255.0+0.5);
}`;

/** Average byte samples in order, combining the final addition with the resolve. */
export function accumulateWebglExposure(
  device: WebglDevice,
  dst: WebglSurface,
  count: number,
  render: (index: number) => SampleBounds | void,
) {
  if (count === 1) {
    render(0);
    return;
  }
  const sum = device.surface(dst.width, dst.height, true);
  let next: WebglSurface | undefined;
  let output: WebglSurface | undefined;
  let background: number[] | undefined;
  let backgroundKey: number | undefined;
  let painted: Bounds | null = null;
  try {
    next = device.surface(dst.width, dst.height, true);
    // A screen input is snapshotted by the device. Texture destinations require
    // a separate output to avoid framebuffer feedback on the final sample.
    output = dst.screen
      ? dst
      : device.surface(dst.width, dst.height, false, dst.opaque);
    for (let i = 0; i < count; i++) {
      const sample = render(i);
      if (i === 0 && dst.screen && sample?.background !== undefined) {
        backgroundKey = sample.background;
        background = [0, 8, 16, 24].map(
          (shift) => (backgroundKey! >>> shift) & 255,
        );
      }
      if (background) {
        // Any uncertainty expands the union to the full screen. Subtracting the
        // first clear bytes is still exact when later backgrounds differ.
        if (!sample || sample.background !== backgroundKey)
          painted = { left: 0, top: 0, right: dst.width, bottom: dst.height };
        else if (sample.painted)
          painted = painted
            ? unionBounds(painted, sample.painted)
            : sample.painted;
        if (!painted) continue;
        const source = device.copyRegion(dst, painted);
        try {
          const last = i === count - 1;
          // Restore the nonnegative integer byte sum before division. Dividing
          // signed differences first can move half-byte ties after cancellation.
          device.pass(
            BOUNDED_SAMPLE +
              (last
                ? "uniform float count; void main() { pixel=floor((texelFetch(backdrop,ivec2(gl_FragCoord.xy),0)+sampleBytes()+backgroundBytes*(count-1.0))/count+0.5)/255.0; }"
                : "void main() { pixel=texelFetch(backdrop,ivec2(gl_FragCoord.xy),0)+sampleBytes()-backgroundBytes; }"),
            last ? dst : next,
            [source, sum],
            {
              origin: [painted.left, painted.top],
              backgroundBytes: background,
              count,
            },
            false,
            painted,
          );
          if (!last) device.swap(sum, next);
        } finally {
          device.release(source);
        }
        continue;
      }
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
