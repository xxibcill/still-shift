import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import {
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
} from "../../managed-memory-context.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  samplePremultiplied,
  PREMULTIPLIED_SAMPLE_SHADER,
  type PremultipliedSampleControl,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import type { WebglSurface } from "./webgl-device.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
type ShadowPass = [
  WebglSurface | undefined,
  WebglSurface | undefined,
  number[] | undefined,
];
type GpuShadowWork = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  offset?: number[] | undefined;
  rows?: ShadowPass[] | undefined;
  data?: Uint8Array<ArrayBuffer> | undefined;
  kernel?: GaussianKernel | undefined;
  shader?: string | undefined;
  references: WebglSurface[];
  inputs: WebglSurface[][];
  uniforms: Record<string, number | readonly number[]>[];
};
function clearGpuShadow(work: GpuShadowWork) {
  const data = work.data,
    kernel = work.kernel,
    memory = work.memory;
  work.data = work.kernel = work.memory = undefined;
  if (work.offset) work.offset.length = 0;
  if (work.rows) {
    for (const row of work.rows) {
      if (row[2]) row[2].length = 0;
      row[0] = row[1] = row[2] = undefined;
    }
    work.rows.length = 0;
  }
  for (const input of work.inputs) input.length = 0;
  for (const uniforms of work.uniforms)
    for (const name in uniforms) delete uniforms[name];
  work.offset = work.rows = work.shader = undefined;
  work.references.length = work.inputs.length = work.uniforms.length = 0;
  let failed = false,
    first: unknown;
  try {
    if (data) memory?.release(data.buffer);
  } catch (error) {
    failed = true;
    first = error;
  }
  try {
    if (kernel) releaseRenderMetadata(kernel);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  if (failed) throw first;
}
function gpuShadowWork() {
  // Original generated mask body is 708 UTF16 units. This fixed arena also
  // covers offset/directions, two pass tuples, four input/uniform records,
  // the upload view and borrowed native/controller refs; pixels admit separately.
  return allocateRenderMetadata<GpuShadowWork>(
    8192,
    () => ({
      managed: renderMemory() !== undefined,
      memory: renderMemory(),
      references: [],
      inputs: [],
      uniforms: [],
    }),
    false,
    clearGpuShadow,
  );
}
function shadowInputs(work: GpuShadowWork, inputs: WebglSurface[]) {
  work.inputs.push(inputs);
  return inputs;
}
function shadowUniforms(
  work: GpuShadowWork,
  uniforms: Record<string, number | readonly number[]>,
) {
  work.uniforms.push(uniforms);
  return uniforms;
}
function shadowReference(work: GpuShadowWork, surface: WebglSurface) {
  work.references.push(surface);
  return surface;
}
function finishGpuShadow(work: GpuShadowWork, primaryFailed: boolean) {
  try {
    if (work.managed) releaseRenderMetadata(work);
    else clearGpuShadow(work);
  } catch (error) {
    if (!primaryFailed) throw error;
  }
}

type CompositeWork = {
  channels?: number[] | undefined;
  mapped?: number[] | undefined;
  output?: number[] | undefined;
};
function clearCompositeWork(work: CompositeWork) {
  if (work.channels) work.channels.length = 0;
  if (work.mapped) work.mapped.length = 0;
  if (work.output) work.output.length = 0;
  work.channels = work.mapped = work.output = undefined;
}
type CanvasShadowWork = {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  image?: ImageData | undefined;
  premultiplied?: Uint8Array<ArrayBuffer> | undefined;
  mask?: Uint8Array<ArrayBuffer> | undefined;
  horizontal?: Uint8Array<ArrayBuffer> | undefined;
  blurred?: Uint8Array<ArrayBuffer> | undefined;
  offset?: number[] | undefined;
  sample?: number[] | undefined;
  view?: Uint8Array<ArrayBuffer> | undefined;
  directions?: number[][] | undefined;
  kernel?: GaussianKernel | undefined;
  output?: CanvasSurface | undefined;
  blurControls: [ShadowBlurControl, ShadowBlurControl];
  composite: CompositeWork;
  sampling: PremultipliedSampleControl;
};
function clearCanvasShadow(work: CanvasShadowWork) {
  let failed = false,
    first: unknown;
  const visit = (value: ArrayBuffer | undefined) => {
    try {
      if (value) work.memory?.release(value);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  };
  visit(work.image?.data.buffer as ArrayBuffer | undefined);
  visit(work.premultiplied?.buffer);
  visit(work.mask?.buffer);
  visit((work.horizontal ?? work.blurControls[0].value)?.buffer);
  visit((work.blurred ?? work.blurControls[1].value)?.buffer);
  try {
    if (work.kernel) releaseRenderMetadata(work.kernel);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  if (work.offset) work.offset.length = 0;
  if (work.sample) work.sample.length = 0;
  if (work.directions) {
    for (const direction of work.directions) direction.length = 0;
  }
  work.blurControls[0].value = work.blurControls[1].value = undefined;
  clearCompositeWork(work.composite);
  work.sampling.index = undefined;
  work.image =
    work.premultiplied =
    work.mask =
    work.horizontal =
    work.blurred =
      undefined;
  work.offset =
    work.sample =
    work.view =
    work.directions =
    work.kernel =
    work.output =
    work.memory =
      undefined;
  if (failed) throw first;
}
function canvasShadowWork() {
  // One fixed arena reuses per-pixel ref slots; actual pixel stores admit separately.
  return allocateRenderMetadata<CanvasShadowWork>(
    8192,
    () => ({
      managed: renderMemory() !== undefined,
      memory: renderMemory(),
      composite: {},
      sampling: {},
      blurControls: [{}, {}],
    }),
    false,
    clearCanvasShadow,
  );
}
function finishCanvasShadow(work: CanvasShadowWork, primaryFailed: boolean) {
  try {
    if (work.managed) releaseRenderMetadata(work);
    else clearCanvasShadow(work);
  } catch (error) {
    if (!primaryFailed) throw error;
  }
}

type GaussianKernel = { radius: number; weights: number[]; total: number };
type KernelWork = {
  managed: boolean;
  shape?: { length: number } | undefined;
  float?: number[] | undefined;
  weights?: number[] | undefined;
};
function clearKernelWork(work: KernelWork) {
  if (work.float) work.float.length = 0;
  if (work.weights) work.weights.length = 0;
  work.shape = work.float = work.weights = undefined;
}
function clearGaussianKernel(kernel: GaussianKernel) {
  kernel.weights.length = 0;
  delete (kernel as Partial<GaussianKernel>).weights;
  delete (kernel as Partial<GaussianKernel>).radius;
  delete (kernel as Partial<GaussianKernel>).total;
}
export function shadowGaussianKernel(sigma: number): GaussianKernel {
  if (sigma === 0)
    return allocateRenderMetadata<GaussianKernel>(
      520,
      () => ({ radius: 0, weights: [4096], total: 4096 }),
      false,
      clearGaussianKernel,
    );
  const radius = Math.ceil(sigma * 3);
  const length = Math.max(0, radius * 2 + 1) || 0;
  const work = allocateRenderMetadata<KernelWork>(
    1024 + 8 * length,
    () => ({ managed: renderMemory() !== undefined }),
    false,
    clearKernelWork,
  );
  try {
    work.float = Array.from((work.shape = { length: radius * 2 + 1 }), (_, i) =>
      Math.exp(-0.5 * ((i - radius) / sigma) ** 2),
    );
    const sum = work.float.reduce((a, b) => a + b, 0);
    const result = allocateRenderMetadata<GaussianKernel>(
      512 + 8 * length,
      () => {
        const weights = (work.weights = work.float!.map((v) =>
          Math.round((v / sum) * 4096),
        ));
        return { radius, weights, total: weights.reduce((a, b) => a + b, 0) };
      },
      false,
      clearGaussianKernel,
    );
    work.weights = undefined;
    return result;
  } finally {
    if (work.managed) releaseRenderMetadata(work);
    else clearKernelWork(work);
  }
}
type ShadowBlurControl = { value?: Uint8Array<ArrayBuffer> | undefined };
export function blurShadowMask(
  input: Uint8Array,
  w: number,
  h: number,
  k: GaussianKernel,
  direction: readonly [number, number],
  padding: number,
  control?: ShadowBlurControl,
): Uint8Array<ArrayBuffer> {
  if (!control) {
    const memory = renderMemory();
    let partial: ShadowBlurControl | undefined;
    try {
      const value = allocateRenderMetadata<Uint8Array<ArrayBuffer>>(
        512,
        () =>
          blurShadowMask(input, w, h, k, direction, padding, (partial = {})),
        false,
        (view) => memory?.release(view.buffer),
      );
      partial!.value = undefined;
      partial = undefined;
      return value;
    } catch (error) {
      try {
        if (partial?.value) memory?.release(partial.value.buffer);
      } catch {
        /* Preserve original pixel/metadata/math failure. */
      }
      if (partial) partial.value = undefined;
      throw error;
    }
  }
  const output = allocateRenderPixels(input.length * 1, () => {
    const value = new Uint8Array(input.length);
    if (control) control.value = value;
    return value;
  });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < k.weights.length; j++) {
        const tx = x + (j - k.radius) * direction[0],
          ty = y + (j - k.radius) * direction[1];
        sum +=
          (tx < 0 || ty < 0 || tx >= w || ty >= h
            ? padding
            : input[ty * w + tx]!) * k.weights[j]!;
      }
      output[y * w + x] = Math.floor((sum + Math.floor(k.total / 2)) / k.total);
    }
  return output;
}
/** Premultiplied byte input/output, with original coverage retained for an inner shadow. */
export function shadowCompositePixel(
  inner: boolean,
  src: readonly number[] | Uint8Array,
  mask: number,
  p: Params,
  work?: CompositeWork,
): number[] {
  if (!work) {
    const managed = renderMemory() !== undefined;
    const phase = allocateRenderMetadata<CompositeWork>(
      1024,
      () => ({}),
      false,
      clearCompositeWork,
    );
    let failed = false;
    let failure: unknown;
    let result: number[] | undefined;
    try {
      result = allocateRenderMetadata<number[]>(
        256 + 8 * (inner ? 4 : src.length),
        () => shadowCompositePixel(inner, src, mask, p, phase),
        false,
        (output) => {
          output.length = 0;
        },
      );
      phase.output = undefined;
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      try {
        if (managed) releaseRenderMetadata(phase);
        else clearCompositeWork(phase);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) {
      if (result) {
        try {
          if (managed) releaseRenderMetadata(result);
          else result.length = 0;
        } catch {
          /* Preserve the first producer or cleanup failure. */
        }
      }
      throw failure;
    }
    return result!;
  }
  const color = p.color as readonly number[],
    strength = (mask / 255) * color[3]! * (p.opacity as number),
    alpha = src[3]!;
  if (inner) {
    const channels = [0, 1, 2];
    if (work) work.channels = channels;
    const mapped = channels.map((c) => {
      const straight = alpha ? Math.round((src[c]! * 255) / alpha) : 0;
      return Math.round(
        (Math.round(straight + (color[c]! * 255 - straight) * strength) *
          alpha) /
          255,
      );
    });
    if (work) work.mapped = mapped;
    const output = mapped.concat(alpha);
    if (work) work.output = output;
    return output;
  }
  const shadowAlpha = Math.round(strength * 255);
  const channels = [0, 1, 2];
  if (work) work.channels = channels;
  const shadowRgb = channels.map((c) => Math.round(color[c]! * shadowAlpha));
  if (work) work.mapped = shadowRgb;
  const output = Array.from(src, (v, c) =>
    Math.round(v + (c === 3 ? shadowAlpha : shadowRgb[c]!) * (1 - alpha / 255)),
  );
  if (work) work.output = output;
  return output;
}
const GAUSSIAN = `uniform float radius;uniform float total;uniform vec2 direction;uniform float padding;
uint exactDivideShadow(uint n,uint d){uint q=uint(floor(float(n)/float(d)));if(q*d>n)q--;if((q+1u)*d<=n)q++;return q;}
void main(){ivec2 point=ivec2(gl_FragCoord.xy),size=textureSize(source,0);uint sum=uint(floor(total/2.0));for(int i=0;i<769;i++){if(i>=textureSize(backdrop,0).x)break;uvec4 code=uvec4(floor(texelFetch(backdrop,ivec2(i,0),0)*255.0+0.5));uint weight=code.r|(code.g<<8u);ivec2 samplePoint=point+ivec2(direction*(float(i)-radius));uint value=uint(padding);if(all(greaterThanEqual(samplePoint,ivec2(0)))&&all(lessThan(samplePoint,size)))value=uint(floor(texelFetch(source,samplePoint,0).r*255.0+0.5));sum+=value*weight;}float value=float(exactDivideShadow(sum,uint(total)))/255.0;pixel=vec4(value);}`;
const COMPOSITE = `uniform float inner;uniform vec4 color;uniform float opacity;
void main(){vec4 src=texelFetch(source,ivec2(gl_FragCoord.xy),0),mask=texelFetch(backdrop,ivec2(gl_FragCoord.xy),0);float strength=mask.r*color.a*opacity;if(inner==1.0){vec4 stored=floor(src*255.0+0.5);vec3 straight=stored.a>0.0?floor(stored.rgb*255.0/stored.a+0.5)/255.0:vec3(0.0);vec3 rgb=floor(mix(straight,color.rgb,strength)*255.0+0.5)/255.0;pixel=bytes(vec4(rgb*src.a,src.a));}else{float alpha=floor(strength*255.0+0.5);vec4 shadow=vec4(floor(color.rgb*alpha+0.5),alpha)/255.0;pixel=bytes(src+shadow*(1.0-src.a));}}`;
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function shadowEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["light.drop-shadow", "light.inner-shadow"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const inner = id === "light.inner-shadow";
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      const color = params.color as readonly number[],
        opacity = params.opacity as number;
      if (opacity === 0 || color[3] === 0) return input;
      const work = gpuShadowWork();
      let failed = false;
      try {
        const k = (work.kernel = shadowGaussianKernel(params.blur as number));
        const offset = (work.offset = (params.offset as readonly number[]).map(
            (v) => Math.round(v * 16) / 16,
          )),
          mask = shadowReference(
            work,
            context.createSurface(input.width, input.height),
          ),
          scratch = shadowReference(
            work,
            context.createSurface(input.width, input.height),
          ),
          table = shadowReference(
            work,
            context.createSurface(k.weights.length, 1),
          ),
          data = allocateRenderPixels(
            k.weights.length * 4 * 1,
            () => (work.data = new Uint8Array(k.weights.length * 4)),
          );
        for (let i = 0; i < k.weights.length; i++) {
          data[i * 4] = k.weights[i]! & 255;
          data[i * 4 + 1] = k.weights[i]! >>> 8;
        }
        context.uploadBytes(table, data);
        context.pass(
          (work.shader = `${PREMULTIPLIED_SAMPLE_SHADER}\nuniform vec2 offset;uniform float inner;void main(){float coverage=sampleBytes(gl_FragCoord.xy-offset).a/255.0;pixel=vec4(inner==1.0?1.0-coverage:coverage);}`),
          mask,
          shadowInputs(work, [input]),
          shadowUniforms(work, { offset, inner: inner ? 1 : 0 }),
        );
        for (const [output, source, direction] of (work.rows = [
          [scratch, mask, [1, 0]],
          [mask, scratch, [0, 1]],
        ]))
          context.pass(
            GAUSSIAN,
            output!,
            shadowInputs(work, [source!, table]),
            shadowUniforms(work, {
              radius: k.radius,
              total: k.total,
              direction: direction!,
              padding: inner ? 255 : 0,
            }),
          );
        context.pass(
          COMPOSITE,
          scratch,
          shadowInputs(work, [input, mask]),
          shadowUniforms(work, {
            color,
            opacity,
            inner: inner ? 1 : 0,
          }),
        );
        return scratch;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishGpuShadow(work, failed);
      }
    },
    renderCanvas(context, input, params) {
      const color = params.color as readonly number[],
        opacity = params.opacity as number;
      if (opacity === 0 || color[3] === 0) return input;
      const work = canvasShadowWork();
      let failed = false;
      try {
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
          ),
          offset = (work.offset = (params.offset as readonly number[]).map(
            (v) => Math.round(v * 16) / 16,
          )),
          sample = (work.sample = [0, 0, 0, 0]);
        for (let i = 0; i < image.data.length; i += 4) {
          const alpha = image.data[i + 3]!;
          for (let c = 0; c < 3; c++)
            premultiplied[i + c] = Math.round(
              (image.data[i + c]! * alpha) / 255,
            );
          premultiplied[i + 3] = alpha;
        }
        const mask = allocateRenderPixels(
          input.width * input.height * 1,
          () => (work.mask = new Uint8Array(input.width * input.height)),
        );
        for (let y = 0; y < input.height; y++)
          for (let x = 0; x < input.width; x++) {
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              x + 0.5 - offset[0]!,
              y + 0.5 - offset[1]!,
              sample,
              work.sampling,
            );
            mask[y * input.width + x] = inner ? 255 - sample[3]! : sample[3]!;
          }
        const k = (work.kernel = shadowGaussianKernel(params.blur as number));

        const horizontal = (work.horizontal = blurShadowMask(
            mask,
            input.width,
            input.height,
            k,
            (work.directions = [[1, 0]])[0] as [number, number],
            inner ? 255 : 0,
            work.blurControls[0],
          )),
          blurred = (work.blurred = blurShadowMask(
            horizontal,
            input.width,
            input.height,
            k,
            (work.directions![1] = [0, 1]) as [number, number],
            inner ? 255 : 0,
            work.blurControls[1],
          ));
        for (let i = 0; i < premultiplied.length; i += 4) {
          try {
            const out = shadowCompositePixel(
              inner,
              (work.view = premultiplied.subarray(i, i + 4)),
              blurred[i / 4]!,
              params,
              work.composite,
            );
            for (let c = 0; c < 3; c++)
              image.data[i + c] = out[3]
                ? Math.round((out[c]! * 255) / out[3])
                : 0;
            image.data[i + 3] = out[3]!;
          } finally {
            clearCompositeWork(work.composite);
            work.view = undefined;
          }
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
        finishCanvasShadow(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
