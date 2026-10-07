import {
  gradientControls,
  gradientRank,
  gradientUniforms,
  gradientColorTable,
  GRADIENT_RANK_SHADER,
} from "./gradient-controls.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { Rgba } from "../evaluate/types.ts";
import type { RenderEffect } from "./graph.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";

type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
const unit = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const n = (p: Params, key: string) => p[key] as number;
const v = (p: Params, key: string) => p[key] as readonly number[];
function hueSaturation(rgb: readonly number[], p: Params): number[] {
  const maximum = Math.max(...rgb),
    minimum = Math.min(...rgb),
    chroma = maximum - minimum;
  let light = (maximum + minimum) / 2;
  let saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
  let hue =
    chroma === 0
      ? 0
      : maximum === rgb[0]
        ? ((rgb[1]! - rgb[2]!) / chroma) % 6
        : maximum === rgb[1]
          ? (rgb[2]! - rgb[0]!) / chroma + 2
          : (rgb[0]! - rgb[1]!) / chroma + 4;
  hue = (((hue / 6 + n(p, "hue") / 360) % 1) + 1) % 1;
  saturation = unit(saturation * (1 + n(p, "saturation") / 100));
  const change = n(p, "lightness") / 100;
  light = unit(light + (change >= 0 ? 1 - light : light) * change);
  const outputChroma = (1 - Math.abs(2 * light - 1)) * saturation;
  return [0, 4, 2].map(
    (offset) =>
      unit(Math.abs(((hue * 6 + offset) % 6) - 3) - 1) * outputChroma +
      light -
      outputChroma / 2,
  );
}
/** Recover stored premultiplied bytes, then round straight channels with explicit half-up ties.
 * Canvas readback uses platform unpremultiplication rounding at half-byte boundaries.
 */
export function colorEffectChannel(channel: number, alpha: number): number {
  return alpha
    ? Math.floor((Math.round((channel * alpha) / 255) * 255) / alpha + 0.5) /
        255
    : 0;
}

/** Straight normalized sRGB reference, independent of Canvas raster operations. */
export function colorEffectPixel(
  id: string,
  pixel: Rgba,
  p: Params,
  x: number,
  y: number,
): Rgba {
  const rgb = pixel.slice(0, 3);
  let output: number[];
  switch (id) {
    case "color.curves": {
      const points = p.curve as readonly (readonly number[])[];
      output = rgb.map((value) => {
        let mapped = points.at(-1)![1]!;
        for (let i = 1; i < points.length; i++) {
          const first = points[i - 1]!,
            last = points[i]!;
          if (value <= last[0]!) {
            mapped = mix(
              first[1]!,
              last[1]!,
              unit((value - first[0]!) / (last[0]! - first[0]!)),
            );
            break;
          }
        }
        return mix(value, mapped, n(p, "amount"));
      });
      break;
    }
    case "color.levels": {
      const black = n(p, "inputBlack"),
        span = n(p, "inputWhite") - black;
      output = rgb.map((value) =>
        mix(
          n(p, "outputBlack"),
          n(p, "outputWhite"),
          Math.pow(
            Math.abs(span) < 1e-7
              ? value >= black
                ? 1
                : 0
              : unit((value - black) / span),
            1 / n(p, "gamma"),
          ),
        ),
      );
      break;
    }
    case "color.tint": {
      const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      const black = v(p, "black"),
        white = v(p, "white"),
        strength = n(p, "amount") * mix(black[3]!, white[3]!, luminance);
      output = rgb.map((value, c) =>
        mix(value, mix(black[c]!, white[c]!, luminance), strength),
      );
      break;
    }
    case "color.hue-saturation":
      output = hueSaturation(rgb, p);
      break;
    case "color.exposure":
      output = rgb.map((value) =>
        Math.pow(
          unit(value * 2 ** n(p, "exposure") + n(p, "offset")),
          1 / n(p, "gamma"),
        ),
      );
      break;
    case "color.brightness-contrast": {
      const contrast = n(p, "contrast"),
        factor =
          contrast >= 0 ? 1 / Math.max(0.001, 1 - contrast) : 1 + contrast;
      output = rgb.map(
        (value) => (value - 0.5) * factor + 0.5 + n(p, "brightness"),
      );
      break;
    }
    case "color.fill":
      output = rgb.map((value, c) =>
        mix(value, v(p, "color")[c]!, n(p, "amount") * v(p, "color")[3]!),
      );
      break;
    case "color.gradient-ramp": {
      const start = v(p, "start"),
        end = v(p, "end"),
        dx = end[0]! - start[0]!,
        dy = end[1]! - start[1]!,
        length = dx * dx + dy * dy;
      const t =
        length === 0
          ? 0
          : unit(((x - start[0]!) * dx + (y - start[1]!) * dy) / length);
      const first = v(p, "startColor"),
        last = v(p, "endColor"),
        strength = n(p, "amount") * mix(first[3]!, last[3]!, t);
      output = rgb.map((value, c) =>
        mix(value, mix(first[c]!, last[c]!, t), strength),
      );
      break;
    }
    case "color.invert":
      output = rgb.map((value) => mix(value, 1 - value, n(p, "amount")));
      break;
    case "color.posterize":
      output = rgb.map(
        (value) =>
          Math.floor(value * (n(p, "levels") - 1) + 0.5) / (n(p, "levels") - 1),
      );
      break;
    default:
      throw Error(`comp-effect-unavailable: unknown color kernel ${id}`);
  }
  return [...output.map(unit), pixel[3]] as Rgba;
}
const HSL = `
vec3 adjustHsl(vec3 rgb) {
  float maximum=max(max(rgb.r,rgb.g),rgb.b),minimum=min(min(rgb.r,rgb.g),rgb.b),chroma=maximum-minimum;
  float light=(maximum+minimum)*0.5;
  float sat=chroma==0.0?0.0:chroma/(1.0-abs(2.0*light-1.0));
  float h=chroma==0.0?0.0:maximum==rgb.r?(rgb.g-rgb.b)/chroma:maximum==rgb.g?(rgb.b-rgb.r)/chroma+2.0:(rgb.r-rgb.g)/chroma+4.0;
  h=mod(h/6.0+hue/360.0,1.0);
  sat=clamp(sat*(1.0+saturation/100.0),0.0,1.0);
  float change=lightness/100.0;
  light=clamp(light+(change>=0.0?1.0-light:light)*change,0.0,1.0);
  float c=(1.0-abs(2.0*light-1.0))*sat;
  return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0)*c+light-c*0.5;
}`;
const fragments: Readonly<Record<string, string>> = {
  "color.curves": `result=vec3(
    texelFetch(backdrop,ivec2(int(floor(rgb.r*255.0+0.5)),0),0).r,
    texelFetch(backdrop,ivec2(int(floor(rgb.g*255.0+0.5)),0),0).r,
    texelFetch(backdrop,ivec2(int(floor(rgb.b*255.0+0.5)),0),0).r);`,
  "color.levels": `float span=inputWhite-inputBlack; vec3 corrected;
    if(abs(span)<1e-7) corrected=step(vec3(inputBlack),rgb);
    else corrected=clamp((rgb-inputBlack)/span,0.0,1.0);
    result=mix(vec3(outputBlack),vec3(outputWhite),pow(corrected,vec3(1.0/gamma)));`,
  "color.tint": `float l=dot(rgb,vec3(0.2126,0.7152,0.0722));result=mix(rgb,mix(black.rgb,white.rgb,l),amount*mix(black.a,white.a,l));`,
  "color.hue-saturation": `result=adjustHsl(rgb);`,
  "color.exposure": `result=pow(clamp(rgb*exp2(exposure)+offset,0.0,1.0),vec3(1.0/gamma));`,
  "color.brightness-contrast": `float factor=contrast>=0.0?1.0/max(0.001,1.0-contrast):1.0+contrast;result=(rgb-0.5)*factor+0.5+brightness;`,
  "color.fill": `result=mix(rgb,color.rgb,amount*color.a);`,
  "color.gradient-ramp": `int rank=gradientRank(gl_FragCoord.xy);vec4 ramp=texelFetch(backdrop,ivec2(rank&255,rank>>8),0);result=mix(rgb,ramp.rgb,amount*ramp.a);`,
  "color.invert": `result=mix(rgb,1.0-rgb,amount);`,
  "color.posterize": `result=floor(rgb*(levels-1.0)+0.5)/(levels-1.0);`,
};
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function colorEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!Object.hasOwn(fragments, id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  const declarations = Object.entries(definition.properties)
    .filter(([, property]) => property.type !== "curve")
    .map(
      ([key, property]) =>
        `uniform ${property.type === "scalar" ? "float" : property.type === "vec2" ? "vec2" : "vec4"} ${key};`,
    )
    .join("\n");
  const shader = `${id === "color.gradient-ramp" ? GRADIENT_RANK_SHADER : ""}\n${declarations}\n${id === "color.hue-saturation" ? HSL : ""}\nvoid main(){
    vec4 sourcePixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);
    vec4 stored=floor(sourcePixel*255.0+0.5);
    vec3 rgb=stored.a>0.0?floor(stored.rgb*255.0/stored.a+0.5)/255.0:vec3(0.0), result;
    ${fragments[id]}
    vec3 outputRgbBytes=floor(clamp(result,0.0,1.0)*255.0+0.5)/255.0;
    pixel=bytes(vec4(outputRgbBytes*sourcePixel.a,sourcePixel.a));
  }`;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const uniforms = Object.fromEntries(
        Object.entries(params).filter(
          ([name]) => definition.properties[name]!.type !== "curve",
        ),
      ) as Record<string, number | readonly number[]>;
      if (id === "color.gradient-ramp") {
        const transfer = context.createSurface(256, 256);
        context.uploadBytes(transfer, gradientColorTable(params));
        context.pass(shader, output, [input, transfer], {
          ...uniforms,
          ...gradientUniforms(gradientControls(params)),
        });
      } else if (id === "color.curves") {
        // A 256-entry transfer is control data; all image pixels are transformed on the GPU.
        const bytes = new Uint8Array(256 * 4);
        for (let value = 0; value < 256; value++) {
          const mapped = colorEffectPixel(
            id,
            [value / 255, value / 255, value / 255, 1],
            params,
            0,
            0,
          )[0];
          bytes[value * 4] = Math.round(mapped * 255);
          bytes[value * 4 + 3] = 255;
        }
        const transfer = context.createSurface(256, 1);
        context.uploadBytes(transfer, bytes);
        context.pass(shader, output, [input, transfer], uniforms);
      } else context.pass(shader, output, [input], uniforms);
      return output;
    },
    renderCanvas(context, input, params: RenderEffect["params"]) {
      const output = context.createSurface(input.width, input.height);
      const image = input.ctx.getImageData(0, 0, input.width, input.height);
      const gradient =
          id === "color.gradient-ramp" ? gradientControls(params) : undefined,
        table = gradient ? gradientColorTable(params) : undefined;
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const i = (y * input.width + x) * 4;
          const source: Rgba = [
            colorEffectChannel(image.data[i]!, image.data[i + 3]!),
            colorEffectChannel(image.data[i + 1]!, image.data[i + 3]!),
            colorEffectChannel(image.data[i + 2]!, image.data[i + 3]!),
            image.data[i + 3]! / 255,
          ];
          let result: Rgba;
          if (gradient && table) {
            const index = gradientRank(gradient, x + 0.5, y + 0.5) * 4,
              strength = ((params.amount as number) * table[index + 3]!) / 255;
            result = [0, 1, 2]
              .map((c) =>
                unit(
                  source[c]! +
                    (table[index + c]! / 255 - source[c]!) * strength,
                ),
              )
              .concat(source[3]) as Rgba;
          } else
            result = colorEffectPixel(id, source, params, x + 0.5, y + 0.5);
          for (let channel = 0; channel < 4; channel++)
            image.data[i + channel] = Math.round(result[channel]! * 255);
        }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
