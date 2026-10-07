import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { rasterBlurSigma } from "./webgl-blur-kernel.ts";

export function blurRescaleSteps(sigma: number) {
  if (!Number.isFinite(sigma) || sigma < 0)
    throw new Error("comp-effect-params: invalid Gaussian sigma");
  const scale = Math.fround(135 / rasterBlurSigma(sigma));
  if (scale >= 0.999) return [];
  let count = Math.ceil(Math.log2(Math.ceil(1 / scale)));
  const final = Math.fround(scale * 2 ** (count - 1));
  if (final >= (count === 1 ? 0.999 : 0.9)) count--;
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? Math.fround(scale * 2 ** index) : 0.5,
  );
}

const RESAMPLE = `
uniform vec2 ratio; uniform vec2 offset;
vec4 samplePixel(ivec2 p) {
  if(any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,textureSize(source,0)))) return vec4(0.0);
  return floor(texelFetch(source,p,0)*255.0+0.5);
}
void main() {
  vec2 p=gl_FragCoord.xy*ratio+offset-0.5,base=floor(p),f=floor(fract(p)*16.0)/16.0;
  vec4 first=mix(samplePixel(ivec2(base)),samplePixel(ivec2(base)+ivec2(1,0)),f.x);
  vec4 last=mix(samplePixel(ivec2(base)+ivec2(0,1)),samplePixel(ivec2(base)+ivec2(1)),f.x);
  pixel=floor(mix(first,last,f.y)+0.5)/255.0;
}`;

/** Progressive centered rescaling retains the bounded raster Gaussian domain. */
export function rescaledGaussianBlur(
  device: WebglDevice,
  dst: WebglSurface,
  sigma: number,
  blur: (surface: WebglSurface, sigma: number) => void,
) {
  const steps = blurRescaleSteps(sigma);
  if (!steps.length) return false;
  const owned: WebglSurface[] = [];
  let current = dst;
  let logical = [0, 0, dst.width, dst.height];
  let origin = [0, 0],
    netScale = 1;
  try {
    for (const scale of steps) {
      const center = [
        (logical[0]! + logical[2]!) / 2,
        (logical[1]! + logical[3]!) / 2,
      ];
      const nextBounds = logical.map((value, index) =>
        Math.fround(
          center[index % 2]! +
            Math.fround((value - center[index % 2]!) * scale),
        ),
      );
      const nextOrigin = [
        Math.floor(nextBounds[0]!),
        Math.floor(nextBounds[1]!),
      ];
      const next = device.surface(
        Math.ceil(nextBounds[2]!) - nextOrigin[0]!,
        Math.ceil(nextBounds[3]!) - nextOrigin[1]!,
      );
      owned.push(next);
      device.pass(RESAMPLE, next, [current], {
        ratio: [1 / scale, 1 / scale],
        offset: center.map(
          (value, axis) =>
            value + (nextOrigin[axis]! - value) / scale - origin[axis]!,
        ),
      });
      current = next;
      logical = nextBounds;
      origin = nextOrigin;
      netScale = Math.fround(netScale * scale);
    }
    const padded = device.surface(current.width + 2, current.height + 2);
    owned.push(padded);
    device.pass(
      "void main(){ivec2 p=ivec2(gl_FragCoord.xy)-1;pixel=any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,textureSize(source,0)))?vec4(0.0):texelFetch(source,p,0);}",
      padded,
      [current],
    );
    blur(padded, Math.min(135, Math.fround(rasterBlurSigma(sigma) * netScale)));
    const output = device.surface(dst.width, dst.height);
    owned.push(output);
    device.pass(RESAMPLE, output, [padded], {
      ratio: [netScale, netScale],
      offset: [
        ((1 - netScale) * dst.width) / 2 - origin[0]! + 1,
        ((1 - netScale) * dst.height) / 2 - origin[1]! + 1,
      ],
    });
    device.swap(dst, output);
    return true;
  } finally {
    for (const surface of owned) device.release(surface);
  }
}
