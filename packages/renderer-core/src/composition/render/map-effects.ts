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
import type { WebglSurface } from "./webgl-device.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
type MapNeutralControl = { every?: ((value: number) => boolean) | undefined };
type GpuMapWork = MapNeutralControl & {
  managed: boolean;
  input?: WebglSurface | undefined;
  field?: WebglSurface | undefined;
  output?: WebglSurface | undefined;
  mapProducer?: ((value: number) => number) | undefined;
  amountFixed?: number[] | undefined;
  uniforms?: Record<string, number | readonly number[]> | undefined;
  segment?: string | undefined;
  shader?: string | undefined;
  inputs?: WebglSurface[] | undefined;
};
function clearGpuMapWork(work: GpuMapWork) {
  if (work.amountFixed) work.amountFixed.length = 0;
  if (work.inputs) work.inputs.length = 0;
  if (work.uniforms) for (const key in work.uniforms) delete work.uniforms[key];
  for (const key in work)
    delete (work as Partial<GpuMapWork>)[key as keyof GpuMapWork];
}
function gpuMapWork(): GpuMapWork {
  const managed = renderMemory() !== undefined;
  return allocateRenderMetadata<GpuMapWork>(
    16384,
    () => ({ managed }),
    false,
    clearGpuMapWork,
  );
}
function finishGpuMapWork(work: GpuMapWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearGpuMapWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
type MapChannelControl = {
  straight?: ((channel: number) => number) | undefined;
};
type PremultiplyControl = { value?: Uint8Array<ArrayBuffer> | undefined };
type CanvasMapWork = MapNeutralControl & {
  managed: boolean;
  memory: ReturnType<typeof renderMemory>;
  input?: CanvasSurface | undefined;
  map?: CanvasSurface | undefined;
  output?: CanvasSurface | undefined;
  image?: ImageData | undefined;
  mapImage?: ImageData | undefined;
  source?: Uint8Array<ArrayBuffer> | undefined;
  field?: Uint8Array<ArrayBuffer> | undefined;
  amount?: number[] | undefined;
  amountProducer?: ((value: number) => number) | undefined;
  sample?: number[] | undefined;
  view?: Uint8Array<ArrayBuffer> | undefined;
  sourceControl: PremultiplyControl;
  fieldControl: PremultiplyControl;
  sampling: PremultipliedSampleControl;
  channel: MapChannelControl;
};
function clearCanvasMapWork(work: CanvasMapWork) {
  let failed = false,
    first: unknown;
  const visit = (value: ArrayBufferLike | undefined) => {
    try {
      if (value) work.memory?.release(value);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  };
  visit(work.image?.data.buffer);
  visit((work.source ?? work.sourceControl.value)?.buffer);
  visit(work.mapImage?.data.buffer);
  visit((work.field ?? work.fieldControl.value)?.buffer);
  if (work.amount) work.amount.length = 0;
  if (work.sample) work.sample.length = 0;
  work.sourceControl.value = work.fieldControl.value = undefined;
  work.sampling.index = work.channel.straight = undefined;
  for (const key in work)
    delete (work as Partial<CanvasMapWork>)[key as keyof CanvasMapWork];
  if (failed) throw first;
}
function canvasMapWork(): CanvasMapWork {
  const memory = renderMemory();
  return allocateRenderMetadata<CanvasMapWork>(
    16384,
    () => ({
      managed: memory !== undefined,
      memory,
      sourceControl: {},
      fieldControl: {},
      sampling: {},
      channel: {},
    }),
    false,
    clearCanvasMapWork,
  );
}
function finishCanvasMapWork(work: CanvasMapWork, failed: boolean) {
  const managed = work.managed;
  try {
    if (managed) releaseRenderMetadata(work);
    else clearCanvasMapWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
type Params = Parameters<CompositionEffectPlugin["renderGpu"]>[2];
/** Channels 0–3 = RGBA; 4 = byte-weighted encoded-sRGB luminance. Input is premultiplied. */
export function mapChannel(
  pixel: ArrayLike<number>,
  channel: number,
  control?: MapChannelControl,
): number {
  if (channel === 3) return pixel[3]!;
  const a = pixel[3]!;
  const straight = (c: number) => (a ? Math.round((pixel[c]! * 255) / a) : 0);
  if (control) control.straight = straight;
  try {
    return channel === 4
      ? Math.floor(
          (54 * straight(0) + 183 * straight(1) + 19 * straight(2) + 128) / 256,
        )
      : straight(channel);
  } finally {
    if (control) control.straight = undefined;
  }
}
/** Signed alpha-gated source offset in sixteenths of a pixel. */
export const mapDisplacement = (
  value: number,
  alpha: number,
  midpoint: number,
  amountFixed: number,
) => Math.floor(((value - midpoint) * amountFixed * alpha) / 65025) || 0;
export function wipeCoverage(value: number, alpha: number, p: Params): number {
  const progress = p.progress as number,
    softness = p.softness as number;
  if (progress === 0) return 255;
  if (progress === 1) return 0;
  if (p.invert === 1) value = 255 - value;
  const rank = Math.round((value * alpha + 255 * (255 - alpha)) / 255) / 255;
  return softness === 0
    ? rank < progress
      ? 0
      : 255
    : Math.round(
        Math.max(0, Math.min(1, (rank - progress) / softness + 0.5)) * 255,
      );
}
export const MAP_CHANNEL_SHADER = `
uint exactDivideMap(uint n,uint d){uint q=uint(floor(float(n)/float(d)));if(q*d>n)q--;if((q+1u)*d<=n)q++;return q;}
uvec4 mapBytes(){return uvec4(floor(texelFetch(backdrop,ivec2(gl_FragCoord.xy),0)*255.0+0.5));}
uint selectedChannel(uvec4 value,int channel){if(channel==3)return value.a;uvec3 straight=value.a>0u?uvec3(exactDivideMap(value.r*255u+(value.a>>1u),value.a),exactDivideMap(value.g*255u+(value.a>>1u),value.a),exactDivideMap(value.b*255u+(value.a>>1u),value.a)):uvec3(0u);return channel==4?(54u*straight.r+183u*straight.g+19u*straight.b+128u)>>8u:straight[channel];}
`;
export const MAP_DISPLACEMENT_SHADER = `uniform vec2 amountFixed;uniform float midpoint;uniform float channelX;uniform float channelY;
int displaced(uint value,uint alpha,int amount){int product=(int(value)-int(midpoint))*amount*int(alpha);uint magnitude=uint(abs(product)),quotient=exactDivideMap(magnitude,65025u);return product<0?-int(quotient+(magnitude-quotient*65025u>0u?1u:0u)):int(quotient);}`;
const DISPLACE = `${MAP_DISPLACEMENT_SHADER}
void main(){uvec4 map=mapBytes();ivec2 delta=ivec2(displaced(selectedChannel(map,int(channelX)),map.a,int(amountFixed.x)),displaced(selectedChannel(map,int(channelY)),map.a,int(amountFixed.y)));pixel=sampleBytes(vec2(ivec2(gl_FragCoord.xy*16.0)+delta)/16.0)/255.0;}`;
const WIPE = `uniform float progress;uniform float softness;uniform float channel;uniform float invert;
void main(){uvec4 map=mapBytes();uint value=selectedChannel(map,int(channel));if(invert==1.0)value=255u-value;float rank=float(exactDivideMap(value*map.a+255u*(255u-map.a)+127u,255u))/255.0;float coverage=progress==0.0?1.0:progress==1.0?0.0:softness==0.0?step(progress,rank):clamp((rank-progress)/softness+0.5,0.0,1.0);coverage=floor(coverage*255.0+0.5)/255.0;pixel=bytes(texelFetch(source,ivec2(gl_FragCoord.xy),0)*coverage);}`;
function premultiply(
  pixels: Uint8ClampedArray,
  control?: PremultiplyControl,
): Uint8Array<ArrayBuffer> {
  const output = allocateRenderPixels(pixels.length * 1, () => {
    const value = new Uint8Array(pixels.length);
    if (control) control.value = value;
    return value;
  });
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    for (let c = 0; c < 3; c++)
      output[i + c] = Math.round((pixels[i + c]! * a) / 255);
    output[i + 3] = a;
  }
  return output;
}
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function mapEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["distort.displacement-map", "transition.gradient-wipe"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const displace = id === "distort.displacement-map";
  const neutral = (p: Params, control?: MapNeutralControl) => {
    if (!displace) return p.progress === 0;
    return (p.amount as readonly number[]).every(
      control
        ? (control.every = (value: number) => value === 0)
        : (value) => value === 0,
    );
  };
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      const work = gpuMapWork();
      let failed = false;
      try {
        work.input = input;
        if (neutral(params, work)) return input;
        const map = (work.field = context.layers.get("map")!),
          output = (work.output = context.createSurface(
            input.width,
            input.height,
          )),
          uniforms = (work.uniforms = displace
            ? {
                amountFixed: (work.amountFixed = (
                  params.amount as readonly number[]
                ).map((work.mapProducer = (v) => Math.round(v * 16)))),
                midpoint: Math.round((params.midpoint as number) * 255),
                channelX: params.channelX as number,
                channelY: params.channelY as number,
              }
            : {
                progress: params.progress as number,
                softness: params.softness as number,
                channel: params.channel as number,
                invert: params.invert as number,
              });
        context.pass(
          (work.shader = `${MAP_CHANNEL_SHADER}\n${(work.segment = displace ? PREMULTIPLIED_SAMPLE_SHADER + DISPLACE : WIPE)}`),
          output,
          (work.inputs = [input, map]),
          uniforms,
        );
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishGpuMapWork(work, failed);
      }
    },
    renderCanvas(context, input, params) {
      const work = canvasMapWork();
      let failed = false;
      try {
        work.input = input;
        if (neutral(params, work)) return input;
        const map = (work.map = context.layers!.get("map")!),
          image = (work.image = readRenderImageData(
            input.ctx,
            0,
            0,
            input.width,
            input.height,
          )),
          source = (work.source = premultiply(image.data, work.sourceControl)),
          field = (work.field = premultiply(
            (work.mapImage = readRenderImageData(
              map.ctx,
              0,
              0,
              map.width,
              map.height,
            )).data,
            work.fieldControl,
          )),
          amount = (work.amount = displace
            ? (params.amount as readonly number[]).map(
                (work.amountProducer = (v) => Math.round(v * 16)),
              )
            : []),
          midpoint = displace
            ? Math.round((params.midpoint as number) * 255)
            : 0,
          sample = (work.sample = [0, 0, 0, 0]);
        for (let y = 0; y < input.height; y++)
          for (let x = 0; x < input.width; x++) {
            const i = (y * input.width + x) * 4,
              pixel = (work.view = field.subarray(i, i + 4));
            if (displace) {
              const dx = mapDisplacement(
                  mapChannel(pixel, params.channelX as number, work.channel),
                  pixel[3]!,
                  midpoint,
                  amount[0]!,
                ),
                dy = mapDisplacement(
                  mapChannel(pixel, params.channelY as number, work.channel),
                  pixel[3]!,
                  midpoint,
                  amount[1]!,
                );
              samplePremultiplied(
                source,
                input.width,
                input.height,
                x + 0.5 + dx / 16,
                y + 0.5 + dy / 16,
                sample,
                work.sampling,
              );
            } else {
              const coverage = wipeCoverage(
                mapChannel(pixel, params.channel as number, work.channel),
                pixel[3]!,
                params,
              );
              for (let c = 0; c < 4; c++)
                sample[c] = Math.round((source[i + c]! * coverage) / 255);
            }
            for (let c = 0; c < 3; c++)
              image.data[i + c] = sample[3]
                ? Math.round((sample[c]! * 255) / sample[3])
                : 0;
            image.data[i + 3] = sample[3]!;
            work.view = undefined;
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
        finishCanvasMapWork(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
