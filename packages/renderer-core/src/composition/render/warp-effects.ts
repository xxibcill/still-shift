import {
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
} from "../../managed-memory-context.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  PREMULTIPLIED_SAMPLE_SHADER,
  samplePremultiplied,
  type PremultipliedSampleControl,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
import type { WebglSurface } from "./webgl-device.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import {
  allocateRenderMetadata,
  allocateManagedRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
type Mapping = {
  uniforms: Record<string, readonly number[]>;
  shader: string;
  sourcePoint(x: number, y: number): number[] | undefined;
};
type WarpMappingWork = {
  arrays: number[][];
  point?: number[] | undefined;
  keys?: string[] | undefined;
  points?: (readonly number[])[] | undefined;
  pointProducer?: ((key: string) => readonly number[]) | undefined;
  inverseProducer?: ((value: number) => number) | undefined;
  split?: ((value: number) => number[]) | undefined;
  sourcePoint?: Mapping["sourcePoint"] | undefined;
  uniforms?: Mapping["uniforms"] | undefined;
  mapping?: Mapping | undefined;
};
type GpuWarpWork = WarpMappingWork & {
  managed: boolean;
  input?: WebglSurface | undefined;
  output?: WebglSurface | undefined;
  inputs?: WebglSurface[] | undefined;
  shader?: string | undefined;
};
function clearWarpMappingWork(work: WarpMappingWork) {
  for (const values of work.arrays) values.length = 0;
  work.arrays.length = 0;
  if (work.keys) work.keys.length = 0;
  if (work.points) work.points.length = 0;
  if (work.point) work.point.length = 0;
  if (work.uniforms) for (const key in work.uniforms) delete work.uniforms[key];
  if (work.mapping)
    for (const key in work.mapping)
      delete (work.mapping as Partial<Mapping>)[key as keyof Mapping];
}
function clearGpuWarpWork(work: GpuWarpWork) {
  clearWarpMappingWork(work);
  if (work.inputs) work.inputs.length = 0;
  for (const key in work)
    delete (work as Partial<GpuWarpWork>)[key as keyof GpuWarpWork];
}
function gpuWarpWork(): GpuWarpWork {
  const managed = renderMemory() !== undefined;
  return allocateRenderMetadata<GpuWarpWork>(
    16384,
    () => ({ managed, arrays: [] }),
    false,
    clearGpuWarpWork,
  );
}
function finishGpuWarpWork(work: GpuWarpWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearGpuWarpWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
type CanvasWarpWork = WarpMappingWork & {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  input?: CanvasSurface | undefined;
  output?: CanvasSurface | undefined;
  image?: ImageData | undefined;
  premultiplied?: Uint8Array<ArrayBuffer> | undefined;
  sample?: number[] | undefined;
  sampling: PremultipliedSampleControl;
};
function clearCanvasWarpWork(work: CanvasWarpWork) {
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
  clearWarpMappingWork(work);
  if (work.sample) work.sample.length = 0;
  work.sampling.index = undefined;
  for (const key in work)
    delete (work as Partial<CanvasWarpWork>)[key as keyof CanvasWarpWork];
  if (failed) throw first;
}
function canvasWarpWork(): CanvasWarpWork {
  const memory = renderMemory();
  return allocateRenderMetadata<CanvasWarpWork>(
    16384,
    () => ({ managed: memory !== undefined, memory, arrays: [], sampling: {} }),
    false,
    clearCanvasWarpWork,
  );
}
function finishCanvasWarpWork(work: CanvasWarpWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearCanvasWarpWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
function warpPoint(value: number[], work?: WarpMappingWork): number[] {
  if (work) work.point = value;
  return value;
}
function warpValues(values: number[], work?: WarpMappingWork): number[] {
  if (work) work.arrays.push(values);
  return values;
}
function warpUniforms(work?: WarpMappingWork): Mapping["uniforms"] {
  const uniforms: Mapping["uniforms"] = {};
  if (work) work.uniforms = uniforms;
  return uniforms;
}
function warpResult(mapping: Mapping, work?: WarpMappingWork): Mapping {
  if (work) {
    work.mapping = mapping;
    work.uniforms = mapping.uniforms;
    work.sourcePoint = mapping.sourcePoint;
  }
  return mapping;
}
const f = Math.fround;
const point = (p: Params, key: string) => p[key] as readonly number[];
function inverse3(m: number[], work?: WarpMappingWork): number[] {
  const [a, b, c, d, e, g, h, i, j] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const values = warpValues(
    [
      e * j - g * i,
      c * i - b * j,
      b * g - c * e,
      g * h - d * j,
      a * j - c * h,
      c * d - a * g,
      d * i - e * h,
      b * h - a * i,
      a * e - b * d,
    ],
    work,
  );
  const determinant = a * values[0]! + b * values[3]! + c * values[6]!;
  if (Math.abs(determinant) < 1e-12)
    throw Error("Corner pin homography is singular");
  const producer = (v: number) => f(v / determinant);
  if (work) work.inverseProducer = producer;
  return warpValues(values.map(producer), work);
}
function cornerInverse(p: Params, work?: WarpMappingWork): number[] {
  const keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
  if (work) work.keys = keys;
  const producer = (key: string) => point(p, key);
  if (work) work.pointProducer = producer;
  const points = keys.map(producer);
  if (work) work.points = points;
  const [a, b, c, d] = points as [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  const dx1 = b[0]! - c[0]!,
    dx2 = d[0]! - c[0]!,
    sx = a[0]! - b[0]! + c[0]! - d[0]!,
    dy1 = b[1]! - c[1]!,
    dy2 = d[1]! - c[1]!,
    sy = a[1]! - b[1]! + c[1]! - d[1]!;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / determinant,
    h = (dx1 * sy - sx * dy1) / determinant;
  return inverse3(
    warpValues(
      [
        b[0]! - a[0]! + g * b[0]!,
        d[0]! - a[0]! + h * d[0]!,
        a[0]!,
        b[1]! - a[1]! + g * b[1]!,
        d[1]! - a[1]! + h * d[1]!,
        a[1]!,
        g,
        h,
        1,
      ],
      work,
    ),
    work,
  );
}
const row = (values: readonly number[], x: number, y: number) =>
  f(f(f(x * values[0]!) + f(y * values[1]!)) + values[2]!);
export function warpMapping(
  id: string,
  p: Params,
  w: number,
  h: number,
  work?: WarpMappingWork,
): Mapping {
  if (work || !renderMemory()) return produceWarpMapping(id, p, w, h, work);
  const memory = renderMemory()!;
  let partial: GpuWarpWork | undefined;
  try {
    return allocateRenderMetadata<Mapping>(
      16384,
      () => {
        const control: GpuWarpWork = (partial = { managed: true, arrays: [] });
        const mapping = produceWarpMapping(id, p, w, h, control);
        const producer = mapping.sourcePoint;
        mapping.sourcePoint = control.sourcePoint = (x, y) => {
          let point: number[] | undefined;
          let result: number[] | { empty?: true } | undefined;
          try {
            result = allocateManagedRenderMetadata<number[] | { empty?: true }>(
              memory,
              272,
              () => (point = producer(x, y)) ?? { empty: true },
              false,
              (value) => {
                if (Array.isArray(value)) value.length = 0;
                else delete value.empty;
              },
            );
            control.point = undefined;
            point = undefined;
            if (Array.isArray(result)) return result;
            releaseRenderMetadata(result);
            return undefined;
          } catch (error) {
            try {
              if (result) releaseRenderMetadata(result);
            } catch {
              /* Preserve the original point or cleanup failure. */
            }
            if (point) point.length = 0;
            control.point = undefined;
            throw error;
          }
        };
        return mapping;
      },
      false,
      () => {
        if (partial) clearGpuWarpWork(partial);
        partial = undefined;
      },
    );
  } catch (error) {
    try {
      if (partial) clearGpuWarpWork(partial);
    } catch {
      /* Preserve the original mapping or admission failure. */
    }
    partial = undefined;
    throw error;
  }
}
function produceWarpMapping(
  id: string,
  p: Params,
  w: number,
  h: number,
  work?: WarpMappingWork,
): Mapping {
  compositionEffectDefinition(id)!.validateParams?.(p);
  if (id === "distort.transform") {
    const anchor = point(p, "anchor"),
      offset = point(p, "offset"),
      scale = point(p, "scale"),
      angle = (((p.rotation as number) % 360) * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle),
      cx = anchor[0]! * w,
      cy = anchor[1]! * h;
    const a = Math.round((cos / scale[0]!) * 65536),
      c = Math.round((sin / scale[0]!) * 65536),
      b = Math.round((-sin / scale[1]!) * 65536),
      d = Math.round((cos / scale[1]!) * 65536);
    const tx = Math.round(
        (cx - ((cx + offset[0]!) * a + (cy + offset[1]!) * c) / 65536) * 131072,
      ),
      ty = Math.round(
        (cy - ((cx + offset[0]!) * b + (cy + offset[1]!) * d) / 65536) * 131072,
      );
    const split = (value: number) =>
      warpValues(
        [
          value - Math.floor(value / 1024) * 1024,
          Math.floor(value / 1024) - Math.floor(value / 1048576) * 1024,
          Math.floor(value / 1048576) - Math.floor(value / 1073741824) * 1024,
          Math.floor(value / 1073741824),
        ],
        work,
      );
    if (work) work.split = split;
    const uniforms = warpUniforms(work);
    uniforms.rowX = warpValues([a, c], work);
    uniforms.rowY = warpValues([b, d], work);
    uniforms.translationX = split(tx);
    uniforms.translationY = split(ty);
    return warpResult(
      {
        uniforms,
        shader: `uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;
// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.
float affineRow(vec2 point,vec2 coefficients,vec4 translation){
 vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;
 vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;
 float low=dot(pointLow,coefficientLow)+translation.x;
 float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);
 float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);
 float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);
 // Floor to 1/16 pixel directly, avoiding a large floating numerator.
 return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);
}
vec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}`,
        sourcePoint: (x, y) =>
          warpPoint(
            [
              (2 * x * a + 2 * y * c + tx) / 131072,
              (2 * x * b + 2 * y * d + ty) / 131072,
            ],
            work,
          ),
      },
      work,
    );
  }
  const matrix = cornerInverse(p, work),
    rowX = warpValues(matrix.slice(0, 3), work),
    rowY = warpValues(matrix.slice(3, 6), work),
    rowW = warpValues(matrix.slice(6, 9), work);
  const uniforms = warpUniforms(work);
  uniforms.rowX = rowX;
  uniforms.rowY = rowY;
  uniforms.rowW = rowW;
  uniforms.dimensions = warpValues([w, h], work);
  return warpResult(
    {
      uniforms,
      shader:
        "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
      sourcePoint: (x, y) => {
        const px = f(x / w),
          py = f(y / h),
          weight = row(rowW, px, py);
        return Math.abs(weight) < 1e-6
          ? undefined
          : warpPoint(
              [
                f(f(row(rowX, px, py) / weight) * w),
                f(f(row(rowY, px, py) / weight) * h),
              ],
              work,
            );
      },
    },
    work,
  );
}
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function warpEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["distort.transform", "distort.corner-pin"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const work = gpuWarpWork();
      let failed = false;
      try {
        work.input = input;
        const mapping = warpMapping(
            id,
            params,
            input.width,
            input.height,
            work,
          ),
          output = (work.output = context.createSurface(
            input.width,
            input.height,
          ));
        context.pass(
          (work.shader = `${mapping.shader}\n${PREMULTIPLIED_SAMPLE_SHADER}\nvoid main(){pixel=sampleBytes(sourcePoint(gl_FragCoord.xy))/255.0;}`),
          output,
          (work.inputs = [input]),
          mapping.uniforms,
        );
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishGpuWarpWork(work, failed);
      }
    },
    renderCanvas(context, input, params) {
      const work = canvasWarpWork();
      let failed = false;
      try {
        work.input = input;
        const mapping = warpMapping(
            id,
            params,
            input.width,
            input.height,
            work,
          ),
          image = (work.image = readRenderImageData(
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
        for (let i = 0; i < image.data.length; i += 4) {
          const alpha = image.data[i + 3]!;
          for (let c = 0; c < 3; c++)
            premultiplied[i + c] = Math.round(
              (image.data[i + c]! * alpha) / 255,
            );
          premultiplied[i + 3] = alpha;
        }
        const sample = (work.sample = [0, 0, 0, 0]);
        for (let y = 0; y < input.height; y++)
          for (let x = 0; x < input.width; x++) {
            const source = mapping.sourcePoint(x + 0.5, y + 0.5);
            if (source)
              samplePremultiplied(
                premultiplied,
                input.width,
                input.height,
                source[0]!,
                source[1]!,
                sample,
                work.sampling,
              );
            else sample.fill(0);
            const i = (y * input.width + x) * 4;
            for (let c = 0; c < 3; c++)
              image.data[i + c] = sample[3]
                ? Math.round((sample[c]! * 255) / sample[3])
                : 0;
            image.data[i + 3] = sample[3]!;
            if (work.point) work.point.length = 0;
            work.point = undefined;
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
        finishCanvasWarpWork(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
