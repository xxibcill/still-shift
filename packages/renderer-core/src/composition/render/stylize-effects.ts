import {
  allocateRenderPixels,
  readRenderImageData,
} from "../../managed-memory-context.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import { colorEffectChannel } from "./color-effects.ts";
import {
  samplePremultiplied,
  PREMULTIPLIED_SAMPLE_SHADER,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Parameters<CompositionEffectPlugin["renderGpu"]>[2];
const f = Math.fround;
export function vignetteStrength(
  p: Params,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const center = p.center as readonly number[],
    radius = p.radius as readonly number[];
  const dx = f(f(x - f(f(center[0]!) * width)) / f(radius[0]!)),
    dy = f(f(y - f(f(center[1]!) * height)) / f(radius[1]!));
  const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))),
    softness = f(p.softness as number);
  return f(
    Math.max(0, Math.min(1, f(f(distance - f(1 - softness)) / softness))) *
      f(p.amount as number),
  );
}
export function chromaticOffset(p: Params): readonly [number, number] {
  const offset = p.offset as readonly number[];
  return [
    Math.round(offset[0]! * 16) / 16 || 0,
    Math.round(offset[1]! * 16) / 16 || 0,
  ];
}
const COMMON = `vec3 straightBytes(vec4 value){return value.a>0.0?floor(value.rgb*255.0/value.a+0.5)/255.0:vec3(0.0);}
uniform float amount;
void finishColor(vec3 rgb,float alpha){pixel=bytes(vec4(floor(clamp(rgb,0.0,1.0)*255.0+0.5)/255.0*alpha,alpha));}`;
const VIGNETTE = `uniform vec2 dimensions;uniform vec2 center;uniform vec2 radius;uniform float softness;uniform vec4 color;
void main(){vec4 src=texelFetch(source,ivec2(gl_FragCoord.xy),0);vec3 rgb=straightBytes(floor(src*255.0+0.5));vec2 relative=(gl_FragCoord.xy-center*dimensions)/radius;float distance=sqrt(relative.x*relative.x+relative.y*relative.y);float strength=clamp((distance-(1.0-softness))/softness,0.0,1.0)*amount;finishColor(mix(rgb,color.rgb,strength*color.a),src.a);}`;
const CHROMATIC = `uniform vec2 offset;
void main(){vec4 src=texelFetch(source,ivec2(gl_FragCoord.xy),0);vec3 rgb=straightBytes(floor(src*255.0+0.5));vec3 red=straightBytes(sampleBytes(gl_FragCoord.xy+offset)),blue=straightBytes(sampleBytes(gl_FragCoord.xy-offset));finishColor(mix(rgb,vec3(red.r,rgb.g,blue.b),amount),src.a);}`;
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function stylizeEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["stylize.vignette", "stylize.chromatic-aberration"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const vignette = id === "stylize.vignette";
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      const amount = params.amount as number,
        offset = vignette ? undefined : chromaticOffset(params);
      if (amount === 0 || (offset && offset.every((v) => v === 0)))
        return input;
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `${COMMON}\n${vignette ? VIGNETTE : PREMULTIPLIED_SAMPLE_SHADER + CHROMATIC}`,
        output,
        [input],
        vignette
          ? {
              amount,
              dimensions: [input.width, input.height],
              center: params.center as readonly number[],
              radius: params.radius as readonly number[],
              softness: params.softness as number,
              color: params.color as readonly number[],
            }
          : { amount, offset: offset! },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const amount = params.amount as number,
        offset = vignette ? undefined : chromaticOffset(params);
      if (amount === 0 || (offset && offset.every((v) => v === 0)))
        return input;
      const image = readRenderImageData(
          input.ctx,
          0,
          0,
          input.width,
          input.height,
        ),
        premultiplied = offset
          ? allocateRenderPixels(
              image.data.length * 1,
              () => new Uint8Array(image.data.length),
            )
          : undefined;
      if (premultiplied)
        for (let i = 0; i < image.data.length; i += 4) {
          const alpha = image.data[i + 3]!;
          for (let c = 0; c < 3; c++)
            premultiplied[i + c] = Math.round(
              (image.data[i + c]! * alpha) / 255,
            );
          premultiplied[i + 3] = alpha;
        }
      const red = [0, 0, 0, 0],
        blue = [0, 0, 0, 0],
        color = params.color as readonly number[] | undefined;
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const i = (y * input.width + x) * 4,
            alpha = image.data[i + 3]!,
            rgb = [0, 1, 2].map((c) =>
              colorEffectChannel(image.data[i + c]!, alpha),
            );
          if (premultiplied && offset) {
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              x + 0.5 + offset[0],
              y + 0.5 + offset[1],
              red,
            );
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              x + 0.5 - offset[0],
              y + 0.5 - offset[1],
              blue,
            );
            const r = red[3] ? Math.round((red[0]! * 255) / red[3]) / 255 : 0,
              b = blue[3] ? Math.round((blue[2]! * 255) / blue[3]) / 255 : 0;
            rgb[0] = rgb[0]! + (r - rgb[0]!) * amount;
            rgb[2] = rgb[2]! + (b - rgb[2]!) * amount;
          } else {
            const strength =
              vignetteStrength(
                params,
                x + 0.5,
                y + 0.5,
                input.width,
                input.height,
              ) * color![3]!;
            for (let c = 0; c < 3; c++)
              rgb[c] = rgb[c]! + (color![c]! - rgb[c]!) * strength;
          }
          for (let c = 0; c < 3; c++)
            image.data[i + c] = Math.round(
              Math.max(0, Math.min(1, rgb[c]!)) * 255,
            );
        }
      const output = context.createSurface(input.width, input.height);
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
