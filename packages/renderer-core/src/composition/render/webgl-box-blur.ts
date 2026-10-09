import {
  allocateRenderPixels,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import type { ManagedMemory } from "../../managed-memory.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import type { WebglRect } from "./webgl-bounds.ts";

type BoxKernel = { radius: number; divisor: number; lengths: number[] };
type BoxLifetime = {
  bytes: number;
  managed: boolean;
  buffers: WebglSurface[];
  scratch?: WebglSurface | undefined;
  arrays: number[][];
  inputs: WebglSurface[][];
  uniforms: Record<string, number | number[]>[];
  boxes: WebglRect[];
};
function clearBoxLifetime(value: BoxLifetime) {
  value.buffers.length = 0;
  value.scratch = undefined;
  for (const array of value.arrays) array.length = 0;
  for (const inputs of value.inputs) inputs.length = 0;
  for (const uniforms of value.uniforms)
    for (const name in uniforms) delete uniforms[name];
  value.arrays.length =
    value.inputs.length =
    value.uniforms.length =
    value.boxes.length =
      0;
}
function growBoxLifetime(phase: BoxLifetime, bytes: number) {
  resizeRenderMetadata(phase, phase.bytes + bytes);
  phase.bytes += bytes;
}
function boxArray(phase: BoxLifetime, length: number, factory: () => number[]) {
  growBoxLifetime(phase, 128 + 8 * length);
  const value = factory();
  phase.arrays.push(value);
  return value;
}
function boxInputs(
  phase: BoxLifetime,
  length: number,
  factory: () => WebglSurface[],
) {
  growBoxLifetime(phase, 128 + 8 * length);
  const value = factory();
  phase.inputs.push(value);
  return value;
}
function boxUniforms(
  phase: BoxLifetime,
  factory: () => Record<string, number | number[]>,
) {
  growBoxLifetime(phase, 512);
  const value = factory();
  phase.uniforms.push(value);
  return value;
}
function boxRegion(phase: BoxLifetime, factory: () => WebglRect) {
  growBoxLifetime(phase, 128);
  const value = factory();
  phase.boxes.push(value);
  return value;
}
function releaseBoxSurfaces(device: WebglDevice, phase: BoxLifetime) {
  let failed = false;
  let first: unknown;
  const release = (surface: WebglSurface) => {
    try {
      device.release(surface);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  };
  for (const buffer of phase.buffers) release(buffer);
  if (phase.scratch) release(phase.scratch);
  phase.buffers.length = 0;
  phase.scratch = undefined;
  if (failed) throw first;
}
// Pass costs measured on the pinned software renderer: a fixed cost per pass
// plus one per texel fetch. Fewer, wider passes write fewer RGBA32F pixels.
const PASS_COST = 0.38,
  FETCH_COST = 0.107;
const MAXIMUM_MULTIPLE = 8,
  MAXIMUM_EXTRA = 3;

type Step = { multiple: number; extra: number };
type ShaderLifetime = {
  key: string;
  body: string;
  terms: string[];
  parts: string[][];
  fetches: string[];
  slot: boolean;
};
type BoxCache = {
  memory: ManagedMemory;
  device?: WebglDevice | undefined;
  bytes: number;
  disposed: boolean;
  plans: Map<number, Step[]>;
  shaders: Map<string, ShaderLifetime>;
};
const managedCaches = new WeakMap<ManagedMemory, BoxCache>();
const deviceCaches = new WeakMap<WebglDevice, BoxCache>();
function changeCacheSlots(cache: BoxCache, bytes: number) {
  if (cache.disposed) return;
  resizeRenderMetadata(cache, cache.bytes + bytes);
  cache.bytes += bytes;
}
function clearBoxCache(cache: BoxCache) {
  cache.disposed = true;
  if (cache.device) {
    if (deviceCaches.get(cache.device) === cache)
      deviceCaches.delete(cache.device);
    cache.device = undefined;
  } else if (managedCaches.get(cache.memory) === cache)
    managedCaches.delete(cache.memory);
  for (const steps of cache.plans.values()) releaseRenderMetadata(steps);
  for (const shader of cache.shaders.values()) releaseRenderMetadata(shader);
  cache.plans.clear();
  cache.shaders.clear();
}
export function releaseDeviceBoxCache(device: WebglDevice) {
  const cache = deviceCaches.get(device);
  if (cache) releaseRenderMetadata(cache);
}
function boxCache(device?: WebglDevice) {
  const memory = renderMemory();
  if (!memory) return undefined;
  const previous = device
    ? deviceCaches.get(device)
    : managedCaches.get(memory);
  if (previous) {
    if (previous.memory !== memory)
      throw Error("Managed box cache belongs to another allocator");
    return previous;
  }
  const cache = allocateRenderMetadata<BoxCache>(
    // Actual holder/two Maps/registry entry and cache producer controls.
    768,
    () => ({
      memory,
      device,
      bytes: 768,
      disposed: false,
      plans: new Map(),
      shaders: new Map(),
    }),
    true,
    clearBoxCache,
  );
  try {
    if (device) deviceCaches.set(device, cache);
    else managedCaches.set(memory, cache);
    return cache;
  } catch (error) {
    try {
      releaseRenderMetadata(cache);
    } catch {
      /* Preserve registry failure. */
    }
    throw error;
  }
}
function releaseEmptyBoxCache(cache: BoxCache | undefined) {
  if (cache && !cache.plans.size && !cache.shaders.size)
    releaseRenderMetadata(cache);
}
function clearShaderWorking(value: ShaderLifetime) {
  value.terms.length = 0;
  for (const parts of value.parts) parts.length = 0;
  value.parts.length = value.fetches.length = 0;
}
function shaderParts(phase: ShaderLifetime | undefined, value: string[]) {
  phase?.parts.push(value);
  return value;
}
const shaders = new Map<string, string>();
/**
 * S(rc+e)(p) = Σj<r S(c)(p−jc) + Σi<e x(p−rc−i): exact integer box sums.
 * Specialize each program: software GPUs evaluate both sides of per-fetch
 * selects and inactive uniform branches.
 */
function sumShader(
  device: WebglDevice,
  multiple: number,
  extra: number,
  sumBytes: boolean,
  baseBytes: boolean,
) {
  const cache = boxCache(device);
  let phase: ShaderLifetime | undefined;
  let retained = false;
  try {
    if (cache)
      phase = allocateRenderMetadata<ShaderLifetime>(
        // Renderer-generated specializations have <=11 terms; includes original
        // intermediate UTF16 text, arrays/closures, full body and key production.
        16384,
        () => ({
          key: "",
          body: "",
          terms: [],
          parts: [],
          fetches: [],
          slot: false,
        }),
        false,
        (value) => {
          if (cache.shaders.get(value.key) === value)
            cache.shaders.delete(value.key);
          if (value.slot) {
            value.slot = false;
            changeCacheSlots(cache, -40);
          }
          clearShaderWorking(value);
          value.key = value.body = "";
        },
      );
    const key = `${multiple}/${extra}/${sumBytes}/${baseBytes}`;
    if (phase) phase.key = key;
    const cached = cache ? cache.shaders.get(key)?.body : shaders.get(key);
    if (cached) return cached;
    const fetch = (sampler: string, bytes: boolean) => {
      const value = bytes
        ? `floor(texelFetch(${sampler},p,0)*255.0+0.5)`
        : `texelFetch(${sampler},p,0)`;
      phase?.fetches.push(value);
      return value;
    };
    const terms = [
      "sumAt(p+ivec2(sumOffset))",
      ...shaderParts(
        phase,
        Array.from(
          { length: multiple - 1 },
          (_, j) => `sumAt(p+ivec2(sumOffset-direction*(count*${j + 1}.0)))`,
        ),
      ),
      ...shaderParts(
        phase,
        Array.from(
          { length: extra },
          (_, i) =>
            `baseAt(p+ivec2(baseOffset-direction*(count*${multiple}.0+${i}.0)))`,
        ),
      ),
    ];
    if (phase) phase.terms = terms;
    const shader = `uniform vec2 direction; uniform float count;
uniform vec2 sumOffset; uniform vec2 baseOffset;
uniform vec2 sumSize; uniform vec2 baseSize;
vec4 sumAt(ivec2 p) {
  return any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,ivec2(sumSize)))
    ? vec4(0.0) : ${fetch("source", sumBytes)};
}
vec4 baseAt(ivec2 p) {
  return any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,ivec2(baseSize)))
    ? vec4(0.0) : ${fetch("backdrop", baseBytes)};
}
void main() {
  ivec2 p=ivec2(gl_FragCoord.xy);
  pixel=${terms.join("+")};
}`;
    if (cache && phase) {
      phase.body = shader;
      clearShaderWorking(phase);
      resizeRenderMetadata(phase, 512 + 2 * (key.length + shader.length));
      changeCacheSlots(cache, 40);
      phase.slot = true;
      cache.shaders.set(key, phase);
      cache.memory.retain(phase);
      retained = true;
    } else shaders.set(key, shader);
    return shader;
  } finally {
    try {
      if (phase && !retained) releaseRenderMetadata(phase);
    } finally {
      releaseEmptyBoxCache(cache);
    }
  }
}

type PlanLifetime = {
  from?: { previous: number; step: Step }[] | undefined;
  cost?: Float64Array | undefined;
};
function clearPlanWorking(value: PlanLifetime) {
  if (value.from) value.from.length = 0;
  value.from = value.cost = undefined;
}
const plans = new Map<number, Step[]>();
/** Cheapest exact sequence of steps from a one-pixel box to `length`. */
export function boxSteps(length: number, device?: WebglDevice): Step[] {
  const cache = boxCache(device);
  const target = cache?.plans ?? plans;
  const cached = target.get(length);
  if (cached) return cached;
  let phase: PlanLifetime | undefined;
  let cost: Float64Array | undefined;
  let steps: Step[] | undefined;
  let retained = false,
    slot = false;
  try {
    const slots = Number.isFinite(length)
      ? Math.max(0, Math.trunc(length + 1))
      : 0;
    phase = allocateRenderMetadata<PlanLifetime>(
      // Actual predecessor slots/nodes/step objects, temporary overlap,
      // cost view, holder and original plan producer controls.
      512 + 256 * slots,
      () => ({}),
      false,
      clearPlanWorking,
    );
    cost = allocateRenderPixels(
      (length + 1) * 8,
      () => new Float64Array(length + 1),
    );
    phase.cost = cost;
    cost.fill(Infinity);
    const from: { previous: number; step: Step }[] = (phase.from = []);
    cost[1] = 0;
    for (let count = 1; count < length; count++) {
      if (cost[count] === Infinity) continue;
      for (let multiple = 2; multiple <= MAXIMUM_MULTIPLE; multiple++)
        for (
          let extra = 0;
          extra <= Math.min(multiple - 1, MAXIMUM_EXTRA);
          extra++
        ) {
          const next = count * multiple + extra;
          if (next > length) continue;
          const total =
            cost[count]! + PASS_COST + FETCH_COST * (multiple + extra);
          if (total < cost[next]! - 1e-9) {
            cost[next] = total;
            from[next] = { previous: count, step: { multiple, extra } };
          }
        }
    }
    const countBound =
      Number.isFinite(length) && length > 1 ? Math.ceil(Math.log2(length)) : 0;
    steps = allocateRenderMetadata<Step[]>(
      512 + 56 * countBound,
      () => [],
      false,
      (value) => {
        if (cache) {
          if (target.get(length) === value) target.delete(length);
          if (slot) {
            slot = false;
            changeCacheSlots(cache, -40);
          }
        }
        value.length = 0;
      },
    );
    for (let count = length; count > 1; count = from[count]!.previous)
      steps.unshift(from[count]!.step);
    if (cache) {
      resizeRenderMetadata(steps, 512 + 56 * steps.length);
      changeCacheSlots(cache, 40);
      slot = true;
    }
    target.set(length, steps);
    if (cache) cache.memory.retain(steps);
    retained = true;
    return steps;
  } catch (error) {
    try {
      if (steps && !retained) releaseRenderMetadata(steps);
    } catch {
      /* Preserve original plan/factory/insert failure. */
    }
    throw error;
  } finally {
    try {
      releaseRenderPixels(cost);
    } finally {
      try {
        if (phase) {
          if (cache) releaseRenderMetadata(phase);
          else clearPlanWorking(phase);
        }
      } finally {
        releaseEmptyBoxCache(cache);
      }
    }
  }
}
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
  const phase = allocateRenderMetadata<BoxLifetime>(
    // Actual holder/lists, native surface pointers and iteration controls.
    1024,
    () => ({
      bytes: 1024,
      managed: renderMemory() !== undefined,
      buffers: [],
      arrays: [],
      inputs: [],
      uniforms: [],
      boxes: [],
    }),
    false,
    clearBoxLifetime,
  );
  let cleaned = false;
  try {
    const padding = kernel.radius * 2;
    const region = boxRegion(phase, () =>
      painted
        ? {
            left: Math.max(0, painted.left - kernel.radius),
            top: Math.max(0, painted.top - kernel.radius),
            right: Math.min(dst.width, painted.right + kernel.radius),
            bottom: Math.min(dst.height, painted.bottom + kernel.radius),
          }
        : { left: 0, top: 0, right: dst.width, bottom: dst.height },
    );
    const outWidth = region.right - region.left,
      outHeight = region.bottom - region.top;
    // Nearby radii share pooled storage; shaders respect each axis's logical extent.
    const width = Math.ceil((outWidth + padding) / 128) * 128,
      height = Math.ceil((outHeight + padding) / 128) * 128;
    const maximum = device.gl.getParameter(
      device.gl.MAX_TEXTURE_SIZE,
    ) as number;
    if (
      width > maximum ||
      height > maximum ||
      width * height * 16 * 3 + outWidth * outHeight * 4 > 128 * 1024 * 1024
    )
      return false;
    const buffers = phase.buffers;
    const scratch = (phase.scratch = device.surface(outWidth, outHeight));
    for (let i = 0; i < 3; i++)
      buffers.push(device.surface(width, height, true));
    const factor = Math.round(4294967296 / kernel.divisor);
    for (const axis of boxArray(phase, 2, () => [0, 1])) {
      const input = axis === 0 ? dst : scratch,
        output = axis === 0 ? scratch : dst;
      const direction = boxArray(phase, 2, () =>
        axis === 0 ? [1, 0] : [0, 1],
      );
      const extent = boxArray(phase, 2, () => [
        outWidth + padding * direction[0]!,
        outHeight + padding * direction[1]!,
      ]);
      let current = input;
      for (const length of kernel.lengths) {
        const base = current;
        const baseOffset = boxArray(phase, 2, () =>
          base === input
            ? [
                (axis === 0 ? region.left : 0) - direction[0]! * kernel.radius,
                (axis === 0 ? region.top : 0) - direction[1]! * kernel.radius,
              ]
            : [0, 0],
        );
        const baseSize =
          base === input
            ? boxArray(phase, 2, () => [input.width, input.height])
            : extent;
        let count = 1;
        for (const { multiple, extra } of boxSteps(length, device)) {
          const next = buffers.find(
            (buffer) => buffer !== base && buffer !== current,
          )!;
          const initial = current === input;
          device.pass(
            sumShader(device, multiple, extra, initial, base === input),
            next,
            boxInputs(phase, 2, () => [current, base]),
            boxUniforms(phase, () => ({
              direction,
              count,
              baseOffset,
              baseSize,
              sumOffset: initial
                ? baseOffset
                : boxArray(phase, 2, () => [0, 0]),
              sumSize: initial
                ? boxArray(phase, 2, () => [input.width, input.height])
                : extent,
            })),
            false,
            boxRegion(phase, () => ({
              left: 0,
              top: 0,
              right: extent[0]!,
              bottom: extent[1]!,
            })),
          );
          current = next;
          count = count * multiple + extra;
        }
      }
      if (axis === 1 && painted) device.clear(dst);
      device.pass(
        DIVIDE,
        output,
        boxInputs(phase, 1, () => [current]),
        boxUniforms(phase, () => ({
          offset: boxArray(phase, 2, () => [
            direction[0]! * padding - (axis === 1 ? region.left : 0),
            direction[1]! * padding - (axis === 1 ? region.top : 0),
          ]),
          halfDivisor: Math.floor((kernel.divisor + 1) / 2),
          factorParts: boxArray(phase, 2, () => [
            factor & 65535,
            factor >>> 16,
          ]),
        })),
        false,
        axis === 1 && painted
          ? boxRegion(phase, () => ({
              left: region.left,
              top: region.top,
              right: region.left + outWidth,
              bottom: region.top + outHeight,
            }))
          : undefined,
      );
    }
    return true;
  } catch (error) {
    cleaned = true;
    try {
      releaseBoxSurfaces(device, phase);
    } catch {
      /* Preserve the original geometry/pass/native failure. */
    }
    throw error;
  } finally {
    try {
      if (!cleaned) releaseBoxSurfaces(device, phase);
    } finally {
      if (phase.managed) releaseRenderMetadata(phase);
      else clearBoxLifetime(phase);
    }
  }
}
