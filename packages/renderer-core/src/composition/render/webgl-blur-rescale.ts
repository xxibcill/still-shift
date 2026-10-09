import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { rasterBlurSigma } from "./webgl-blur-kernel.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import { renderMemory } from "../../managed-memory-context.ts";

export function blurRescaleSteps(sigma: number) {
  if (!Number.isFinite(sigma) || sigma < 0)
    throw new Error("comp-effect-params: invalid Gaussian sigma");
  const scale = Math.fround(135 / rasterBlurSigma(sigma));
  if (scale >= 0.999)
    return allocateRenderMetadata<number[]>(
      512,
      () => [],
      false,
      (value) => {
        value.length = 0;
      },
    );
  let count = Math.ceil(Math.log2(Math.ceil(1 / scale)));
  const final = Math.fround(scale * 2 ** (count - 1));
  if (final >= (count === 1 ? 0.999 : 0.9)) count--;
  return allocateRenderMetadata<number[]>(
    512 + 8 * count,
    () =>
      Array.from({ length: count }, (_, index) =>
        index === count - 1 ? Math.fround(scale * 2 ** index) : 0.5,
      ),
    false,
    (value) => {
      value.length = 0;
    },
  );
}

type RescaleLifetime = {
  owned: WebglSurface[];
  arrays: number[][];
  inputs: WebglSurface[][];
  uniforms: Record<string, number[]>[];
  managed: boolean;
};
function clearRescaleLifetime(value: RescaleLifetime) {
  value.owned.length = 0;
  for (const array of value.arrays) array.length = 0;
  for (const inputs of value.inputs) inputs.length = 0;
  for (const uniforms of value.uniforms)
    for (const name in uniforms) delete uniforms[name];
  value.arrays.length = value.inputs.length = value.uniforms.length = 0;
}
function rescaleArray(phase: RescaleLifetime, value: number[]) {
  phase.arrays.push(value);
  return value;
}
function rescaleInputs(phase: RescaleLifetime, value: WebglSurface[]) {
  phase.inputs.push(value);
  return value;
}
function rescaleUniforms(
  phase: RescaleLifetime,
  value: Record<string, number[]>,
) {
  phase.uniforms.push(value);
  return value;
}
function releaseRescaleSurfaces(device: WebglDevice, phase: RescaleLifetime) {
  let failed = false;
  let first: unknown;
  for (const surface of phase.owned) {
    try {
      device.release(surface);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  }
  phase.owned.length = 0;
  if (failed) throw first;
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
  let phase: RescaleLifetime | undefined;
  let cleaned = false;
  try {
    if (!steps.length) return false;
    phase = allocateRenderMetadata<RescaleLifetime>(
      // Actual lists/holder/initial vectors 1024 and 2048 per original scale stage
      // for numeric vectors, uniforms/inputs, callbacks and owned surface pointers.
      1024 + 2048 * (steps.length + 2),
      () => ({
        owned: [],
        arrays: [],
        inputs: [],
        uniforms: [],
        managed: renderMemory() !== undefined,
      }),
      false,
      clearRescaleLifetime,
    );
    const owned = phase.owned;
    let current = dst;
    let logical = rescaleArray(phase, [0, 0, dst.width, dst.height]);
    let origin = rescaleArray(phase, [0, 0]),
      netScale = 1;
    for (const scale of steps) {
      const center = rescaleArray(phase, [
        (logical[0]! + logical[2]!) / 2,
        (logical[1]! + logical[3]!) / 2,
      ]);
      const nextBounds = rescaleArray(
        phase,
        logical.map((value, index) =>
          Math.fround(
            center[index % 2]! +
              Math.fround((value - center[index % 2]!) * scale),
          ),
        ),
      );
      const nextOrigin = rescaleArray(phase, [
        Math.floor(nextBounds[0]!),
        Math.floor(nextBounds[1]!),
      ]);
      const next = device.surface(
        Math.ceil(nextBounds[2]!) - nextOrigin[0]!,
        Math.ceil(nextBounds[3]!) - nextOrigin[1]!,
      );
      owned.push(next);
      device.pass(
        RESAMPLE,
        next,
        rescaleInputs(phase, [current]),
        rescaleUniforms(phase, {
          ratio: rescaleArray(phase, [1 / scale, 1 / scale]),
          offset: rescaleArray(
            phase,
            center.map(
              (value, axis) =>
                value + (nextOrigin[axis]! - value) / scale - origin[axis]!,
            ),
          ),
        }),
      );
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
      rescaleInputs(phase, [current]),
    );
    blur(padded, Math.min(135, Math.fround(rasterBlurSigma(sigma) * netScale)));
    const output = device.surface(dst.width, dst.height);
    owned.push(output);
    device.pass(
      RESAMPLE,
      output,
      rescaleInputs(phase, [padded]),
      rescaleUniforms(phase, {
        ratio: rescaleArray(phase, [netScale, netScale]),
        offset: rescaleArray(phase, [
          ((1 - netScale) * dst.width) / 2 - origin[0]! + 1,
          ((1 - netScale) * dst.height) / 2 - origin[1]! + 1,
        ]),
      }),
    );
    device.swap(dst, output);
    return true;
  } catch (error) {
    if (phase) {
      cleaned = true;
      try {
        releaseRescaleSurfaces(device, phase);
      } catch {
        /* Preserve original rescale/blur/native failure. */
      }
    }
    throw error;
  } finally {
    try {
      if (phase && !cleaned) releaseRescaleSurfaces(device, phase);
    } finally {
      try {
        if (phase) {
          if (phase.managed) releaseRenderMetadata(phase);
          else clearRescaleLifetime(phase);
        }
      } finally {
        releaseRenderMetadata(steps);
      }
    }
  }
}
