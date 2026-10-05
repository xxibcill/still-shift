import { compositionEffectDefinition } from "@still-shift/scene-contract";
import { colorEffectChannel } from "./color-effects.ts";
import {
  samplePremultiplied,
  PREMULTIPLIED_SAMPLE_SHADER,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
type NoiseControls = {
  seed: number;
  inverseScale: number;
  octaves: number;
  z: number;
  zWeight: number;
};
const scalar = (p: Params, name: string) => p[name] as number;
const unit = (v: number) => Math.max(0, Math.min(1, v));
/** 32-bit coordinate avalanche; integer wrap and low 16 output bits are intentional. */
export function noiseHash(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  let hash =
    (Math.imul(x, 0x9e3779b1) ^
      Math.imul(y, 0x85ebca77) ^
      Math.imul(z, 0xc2b2ae3d) ^
      seed) >>>
    0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) & 65535;
}
export function noiseControls(p: Params): NoiseControls {
  const evolution = scalar(p, "evolution"),
    epoch = Math.floor(evolution);
  return {
    seed: scalar(p, "seed"),
    inverseScale: Math.round(1048576 / scalar(p, "scale")),
    octaves: scalar(p, "octaves"),
    z: epoch >>> 0,
    zWeight: Math.floor((evolution - epoch) * 256),
  };
}
const interpolate = (a: number, b: number, weight: number) =>
  Math.floor((a * (256 - weight) + b * weight + 128) / 256);
function octaveNoise(
  c: NoiseControls,
  x: number,
  y: number,
  octave: number,
  seed: number,
): number {
  const frequency = 2 ** octave,
    xFixed = Math.floor((x * 2 * c.inverseScale * frequency) / 8192),
    yFixed = Math.floor((y * 2 * c.inverseScale * frequency) / 8192),
    left = Math.floor(xFixed / 256),
    top = Math.floor(yFixed / 256),
    wx = xFixed % 256,
    wy = yFixed % 256;
  const plane = (z: number) =>
    interpolate(
      interpolate(
        noiseHash(left, top, z, seed),
        noiseHash(left + 1, top, z, seed),
        wx,
      ),
      interpolate(
        noiseHash(left, top + 1, z, seed),
        noiseHash(left + 1, top + 1, z, seed),
        wx,
      ),
      wy,
    );
  return interpolate(plane(c.z), plane((c.z + 1) >>> 0), c.zWeight);
}
export function noiseField(
  c: NoiseControls,
  x: number,
  y: number,
  seed = c.seed,
): number {
  let sum = 0;
  for (let octave = 0; octave < c.octaves; octave++)
    sum +=
      octaveNoise(
        c,
        x,
        y,
        octave,
        (seed + Math.imul(octave, 0x9e3779b9)) >>> 0,
      ) *
      2 ** (c.octaves - 1 - octave);
  const total = 2 ** c.octaves - 1;
  return Math.floor((sum + Math.floor(total / 2)) / total);
}
/** Signed displacement in 1/16 pixel units; no ambiguous signed shader division. */
export const turbulentOffset = (noise: number, amountFixed: number) =>
  Math.floor(((noise - 32768) * amountFixed) / 65535) || 0;
const FIELD_SHADER = `uniform float inverseScale;uniform float octaves;uniform vec2 seedParts;uniform vec3 zParts;
uint hashField(uvec3 point,uint seedValue){uint value=point.x*0x9e3779b1u^point.y*0x85ebca77u^point.z*0xc2b2ae3du^seedValue;value=(value^(value>>16u))*0x7feb352du;value=(value^(value>>15u))*0x846ca68bu;return (value^(value>>16u))&65535u;}
uint interpolateField(uint a,uint b,uint weight){return (a*(256u-weight)+b*weight+128u)>>8u;}
uint exactDivide(uint numerator,uint denominator){uint quotient=uint(floor(float(numerator)/float(denominator)));if(quotient*denominator>numerator)quotient--;if((quotient+1u)*denominator<=numerator)quotient++;return quotient;}
uvec2 fixedCoordinate(uvec2 point,int octave){uint reciprocal=uint(inverseScale);uvec2 low=point*(reciprocal&65535u),high=point*(reciprocal>>16u);uint shift=uint(13-octave);return (low>>shift)+(high<<(16u-shift));}
uint fieldPlane(uvec2 point,uvec2 weight,uint z,uint seedValue){uint first=interpolateField(hashField(uvec3(point,z),seedValue),hashField(uvec3(point+uvec2(1u,0u),z),seedValue),weight.x);uint last=interpolateField(hashField(uvec3(point+uvec2(0u,1u),z),seedValue),hashField(uvec3(point+uvec2(1u,1u),z),seedValue),weight.x);return interpolateField(first,last,weight.y);}
uint fieldAt(vec2 pixelPoint,uint seedValue){uvec2 halfPoint=uvec2(pixelPoint*2.0);uint z=uint(zParts.x)|(uint(zParts.y)<<16u),sum=0u;int count=int(octaves);for(int octave=0;octave<8;octave++){if(octave>=count)break;uvec2 coordinate=fixedCoordinate(halfPoint,octave),point=coordinate>>8u,weight=coordinate&255u;uint octaveSeed=seedValue+uint(octave)*0x9e3779b9u;uint value=interpolateField(fieldPlane(point,weight,z,octaveSeed),fieldPlane(point,weight,z+1u,octaveSeed),uint(zParts.z));sum+=value<<(uint(count-1-octave));}uint total=(1u<<uint(count))-1u;return exactDivide(sum+(total>>1u),total);}
uint installedSeed(){return uint(seedParts.x)|(uint(seedParts.y)<<16u);}
`;
function uniforms(
  c: NoiseControls,
): Record<string, number | readonly number[]> {
  return {
    inverseScale: c.inverseScale,
    octaves: c.octaves,
    seedParts: [c.seed & 65535, c.seed >>> 16],
    zParts: [c.z & 65535, c.z >>> 16, c.zWeight],
  };
}
export function fractalNoiseColor(
  value: number,
  p: Params,
  rgb: readonly number[],
): number[] {
  const field = unit(
      (value / 65535 - 0.5) * scalar(p, "contrast") +
        0.5 +
        scalar(p, "brightness"),
    ),
    dark = p.dark as readonly number[],
    light = p.light as readonly number[],
    strength =
      scalar(p, "amount") * (dark[3]! + (light[3]! - dark[3]!) * field);
  return rgb.map((source, c) =>
    unit(
      source + (dark[c]! + (light[c]! - dark[c]!) * field - source) * strength,
    ),
  );
}
export const NOISE_FIELD_SHADER = FIELD_SHADER;
export const noiseFieldUniforms = uniforms;
export const TURBULENT_OFFSET_SHADER = `uniform float amountFixed;
int displacement(uint noise){int product=(int(noise)-32768)*int(amountFixed);bool negative=product<0;uint magnitude=uint(negative?-product:product);uint quotient=exactDivide(magnitude,65535u);uint remainder=magnitude-quotient*65535u;return negative?-int(quotient+(remainder>0u?1u:0u)):int(quotient);}
`;
const TURBULENT_SHADER = `${TURBULENT_OFFSET_SHADER}
void main(){uint seedValue=installedSeed();ivec2 delta=ivec2(displacement(fieldAt(gl_FragCoord.xy,seedValue)),displacement(fieldAt(gl_FragCoord.xy,seedValue^0x68bc21ebu)));vec2 point=vec2(ivec2(gl_FragCoord.xy*16.0)+delta)/16.0;pixel=sampleBytes(point)/255.0;}`;
const FRACTAL_SHADER = `uniform float contrast;uniform float brightness;uniform float amount;uniform vec4 dark;uniform vec4 light;
void main(){vec4 sourcePixel=texelFetch(source,ivec2(gl_FragCoord.xy),0),stored=floor(sourcePixel*255.0+0.5);vec3 rgb=stored.a>0.0?floor(stored.rgb*255.0/stored.a+0.5)/255.0:vec3(0.0);float value=clamp((float(fieldAt(gl_FragCoord.xy,installedSeed()))/65535.0-0.5)*contrast+0.5+brightness,0.0,1.0);vec4 color=mix(dark,light,value);vec3 result=mix(rgb,color.rgb,amount*color.a);vec3 outputBytes=floor(clamp(result,0.0,1.0)*255.0+0.5)/255.0;pixel=bytes(vec4(outputBytes*sourcePixel.a,sourcePixel.a));}`;
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function noiseEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["stylize.fractal-noise", "distort.turbulent"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!,
    turbulent = id === "distort.turbulent";
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const amount = scalar(params, "amount");
      if (amount === 0) return input;
      const controls = noiseControls(params),
        output = context.createSurface(input.width, input.height);
      context.pass(
        `${FIELD_SHADER}\n${turbulent ? PREMULTIPLIED_SAMPLE_SHADER + TURBULENT_SHADER : FRACTAL_SHADER}`,
        output,
        [input],
        {
          ...uniforms(controls),
          ...(turbulent
            ? { amountFixed: Math.round(amount * 16) }
            : {
                amount,
                contrast: scalar(params, "contrast"),
                brightness: scalar(params, "brightness"),
                dark: params.dark as readonly number[],
                light: params.light as readonly number[],
              }),
        },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const amount = scalar(params, "amount");
      if (amount === 0) return input;
      const controls = noiseControls(params),
        image = input.ctx.getImageData(0, 0, input.width, input.height),
        premultiplied = turbulent
          ? new Uint8Array(image.data.length)
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
      const sample = [0, 0, 0, 0],
        amountFixed = Math.round(amount * 16);
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const index = (y * input.width + x) * 4,
            value = noiseField(controls, x + 0.5, y + 0.5);
          if (premultiplied) {
            const dx = turbulentOffset(value, amountFixed),
              dy = turbulentOffset(
                noiseField(
                  controls,
                  x + 0.5,
                  y + 0.5,
                  (controls.seed ^ 0x68bc21eb) >>> 0,
                ),
                amountFixed,
              );
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              x + 0.5 + dx / 16,
              y + 0.5 + dy / 16,
              sample,
            );
            for (let c = 0; c < 3; c++)
              image.data[index + c] = sample[3]
                ? Math.round((sample[c]! * 255) / sample[3])
                : 0;
            image.data[index + 3] = sample[3]!;
          } else {
            const rgb = [0, 1, 2].map((c) =>
                colorEffectChannel(
                  image.data[index + c]!,
                  image.data[index + 3]!,
                ),
              ),
              output = fractalNoiseColor(value, params, rgb);
            for (let c = 0; c < 3; c++)
              image.data[index + c] = Math.round(output[c]! * 255);
          }
        }
      const output = context.createSurface(input.width, input.height);
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
