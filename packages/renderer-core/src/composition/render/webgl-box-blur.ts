import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import type { WebglRect } from "./webgl-bounds.ts";

type BoxKernel = { radius: number; divisor: number; lengths: number[] };
const SUM = `uniform vec2 direction; uniform float count; uniform float extra;
uniform vec2 sumOffset; uniform vec2 baseOffset;
uniform vec2 sumSize; uniform vec2 baseSize;
uniform float sumScale; uniform float baseScale;
vec4 sumAt(ivec2 p) {
  return any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,ivec2(sumSize)))
    ? vec4(0.0) : (sumScale==1.0?texelFetch(source,p,0):floor(texelFetch(source,p,0)*255.0+0.5));
}
vec4 baseAt(ivec2 p) {
  return any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,ivec2(baseSize)))
    ? vec4(0.0) : (baseScale==1.0?texelFetch(backdrop,p,0):floor(texelFetch(backdrop,p,0)*255.0+0.5));
}
void main() {
  ivec2 p=ivec2(gl_FragCoord.xy);
  pixel=sumAt(p+ivec2(sumOffset))+sumAt(p+ivec2(sumOffset-direction*count));
  if(extra>0.0) pixel+=baseAt(p+ivec2(baseOffset-direction*(count*2.0)));
}`;
const DIVIDE = `uniform vec2 offset; uniform float halfDivisor; uniform vec2 factorParts;
uint multiplyHigh(uint a, uint b) {
  uint a0=a&65535u,a1=a>>16,b0=b&65535u,b1=b>>16;
  uint low=a0*b0, middle=a1*b0+(low>>16);
  uint carry=middle>>16;
  middle=(middle&65535u)+a0*b1;
  return a1*b1+carry+(middle>>16);
}
void main() {
  uvec4 sum=uvec4(texelFetch(source,ivec2(gl_FragCoord.xy+offset),0))+uvec4(uint(halfDivisor));
  uint factor=uint(factorParts.x)+(uint(factorParts.y)<<16);
  pixel=vec4(multiplyHigh(sum.r,factor),multiplyHigh(sum.g,factor),multiplyHigh(sum.b,factor),multiplyHigh(sum.a,factor))/255.0;
}`;

/** Exact integer box sums in logarithmic passes; RGBA32F integers remain exact below 2^24. */
export function boxBlur(
  device: WebglDevice,
  dst: WebglSurface,
  kernel: BoxKernel,
  painted?: WebglRect,
) {
  if (
    kernel.lengths.some((length) => length < 4) ||
    kernel.divisor * 255 >= 16777216
  )
    return false;
  const padding = kernel.radius * 2;
  const region = painted
    ? {
        left: Math.max(0, painted.left - kernel.radius),
        top: Math.max(0, painted.top - kernel.radius),
        right: Math.min(dst.width, painted.right + kernel.radius),
        bottom: Math.min(dst.height, painted.bottom + kernel.radius),
      }
    : { left: 0, top: 0, right: dst.width, bottom: dst.height };
  const outWidth = region.right - region.left,
    outHeight = region.bottom - region.top;
  // Nearby radii share pooled storage; shaders respect each axis's logical extent.
  const width = Math.ceil((outWidth + padding) / 128) * 128,
    height = Math.ceil((outHeight + padding) / 128) * 128;
  const maximum = device.gl.getParameter(device.gl.MAX_TEXTURE_SIZE) as number;
  if (
    width > maximum ||
    height > maximum ||
    width * height * 16 * 3 + outWidth * outHeight * 4 > 128 * 1024 * 1024
  )
    return false;
  const buffers: WebglSurface[] = [];
  const scratch = device.surface(outWidth, outHeight);
  try {
    for (let i = 0; i < 3; i++)
      buffers.push(device.surface(width, height, true));
    const factor = Math.round(4294967296 / kernel.divisor);
    for (const axis of [0, 1]) {
      const input = axis === 0 ? dst : scratch,
        output = axis === 0 ? scratch : dst;
      const direction: [number, number] = axis === 0 ? [1, 0] : [0, 1];
      const extent = [
        outWidth + padding * direction[0],
        outHeight + padding * direction[1],
      ];
      let current = input;
      for (const length of kernel.lengths) {
        const base = current;
        const baseScale = base === input ? 255 : 1;
        const baseOffset =
          base === input
            ? [
                (axis === 0 ? region.left : 0) - direction[0] * kernel.radius,
                (axis === 0 ? region.top : 0) - direction[1] * kernel.radius,
              ]
            : [0, 0];
        const baseSize = base === input ? [input.width, input.height] : extent;
        let count = 1;
        for (const bit of length.toString(2).slice(1)) {
          const next = buffers.find(
            (buffer) => buffer !== base && buffer !== current,
          )!;
          const initial = current === input;
          device.pass(
            SUM,
            next,
            [current, base],
            {
              direction,
              count,
              extra: Number(bit),
              baseScale,
              baseOffset,
              baseSize,
              sumScale: initial ? 255 : 1,
              sumOffset: initial ? baseOffset : [0, 0],
              sumSize: initial ? [input.width, input.height] : extent,
            },
            false,
            { left: 0, top: 0, right: extent[0]!, bottom: extent[1]! },
          );
          current = next;
          count = count * 2 + Number(bit);
        }
      }
      if (axis === 1 && painted) device.clear(dst);
      device.pass(
        DIVIDE,
        output,
        [current],
        {
          offset: [
            direction[0] * padding - (axis === 1 ? region.left : 0),
            direction[1] * padding - (axis === 1 ? region.top : 0),
          ],
          halfDivisor: Math.floor((kernel.divisor + 1) / 2),
          factorParts: [factor & 65535, factor >>> 16],
        },
        false,
        axis === 1 && painted
          ? {
              left: region.left,
              top: region.top,
              right: region.left + outWidth,
              bottom: region.top + outHeight,
            }
          : undefined,
      );
    }
    return true;
  } finally {
    buffers.forEach((buffer) => device.release(buffer));
    device.release(scratch);
  }
}
