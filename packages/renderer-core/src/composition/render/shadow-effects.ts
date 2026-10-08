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
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
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
export function blurShadowMask(
  input: Uint8Array,
  w: number,
  h: number,
  k: GaussianKernel,
  direction: readonly [number, number],
  padding: number,
): Uint8Array<ArrayBuffer> {
  const output = allocateRenderPixels(
    input.length * 1,
    () => new Uint8Array(input.length),
  );
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
): number[] {
  const color = p.color as readonly number[],
    strength = (mask / 255) * color[3]! * (p.opacity as number),
    alpha = src[3]!;
  if (inner) {
    return [0, 1, 2]
      .map((c) => {
        const straight = alpha ? Math.round((src[c]! * 255) / alpha) : 0;
        return Math.round(
          (Math.round(straight + (color[c]! * 255 - straight) * strength) *
            alpha) /
            255,
        );
      })
      .concat(alpha);
  }
  const shadowAlpha = Math.round(strength * 255),
    shadowRgb = [0, 1, 2].map((c) => Math.round(color[c]! * shadowAlpha));
  return Array.from(src, (v, c) =>
    Math.round(v + (c === 3 ? shadowAlpha : shadowRgb[c]!) * (1 - alpha / 255)),
  );
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
      const k = shadowGaussianKernel(params.blur as number);
      try {
        const offset = (params.offset as readonly number[]).map(
            (v) => Math.round(v * 16) / 16,
          ),
          mask = context.createSurface(input.width, input.height),
          scratch = context.createSurface(input.width, input.height),
          table = context.createSurface(k.weights.length, 1),
          data = allocateRenderPixels(
            k.weights.length * 4 * 1,
            () => new Uint8Array(k.weights.length * 4),
          );
        for (let i = 0; i < k.weights.length; i++) {
          data[i * 4] = k.weights[i]! & 255;
          data[i * 4 + 1] = k.weights[i]! >>> 8;
        }
        context.uploadBytes(table, data);
        context.pass(
          `${PREMULTIPLIED_SAMPLE_SHADER}\nuniform vec2 offset;uniform float inner;void main(){float coverage=sampleBytes(gl_FragCoord.xy-offset).a/255.0;pixel=vec4(inner==1.0?1.0-coverage:coverage);}`,
          mask,
          [input],
          { offset, inner: inner ? 1 : 0 },
        );
        for (const [output, source, direction] of [
          [scratch, mask, [1, 0]],
          [mask, scratch, [0, 1]],
        ] as const)
          context.pass(GAUSSIAN, output, [source, table], {
            radius: k.radius,
            total: k.total,
            direction,
            padding: inner ? 255 : 0,
          });
        context.pass(COMPOSITE, scratch, [input, mask], {
          color,
          opacity,
          inner: inner ? 1 : 0,
        });
        return scratch;
      } finally {
        releaseRenderMetadata(k);
      }
    },
    renderCanvas(context, input, params) {
      const color = params.color as readonly number[],
        opacity = params.opacity as number;
      if (opacity === 0 || color[3] === 0) return input;
      const image = readRenderImageData(
          input.ctx,
          0,
          0,
          input.width,
          input.height,
        ),
        premultiplied = allocateRenderPixels(
          image.data.length * 1,
          () => new Uint8Array(image.data.length),
        ),
        offset = (params.offset as readonly number[]).map(
          (v) => Math.round(v * 16) / 16,
        ),
        sample = [0, 0, 0, 0];
      for (let i = 0; i < image.data.length; i += 4) {
        const alpha = image.data[i + 3]!;
        for (let c = 0; c < 3; c++)
          premultiplied[i + c] = Math.round((image.data[i + c]! * alpha) / 255);
        premultiplied[i + 3] = alpha;
      }
      const mask = allocateRenderPixels(
        input.width * input.height * 1,
        () => new Uint8Array(input.width * input.height),
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
          );
          mask[y * input.width + x] = inner ? 255 - sample[3]! : sample[3]!;
        }
      const k = shadowGaussianKernel(params.blur as number);
      try {
        const horizontal = blurShadowMask(
            mask,
            input.width,
            input.height,
            k,
            [1, 0],
            inner ? 255 : 0,
          ),
          blurred = blurShadowMask(
            horizontal,
            input.width,
            input.height,
            k,
            [0, 1],
            inner ? 255 : 0,
          );
        for (let i = 0; i < premultiplied.length; i += 4) {
          const out = shadowCompositePixel(
            inner,
            premultiplied.subarray(i, i + 4),
            blurred[i / 4]!,
            params,
          );
          for (let c = 0; c < 3; c++)
            image.data[i + c] = out[3]
              ? Math.round((out[c]! * 255) / out[3])
              : 0;
          image.data[i + 3] = out[3]!;
        }
        const output = context.createSurface(input.width, input.height);
        output.ctx.putImageData(image, 0, 0);
        return output;
      } finally {
        releaseRenderMetadata(k);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
