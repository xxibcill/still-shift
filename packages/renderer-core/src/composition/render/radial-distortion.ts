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
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
export type RadialControls = {
  bulge: boolean;
  center: readonly [number, number];
  radius: readonly [number, number];
  factors: Int32Array<ArrayBuffer>;
};
/** Control-only radial factors in 1/4096 units; center and radii in 1/16 pixels. */
export function radialDistortionControls(
  id: string,
  p: Params,
  w: number,
  h: number,
): RadialControls {
  const point = p.center as readonly number[],
    bulge = id === "distort.bulge",
    radius = p.radius as readonly number[] | undefined;
  const factors = new Int32Array(
    bulge ? 65537 : Math.ceil(Math.hypot(w, h) * 16) + 1,
  );
  for (let i = 0; i < factors.length; i++) {
    if (bulge) {
      const shoulder = 1 - i / 65536;
      factors[i] = Math.round(
        4096 * (1 - (p.amount as number) * shoulder * shoulder),
      );
    } else {
      const r = i / 16;
      factors[i] =
        r === 0
          ? 4096
          : Math.round(
              4096 *
                (1 +
                  ((p.amplitude as number) *
                    Math.sin(
                      (2 * Math.PI * r) / (p.wavelength as number) +
                        ((p.phase as number) * Math.PI) / 180,
                    ) *
                    Math.exp((-(p.decay as number) * r) / Math.max(w, h))) /
                    r),
            );
    }
  }
  return {
    bulge,
    center: [Math.round(point[0]! * w * 16), Math.round(point[1]! * h * 16)],
    radius: radius
      ? [Math.round(radius[0]! * 16), Math.round(radius[1]! * 16)]
      : [1, 1],
    factors,
  };
}
export function radialFactorIndex(
  c: RadialControls,
  dx: number,
  dy: number,
): number {
  if (!c.bulge) return Math.floor(Math.sqrt(dx * dx + dy * dy));
  const x = Math.floor((Math.abs(dx) * 256) / c.radius[0]),
    y = Math.floor((Math.abs(dy) * 256) / c.radius[1]);
  if (x >= 256 || y >= 256) return -1;
  const squared = x * x + y * y;
  return squared >= 65536 ? -1 : squared;
}
export function radialSourcePoint(
  c: RadialControls,
  x: number,
  y: number,
): readonly [number, number] {
  const dx = Math.round(x * 16) - c.center[0],
    dy = Math.round(y * 16) - c.center[1],
    index = radialFactorIndex(c, dx, dy),
    factor = index < 0 ? 4096 : c.factors[index]!;
  return [
    (c.center[0] + Math.floor((dx * factor) / 4096)) / 16,
    (c.center[1] + Math.floor((dy * factor) / 4096)) / 16,
  ];
}
/** Exact square words and corrected root, including 8192-pixel diagonal coordinates. */
export const RADIAL_INTEGER_SHADER = `
uniform vec2 centerFixed;uniform vec2 radiusFixed;uniform float bulge;
uint divideExact(uint n,uint d){uint q=uint(floor(float(n)/float(d)));if(q*d>n)q--;if((q+1u)*d<=n)q++;return q;}
uvec2 squareWords(uint n){uint low=n&65535u,high=n>>16u,cross=2u*low*high,a=low*low,b=cross<<16u,result=a+b;return uvec2(result,high*high+(cross>>16u)+(result<a?1u:0u));}
uvec2 addWords(uvec2 a,uvec2 b){uint low=a.x+b.x;return uvec2(low,a.y+b.y+(low<a.x?1u:0u));}
bool greaterWords(uvec2 a,uvec2 b){return a.y>b.y||(a.y==b.y&&a.x>b.x);}
uint radialRoot(ivec2 delta){uvec2 square=addWords(squareWords(uint(abs(delta.x))),squareWords(uint(abs(delta.y))));uint root=uint(floor(sqrt(float(square.x)+float(square.y)*4294967296.0)));if(greaterWords(squareWords(root),square))root--;if(!greaterWords(squareWords(root+1u),square))root++;return root;}
int factorIndex(ivec2 delta){if(bulge==0.0)return int(radialRoot(delta));uvec2 relative=uvec2(divideExact(uint(abs(delta.x))*256u,uint(radiusFixed.x)),divideExact(uint(abs(delta.y))*256u,uint(radiusFixed.y)));if(any(greaterThanEqual(relative,uvec2(256u))))return -1;uint squared=relative.x*relative.x+relative.y*relative.y;return squared>=65536u?-1:int(squared);}
int factorAt(int index){if(index<0)return 4096;uvec4 code=uvec4(floor(texelFetch(backdrop,ivec2(index&255,index>>8),0)*255.0+0.5));return int(code.r|(code.g<<8u)|(code.b<<16u)|(code.a<<24u));}
int scaledDelta(int delta,int factor){int product=delta*factor;uint magnitude=uint(abs(product)),quotient=magnitude>>12u;return product<0?-int(quotient+((magnitude&4095u)>0u?1u:0u)):int(quotient);}
vec2 radialSource(ivec2 point){ivec2 center=ivec2(centerFixed),delta=point-center;int factor=factorAt(factorIndex(delta));return vec2(center+ivec2(scaledDelta(delta.x,factor),scaledDelta(delta.y,factor)))/16.0;}
`;
export function radialControlBytes(c: RadialControls): Uint8Array<ArrayBuffer> {
  const bytes = allocateRenderPixels(
    256 * Math.ceil(c.factors.length / 256) * 4 * 1,
    () => new Uint8Array(256 * Math.ceil(c.factors.length / 256) * 4),
  );
  for (let i = 0; i < c.factors.length; i++) {
    const value = c.factors[i]!;
    bytes[i * 4] = value & 255;
    bytes[i * 4 + 1] = (value >>> 8) & 255;
    bytes[i * 4 + 2] = (value >>> 16) & 255;
    bytes[i * 4 + 3] = value >>> 24;
  }
  return bytes;
}
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function radialDistortionKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["distort.bulge", "distort.ripple"].includes(id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const neutral = (p: Params) =>
    (p[id === "distort.bulge" ? "amount" : "amplitude"] as number) === 0;
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      if (neutral(params)) return input;
      const controls = radialDistortionControls(
          id,
          params,
          input.width,
          input.height,
        ),
        data = radialControlBytes(controls),
        table = context.createSurface(256, data.length / 1024),
        output = context.createSurface(input.width, input.height);
      context.uploadBytes(table, data);
      context.pass(
        `${RADIAL_INTEGER_SHADER}\n${PREMULTIPLIED_SAMPLE_SHADER}\nvoid main(){pixel=sampleBytes(radialSource(ivec2(gl_FragCoord.xy*16.0)))/255.0;}`,
        output,
        [input, table],
        {
          centerFixed: controls.center,
          radiusFixed: controls.radius,
          bulge: controls.bulge ? 1 : 0,
        },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      if (neutral(params)) return input;
      const controls = radialDistortionControls(
          id,
          params,
          input.width,
          input.height,
        ),
        image = readRenderImageData(input.ctx, 0, 0, input.width, input.height),
        premultiplied = allocateRenderPixels(
          image.data.length * 1,
          () => new Uint8Array(image.data.length),
        );
      for (let i = 0; i < image.data.length; i += 4) {
        const a = image.data[i + 3]!;
        for (let c = 0; c < 3; c++)
          premultiplied[i + c] = Math.round((image.data[i + c]! * a) / 255);
        premultiplied[i + 3] = a;
      }
      const sample = [0, 0, 0, 0];
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const point = radialSourcePoint(controls, x + 0.5, y + 0.5);
          samplePremultiplied(
            premultiplied,
            input.width,
            input.height,
            point[0],
            point[1],
            sample,
          );
          const i = (y * input.width + x) * 4;
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
