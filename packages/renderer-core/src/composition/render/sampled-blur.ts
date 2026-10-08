import {
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
import type { WebglSurface } from "./webgl-device.ts";
import type { CanvasSurface } from "./canvas2d.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
/** Integer affine rows: source = (2*x*a + 2*y*c + translation)/512. */
type SampleTransform = [number, number, number, number, number, number];
type GpuSampledBlurWork = {
  managed: boolean;
  taps: SampleTransform[];
  shape?: { length?: number } | undefined;
  transformProducer?:
    | ((value: unknown, i: number) => SampleTransform)
    | undefined;
  transforms?: SampleTransform[] | undefined;
  declarationChunks: string[];
  declarationParts?: string[] | undefined;
  declarationProducer?:
    | ((tap: SampleTransform, i: number) => string)
    | undefined;
  declarations?: string | undefined;
  stepChunks: string[];
  stepParts?: string[] | undefined;
  stepProducer?: ((tap: SampleTransform, i: number) => string) | undefined;
  steps?: string | undefined;
  rows: number[][];
  uniformKeys: string[];
  entries: [string, number[]][];
  entryGroups: [string, number[]][][];
  flatEntries?: [string, number[]][] | undefined;
  entryProducer?:
    | ((tap: SampleTransform, i: number) => [string, number[]][])
    | undefined;
  uniforms?: Record<string, number[]> | undefined;
  shader?: string | undefined;
  input?: WebglSurface | undefined;
  output?: WebglSurface | undefined;
  inputs?: WebglSurface[] | undefined;
};
function clearGpuSampledBlurWork(work: GpuSampledBlurWork) {
  for (const tap of work.taps) (tap as number[]).length = 0;
  work.taps.length = 0;
  if (work.transforms) work.transforms.length = 0;
  if (work.shape) delete work.shape.length;
  work.declarationChunks.length = 0;
  if (work.declarationParts) work.declarationParts.length = 0;
  work.stepChunks.length = 0;
  if (work.stepParts) work.stepParts.length = 0;
  for (const row of work.rows) row.length = 0;
  work.rows.length = 0;
  work.uniformKeys.length = 0;
  for (const entry of work.entries) (entry as unknown[]).length = 0;
  work.entries.length = 0;
  for (const group of work.entryGroups) group.length = 0;
  work.entryGroups.length = 0;
  if (work.flatEntries) work.flatEntries.length = 0;
  if (work.uniforms) for (const key in work.uniforms) delete work.uniforms[key];
  if (work.inputs) work.inputs.length = 0;
  for (const key in work)
    delete (work as Partial<GpuSampledBlurWork>)[
      key as keyof GpuSampledBlurWork
    ];
}
function gpuSampledBlurWork(): GpuSampledBlurWork {
  const managed = renderMemory() !== undefined;
  // Validated radial/zoom/lens controls cap samples at 64 and shader text at 10,558 characters.
  return allocateRenderMetadata<GpuSampledBlurWork>(
    262144,
    () => ({
      managed,
      taps: [],
      declarationChunks: [],
      stepChunks: [],
      rows: [],
      uniformKeys: [],
      entries: [],
      entryGroups: [],
    }),
    false,
    clearGpuSampledBlurWork,
  );
}
function finishGpuSampledBlur(work: GpuSampledBlurWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearGpuSampledBlurWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
type SampleTransformWork = Pick<
  GpuSampledBlurWork,
  "taps" | "shape" | "transformProducer" | "transforms"
>;
type CanvasSampledBlurWork = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  transformWork: SampleTransformWork;
  sampling: PremultipliedSampleControl;
  input?: CanvasSurface | undefined;
  image?: ImageData | undefined;
  premultiplied?: Uint8Array<ArrayBuffer> | undefined;
  sample?: number[] | undefined;
  sums?: number[] | undefined;
  bytes?: number[] | undefined;
  normalizeProducer?: ((value: number) => number) | undefined;
  output?: CanvasSurface | undefined;
};
function clearSampledPixel(work: CanvasSampledBlurWork) {
  if (work.sums) work.sums.length = 0;
  if (work.bytes) work.bytes.length = 0;
  work.sums = work.bytes = undefined;
  work.normalizeProducer = undefined;
}
function clearCanvasSampledBlurWork(work: CanvasSampledBlurWork) {
  let failed = false,
    first: unknown;
  try {
    if (work.image) work.memory?.release(work.image.data.buffer);
  } catch (error) {
    failed = true;
    first = error;
  }
  try {
    if (work.premultiplied) work.memory?.release(work.premultiplied.buffer);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  clearSampledPixel(work);
  if (work.sample) work.sample.length = 0;
  const transforms = work.transformWork;
  for (const tap of transforms.taps) (tap as number[]).length = 0;
  transforms.taps.length = 0;
  if (transforms.transforms) transforms.transforms.length = 0;
  if (transforms.shape) delete transforms.shape.length;
  transforms.shape =
    transforms.transformProducer =
    transforms.transforms =
      undefined;
  work.sampling.index = undefined;
  for (const key in work)
    delete (work as Partial<CanvasSampledBlurWork>)[
      key as keyof CanvasSampledBlurWork
    ];
  if (failed) throw first;
}
function canvasSampledBlurWork(): CanvasSampledBlurWork {
  const memory = renderMemory();
  return allocateRenderMetadata<CanvasSampledBlurWork>(
    65536,
    () => ({
      managed: memory !== undefined,
      memory,
      transformWork: { taps: [] },
      sampling: {},
    }),
    false,
    clearCanvasSampledBlurWork,
  );
}
function finishCanvasSampledBlur(work: CanvasSampledBlurWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearCanvasSampledBlurWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
const IDENTITY: SampleTransform = [256, 0, 0, 0, 256, 0];
const scalar = (p: Params, key: string) => p[key] as number;
export function blurSampleTransforms(
  id: string,
  p: Params,
  w: number,
  h: number,
  work?: SampleTransformWork,
): SampleTransform[] {
  const amount = scalar(
    p,
    id === "blur.lens" ? "radius" : id === "blur.radial" ? "angle" : "amount",
  );
  if (amount === 0) {
    const result: SampleTransform[] = [[...IDENTITY]];
    if (work) {
      work.taps.push(result[0]!);
      work.transforms = result;
    }
    return result;
  }
  const count = scalar(p, "samples");
  const shape = { length: count };
  if (work) work.shape = shape;
  if (id === "blur.lens") {
    const producer = (_: unknown, i: number): SampleTransform => {
      const radius = amount * Math.sqrt((i + 0.5) / count),
        angle = i * Math.PI * (3 - Math.sqrt(5));
      const value: SampleTransform = [
        256,
        0,
        Math.round(Math.cos(angle) * radius * 16) * 32,
        0,
        256,
        Math.round(Math.sin(angle) * radius * 16) * 32,
      ];
      if (work) work.taps.push(value);
      return value;
    };
    if (work) work.transformProducer = producer;
    const result = Array.from(shape, producer);
    if (work) work.transforms = result;
    return result;
  }
  const center = p.center as readonly number[];
  const cx = center[0]! * w,
    cy = center[1]! * h;
  const producer = (_: unknown, i: number): SampleTransform => {
    const position = i / (count - 1) - 0.5;
    const angle =
      id === "blur.radial" ? (amount * position * Math.PI) / 180 : 0;
    const scale = id === "blur.zoom" ? 1 + amount * position : 1;
    const a = Math.round(Math.cos(angle) * scale * 256),
      b = Math.round(Math.sin(angle) * scale * 256),
      c = -b,
      d = a;
    const value: SampleTransform = [
      a,
      c,
      Math.round((cx - (a * cx + c * cy) / 256) * 16) * 32,
      b,
      d,
      Math.round((cy - (b * cx + d * cy) / 256) * 16) * 32,
    ];
    if (work) work.taps.push(value);
    return value;
  };
  if (work) work.transformProducer = producer;
  const result = Array.from(shape, producer);
  if (work) work.transforms = result;
  return result;
}
/** Bilinear premultiplied byte interpolation with 1/16 weights and transparent padding. */
export type PremultipliedSampleControl = {
  index?: ((tx: number, ty: number) => number) | undefined;
};
export function samplePremultiplied(
  pixels: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  output?: number[],
  control?: PremultipliedSampleControl,
): number[] {
  if (output === undefined) {
    let partial: number[] | undefined;
    let sampling: PremultipliedSampleControl | undefined;
    let result: number[] | undefined;
    try {
      result = allocateRenderMetadata<number[]>(
        1024,
        () =>
          samplePremultiplied(
            pixels,
            w,
            h,
            x,
            y,
            (partial = [0, 0, 0, 0]),
            (sampling = control ?? {}),
          ),
        false,
        (value) => {
          value.length = 0;
        },
      );
      sampling = undefined;
      partial = undefined;
      resizeRenderMetadata(result, 288);
      return result;
    } catch (error) {
      try {
        if (result) releaseRenderMetadata(result);
      } catch {
        /* Preserve the original sampling/adoption/resize failure. */
      }
      if (partial) partial.length = 0;
      throw error;
    } finally {
      if (sampling && sampling !== control) sampling.index = undefined;
      sampling = undefined;
      partial = undefined;
    }
  }
  const left = Math.floor(x - 0.5),
    top = Math.floor(y - 0.5),
    wx = Math.floor((x - 0.5 - left) * 16),
    wy = Math.floor((y - 0.5 - top) * 16);
  const index = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < w && ty < h ? (ty * w + tx) * 4 : -1;
  if (control) control.index = index;
  try {
    const first = index(left, top),
      second = index(left + 1, top),
      third = index(left, top + 1),
      fourth = index(left + 1, top + 1);
    const firstWeight = (16 - wx) * (16 - wy),
      secondWeight = wx * (16 - wy),
      thirdWeight = (16 - wx) * wy,
      fourthWeight = wx * wy;
    for (let channel = 0; channel < 4; channel++)
      output[channel] = Math.floor(
        ((first < 0 ? 0 : pixels[first + channel]!) * firstWeight +
          (second < 0 ? 0 : pixels[second + channel]!) * secondWeight +
          (third < 0 ? 0 : pixels[third + channel]!) * thirdWeight +
          (fourth < 0 ? 0 : pixels[fourth + channel]!) * fourthWeight) /
          256 +
          0.5,
      );
    return output;
  } finally {
    if (control) control.index = undefined;
  }
}
export const PREMULTIPLIED_SAMPLE_SHADER = `
vec4 pixelAt(ivec2 point){ivec2 size=textureSize(source,0);if(any(lessThan(point,ivec2(0)))||any(greaterThanEqual(point,size)))return vec4(0.0);return floor(texelFetch(source,point,0)*255.0+0.5);}
vec4 sampleBytes(vec2 point){vec2 base=floor(point-0.5),weight=floor((point-0.5-base)*16.0);ivec2 origin=ivec2(base);vec4 sum=pixelAt(origin)*(16.0-weight.x)*(16.0-weight.y)+pixelAt(origin+ivec2(1,0))*weight.x*(16.0-weight.y)+pixelAt(origin+ivec2(0,1))*(16.0-weight.x)*weight.y+pixelAt(origin+ivec2(1,1))*weight.x*weight.y;return floor(sum/256.0+0.5);}`;
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function sampledBlurKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["blur.radial", "blur.zoom", "blur.lens"].includes(id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const work = gpuSampledBlurWork();
      let failed = false;
      try {
        work.input = input;
        const transforms = blurSampleTransforms(
          id,
          params,
          input.width,
          input.height,
          work,
        );
        const declarationProducer = (work.declarationProducer = (
          _: SampleTransform,
          i: number,
        ) => {
          const value = `uniform vec3 rowX${i};uniform vec3 rowY${i};`;
          work.declarationChunks.push(value);
          return value;
        });
        const declarations = (work.declarations = (work.declarationParts =
          transforms.map(declarationProducer)).join("\n"));
        const stepProducer = (work.stepProducer = (
          _: SampleTransform,
          i: number,
        ) => {
          const value = `sum+=sampleBytes(vec2(dot(vec3(gl_FragCoord.xy*2.0,1.0),rowX${i}),dot(vec3(gl_FragCoord.xy*2.0,1.0),rowY${i}))/512.0);`;
          work.stepChunks.push(value);
          return value;
        });
        const steps = (work.steps = (work.stepParts =
          transforms.map(stepProducer)).join("\n"));
        const entryProducer = (work.entryProducer = (
          tap: SampleTransform,
          i: number,
        ): [string, number[]][] => {
          const group: [string, number[]][] = [];
          work.entryGroups.push(group);
          const keyX = `rowX${i}`;
          work.uniformKeys.push(keyX);
          const rowX = tap.slice(0, 3);
          work.rows.push(rowX);
          const entryX: [string, number[]] = [keyX, rowX];
          work.entries.push(entryX);
          group.push(entryX);
          const keyY = `rowY${i}`;
          work.uniformKeys.push(keyY);
          const rowY = tap.slice(3, 6);
          work.rows.push(rowY);
          const entryY: [string, number[]] = [keyY, rowY];
          work.entries.push(entryY);
          group.push(entryY);
          return group;
        });
        const uniforms = (work.uniforms = Object.fromEntries(
          (work.flatEntries = transforms.flatMap(entryProducer)),
        ));
        const output = (work.output = context.createSurface(
          input.width,
          input.height,
        ));
        context.pass(
          (work.shader = `${declarations}\n${PREMULTIPLIED_SAMPLE_SHADER}\nvoid main(){vec4 sum=vec4(0.0);${steps}pixel=floor(sum/${transforms.length}.0+0.5)/255.0;}`),
          output,
          (work.inputs = [input]),
          uniforms,
        );
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishGpuSampledBlur(work, failed);
      }
    },
    renderCanvas(context, input, params) {
      const work = canvasSampledBlurWork();
      let failed = false;
      try {
        work.input = input;
        const transforms = blurSampleTransforms(
          id,
          params,
          input.width,
          input.height,
          work.transformWork,
        );
        const image = (work.image = readRenderImageData(
            input.ctx,
            0,
            0,
            input.width,
            input.height,
          )),
          premultiplied = allocateRenderPixels(
            image.data.length * 1,
            () => (work.premultiplied = new Uint8Array(image.data.length)),
          );
        for (let index = 0; index < image.data.length; index += 4) {
          const alpha = image.data[index + 3]!;
          for (let c = 0; c < 3; c++)
            premultiplied[index + c] = Math.round(
              (image.data[index + c]! * alpha) / 255,
            );
          premultiplied[index + 3] = alpha;
        }
        const sample = (work.sample = [0, 0, 0, 0]);
        for (let y = 0; y < input.height; y++)
          for (let x = 0; x < input.width; x++) {
            const sums = (work.sums = [0, 0, 0, 0]);
            for (const tap of transforms) {
              samplePremultiplied(
                premultiplied,
                input.width,
                input.height,
                ((2 * x + 1) * tap[0] + (2 * y + 1) * tap[1] + tap[2]) / 512,
                ((2 * x + 1) * tap[3] + (2 * y + 1) * tap[4] + tap[5]) / 512,
                sample,
                work.sampling,
              );
              for (let c = 0; c < 4; c++) sums[c]! += sample[c]!;
            }
            const bytes = (work.bytes = sums.map(
                (work.normalizeProducer = (v) =>
                  Math.floor(v / transforms.length + 0.5)),
              )),
              index = (y * input.width + x) * 4;
            for (let c = 0; c < 3; c++)
              image.data[index + c] = bytes[3]
                ? Math.round((bytes[c]! * 255) / bytes[3])
                : 0;
            image.data[index + 3] = bytes[3]!;
            clearSampledPixel(work);
          }
        const output = (work.output = context.createSurface(
          input.width,
          input.height,
        ));
        output.ctx.putImageData(image, 0, 0);
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishCanvasSampledBlur(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
