import {
  allocateRenderPixels,
  readRenderImageData,
} from "../../managed-memory-context.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  samplePremultiplied,
  PREMULTIPLIED_SAMPLE_SHADER,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Parameters<CompositionEffectPlugin["renderGpu"]>[2];
/** Channels 0–3 = RGBA; 4 = byte-weighted encoded-sRGB luminance. Input is premultiplied. */
export function mapChannel(pixel: ArrayLike<number>, channel: number): number {
  if (channel === 3) return pixel[3]!;
  const a = pixel[3]!;
  const straight = (c: number) => (a ? Math.round((pixel[c]! * 255) / a) : 0);
  return channel === 4
    ? Math.floor(
        (54 * straight(0) + 183 * straight(1) + 19 * straight(2) + 128) / 256,
      )
    : straight(channel);
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
function premultiply(pixels: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  const output = allocateRenderPixels(
    pixels.length * 1,
    () => new Uint8Array(pixels.length),
  );
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
  const neutral = (p: Params) =>
    displace
      ? (p.amount as readonly number[]).every((v) => v === 0)
      : p.progress === 0;
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      if (neutral(params)) return input;
      const map = context.layers.get("map")!,
        output = context.createSurface(input.width, input.height),
        uniforms = displace
          ? {
              amountFixed: (params.amount as readonly number[]).map((v) =>
                Math.round(v * 16),
              ),
              midpoint: Math.round((params.midpoint as number) * 255),
              channelX: params.channelX as number,
              channelY: params.channelY as number,
            }
          : {
              progress: params.progress as number,
              softness: params.softness as number,
              channel: params.channel as number,
              invert: params.invert as number,
            };
      context.pass(
        `${MAP_CHANNEL_SHADER}\n${displace ? PREMULTIPLIED_SAMPLE_SHADER + DISPLACE : WIPE}`,
        output,
        [input, map],
        uniforms,
      );
      return output;
    },
    renderCanvas(context, input, params) {
      if (neutral(params)) return input;
      const map = context.layers!.get("map")!,
        image = readRenderImageData(input.ctx, 0, 0, input.width, input.height),
        source = premultiply(image.data),
        field = premultiply(
          readRenderImageData(map.ctx, 0, 0, map.width, map.height).data,
        ),
        amount = displace
          ? (params.amount as readonly number[]).map((v) => Math.round(v * 16))
          : [],
        midpoint = displace ? Math.round((params.midpoint as number) * 255) : 0,
        sample = [0, 0, 0, 0];
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const i = (y * input.width + x) * 4,
            pixel = field.subarray(i, i + 4);
          if (displace) {
            const dx = mapDisplacement(
                mapChannel(pixel, params.channelX as number),
                pixel[3]!,
                midpoint,
                amount[0]!,
              ),
              dy = mapDisplacement(
                mapChannel(pixel, params.channelY as number),
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
            );
          } else {
            const coverage = wipeCoverage(
              mapChannel(pixel, params.channel as number),
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
        }
      const output = context.createSurface(input.width, input.height);
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
