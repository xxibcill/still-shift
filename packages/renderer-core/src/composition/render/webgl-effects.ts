import { paintRisingParticles } from "../../pixel-generators.ts";
import { cssColor, type Canvas2dBackend } from "./canvas2d.ts";
import type { Rgba } from "../evaluate/types.ts";
import type { RenderEffect } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { blendShader } from "./webgl-blend.ts";

type Kernel = { radius: number; weights: number[]; divisor: number };
/** Three centered box filters for Skia's raster Gaussian approximation. */
function blurKernel(sigma: number): Kernel {
  const width = Math.max(
    1,
    Math.floor((Math.fround(sigma) * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5),
  );
  const lengths =
    width < 255
      ? [width, width, width + (width % 2 === 0 ? 1 : 0)]
      : [Math.floor((width * 3) / 2), Math.floor((width * 3) / 2)];
  const length = lengths.reduce((a, b) => a + b, 0) - lengths.length + 1;
  const divisor = lengths.reduce((a, b) => a * b, 1);
  const weights = Array.from({ length }, (_, position) => {
    let count = 0;
    for (let mask = 0; mask < 1 << lengths.length; mask++) {
      let remaining = position,
        sign = 1;
      for (let axis = 0; axis < lengths.length; axis++)
        if (mask & (1 << axis)) {
          remaining -= lengths[axis]!;
          sign = -sign;
        }
      if (remaining >= 0)
        count +=
          sign *
          (lengths.length === 3
            ? ((remaining + 1) * (remaining + 2)) / 2
            : remaining + 1);
    }
    return count;
  });
  return { radius: (length - 1) / 2, weights, divisor };
}

const SAMPLE = `
vec2 pixelTranslation(vec2 offset) {
  vec2 integral=floor(offset+0.5);
  return all(lessThan(abs(offset-integral),vec2(1.0/256.0))) ? integral : offset;
}

vec4 atPixel(ivec2 p) {
  ivec2 size = textureSize(source, 0);
  return any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,size)) ? vec4(0.0) : texelFetch(source,p,0);
}
vec4 bilinear(vec2 p) {
  vec2 base=floor(p-0.5), f=floor(fract(p-0.5)*16.0)/16.0;
  vec4 top=mix(floor(atPixel(ivec2(base))*255.0+0.5),floor(atPixel(ivec2(base)+ivec2(1,0))*255.0+0.5),f.x);
  vec4 bottom=mix(floor(atPixel(ivec2(base)+ivec2(0,1))*255.0+0.5),floor(atPixel(ivec2(base)+ivec2(1,1))*255.0+0.5),f.x);
  return floor(mix(top,bottom,f.y))/255.0;
}
`;

export class WebglEffects {
  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
  ) {}

  private paint(
    dst: WebglSurface,
    draw: (ctx: CanvasRenderingContext2D) => void,
    shader = blendShader("normal"),
    opacity = 1,
  ) {
    const pixels = this.raster.createSurface(dst.width, dst.height);
    const source = this.device.surface(dst.width, dst.height);
    try {
      pixels.ctx.save();
      try {
        draw(pixels.ctx);
      } finally {
        pixels.ctx.restore();
      }
      this.device.upload(source, pixels.canvas);
      this.replace(dst, shader, [source, dst], { opacity });
    } finally {
      this.raster.releaseSurface(pixels);
      this.device.release(source);
    }
  }

  private replace(
    dst: WebglSurface,
    shader: string,
    inputs: WebglSurface[],
    uniforms: Parameters<WebglDevice["pass"]>[3] = {},
  ) {
    const output = this.device.surface(
      dst.width,
      dst.height,
      false,
      dst.opaque,
    );
    try {
      this.device.pass(shader, output, inputs, uniforms);
      this.device.swap(dst, output);
    } finally {
      this.device.release(output);
    }
  }

  blur(dst: WebglSurface, sigma: number) {
    if (sigma <= 0.03) return;
    const kernel = blurKernel(sigma);
    if (kernel.divisor === 1) return;
    // Match the raster Gaussian's integer reciprocal division after each axis.
    // Floating normalization accumulates visible errors in chained filters.
    const factor = Math.round(4294967296 / kernel.divisor);
    const source = this.device.surface(kernel.weights.length, 1, true);
    const scratch = this.device.surface(dst.width, dst.height);
    try {
      this.device.uploadFloats(
        source,
        new Float32Array(kernel.weights.flatMap((w) => [w, 0, 0, 1])),
      );
      const shader = `${SAMPLE}
      uniform float radius;
      uniform float halfDivisor;
      uniform vec2 factorParts;
      uniform vec2 direction;
      uint multiplyHigh(uint a, uint b) {
        uint a0=a&65535u,a1=a>>16,b0=b&65535u,b1=b>>16;
        uint low=a0*b0, middle=a1*b0+(low>>16);
        uint carry=middle>>16;
        middle=(middle&65535u)+a0*b1;
        return a1*b1+carry+(middle>>16);
      }
      void main() {
        uvec4 sum=uvec4(uint(halfDivisor));
        ivec2 p=ivec2(gl_FragCoord.xy);
        for(int index=0;index<8192;index++) {
          if(index>=textureSize(backdrop,0).x) break;
          uint weight=uint(texelFetch(backdrop,ivec2(index,0),0).r);
          sum += uvec4(floor(atPixel(p+ivec2(direction*(float(index)-radius)))*255.0+0.5)) * weight;
        }
        uint factor=uint(factorParts.x)+(uint(factorParts.y)<<16);
        pixel=vec4(multiplyHigh(sum.r,factor),multiplyHigh(sum.g,factor),multiplyHigh(sum.b,factor),multiplyHigh(sum.a,factor))/255.0;
      }`;
      this.device.pass(shader, scratch, [dst, source], {
        halfDivisor: Math.floor((kernel.divisor + 1) / 2),
        factorParts: [factor & 65535, factor >>> 16],
        radius: kernel.radius,
        direction: [1, 0],
      });
      this.device.pass(shader, dst, [scratch, source], {
        halfDivisor: Math.floor((kernel.divisor + 1) / 2),
        factorParts: [factor & 65535, factor >>> 16],
        radius: kernel.radius,
        direction: [0, 1],
      });
    } finally {
      this.device.release(source);
      this.device.release(scratch);
    }
  }

  apply(dst: WebglSurface, effects: RenderEffect[]) {
    for (const effect of effects) {
      if (!effect.enabled) continue;
      const p = effect.params;
      switch (effect.effect) {
        case "light.radial": {
          // Skia dithers the premultiplied gradient before source-over and clips
          // its RGB to source alpha. Preserve that order at the radial boundary.
          this.replace(
            dst,
            `uniform vec2 center; uniform float radius; uniform float strength; uniform vec4 color;
          void main() {
            float a=clamp(1.0-distance(gl_FragCoord.xy,center)/radius,0.0,1.0)*color.a*strength;
            vec4 result=vec4(color.rgb*a,a);
            uint x=uint(gl_FragCoord.x), y=uint(gl_FragCoord.y)^x;
            uint matrix=((y&1u)<<5)|((x&1u)<<4)|((y&2u)<<2)|((x&2u)<<1)|((y&4u)>>1)|((x&4u)>>2);
            float dither=(float(matrix)/64.0-63.0/128.0)/255.0;
            result.rgb=clamp(result.rgb+dither,vec3(0.0),vec3(result.a));
            pixel=bytes(result+texture(source,uv)*(1.0-a));
          }`,
            [dst],
            {
              center: [p.x as number, p.y as number],
              radius: p.radius as number,
              strength: p.strength as number,
              color: (p.color as Rgba).map(
                (value) => Math.round(value * 255) / 255,
              ),
            },
          );
          break;
        }
        case "particles.rise": {
          this.paint(
            dst,
            (ctx) =>
              paintRisingParticles(
                ctx,
                {
                  progress: p.progress as number,
                  count: p.count as number,
                  radius: p.radius as number,
                  opacity: p.opacity as number,
                  seed: p.seed as number,
                  color: cssColor(p.color as Rgba),
                },
                dst.width,
                dst.height,
              ),
            blendShader("normal", true),
          );
          break;
        }
        case "stylize.grain": {
          const seed =
            ((p.seed as number) + Math.floor(p.evolution as number) * 7919) >>>
            0;
          this.replace(
            dst,
            `uniform vec2 seedParts; uniform float amount;
          uint advance(uint state,uint count) {
            uint a=1664525u,c=1013904223u,m=1u,b=0u;
            for(int i=0;i<16;i++) {
              if((count&1u)!=0u) {m*=a;b=b*a+c;}
              c*=a+1u; a*=a; count>>=1;
            }
            return state*m+b;
          }
          void main() {
            uvec2 p=uvec2(gl_FragCoord.xy)%128u;
            uint seed=uint(seedParts.x)+(uint(seedParts.y)<<16);
            uint value=advance(seed,(p.y*128u+p.x)*2u+1u);
            float color=value<2147483648u?0.0:1.0;
            uint next=value*1664525u+1013904223u;
            float a=floor(float(next)*(1.0/4294967296.0)*amount*255.0+0.5)/255.0;
            pixel=bytes(vec4(vec3(color*a),a)+texture(source,uv)*(1.0-a));
          }`,
            [dst],
            {
              seedParts: [seed & 65535, seed >>> 16],
              amount: p.amount as number,
            },
          );
          break;
        }
        case "light.sweep": {
          if (!effect.placement)
            throw new Error(
              "comp-effect-space: light.sweep requires layer coordinates",
            );
          const placement = effect.placement;
          this.paint(
            dst,
            (ctx) => {
              if (placement.transforms)
                for (const matrix of placement.transforms)
                  ctx.transform(...matrix);
              else ctx.transform(...placement.matrix);
              const width = p.width as number,
                height = p.height as number,
                left = p.left as number,
                top = p.top as number;
              const regionWidth = p.regionWidth as number,
                regionHeight = p.regionHeight as number,
                band = p.band as number;
              ctx.beginPath();
              ctx.rect(
                left * width,
                top * height,
                regionWidth * width,
                regionHeight * height,
              );
              ctx.clip();
              const center =
                  (left -
                    band +
                    (regionWidth + band * 2) * (p.progress as number)) *
                  width,
                radius = band * width;
              const gradient = ctx.createLinearGradient(
                center - radius,
                0,
                center + radius,
                0,
              );
              gradient.addColorStop(0, "#FFFFFF00");
              gradient.addColorStop(0.5, "#FFFFFF");
              gradient.addColorStop(1, "#FFFFFF00");
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, width, height);
            },
            `uniform float opacity; void main() {
            vec4 dst=texture(backdrop,uv), light=bytes(texture(source,uv)*dst.a);
            light=bytes(light*opacity);
            pixel=bytes(vec4(light.rgb*dst.a+dst.rgb*(1.0-light.a),dst.a));
          }`,
            p.strength as number,
          );
          break;
        }
        case "blur.gaussian":
          this.blur(dst, p.radius as number);
          break;
        case "blur.directional": {
          if (!p.length) break;
          this.replace(
            dst,
            `${SAMPLE}
          uniform float length; uniform vec2 direction; uniform float samples;
          void main() {
            vec4 sum=vec4(0.0);
            for(int i=0;i<64;i++) {
              if(float(i)>=samples) break;
              float distance=((float(i)+0.5)/samples-0.5)*length;
              vec4 value=bilinear(gl_FragCoord.xy-pixelTranslation(direction*distance));
              vec3 rgb=value.a>0.0?bytes(vec4(value.rgb/value.a,1.0)).rgb:vec3(0.0);
              sum += vec4(rgb*value.a,value.a);
            }
            float alpha=floor(sum.a/samples*255.0+0.5)/255.0;
            pixel=bytes(vec4(sum.a>0.0?bytes(vec4(sum.rgb/sum.a,1.0)).rgb*alpha:vec3(0.0),alpha));
          }`,
            [dst],
            {
              length: p.length as number,
              direction: [
                Math.cos(((p.angle as number) * Math.PI) / 180),
                Math.sin(((p.angle as number) * Math.PI) / 180),
              ],
              samples: p.samples as number,
            },
          );
          break;
        }
        case "distort.sine": {
          if (!p.amount) break;
          // Offsets are scalar control data, computed with the same Math.sin as
          // authored motion. SwiftShader's approximate sin can cross a 1/16-pixel
          // sampling boundary even when the source double is on the other side.
          const offsets = this.device.surface(1, dst.height, true);
          const values = new Float32Array(dst.height * 4);
          for (let y = 0; y < dst.height; y++)
            values[y * 4] =
              Math.sin(
                (y / (p.wavelength as number)) * Math.PI * 2 +
                  (p.phase as number),
              ) * (p.amount as number);
          try {
            this.device.uploadFloats(offsets, values);
            this.replace(
              dst,
              `${SAMPLE}
            void main() {
              float shift=texelFetch(backdrop,ivec2(0,int(gl_FragCoord.y)),0).r;
              pixel=bilinear(gl_FragCoord.xy-pixelTranslation(vec2(shift,0.0)));
            }`,
              [dst, offsets],
            );
          } finally {
            this.device.release(offsets);
          }
          break;
        }
        case "light.glow": {
          if (!p.radius || !p.intensity) break;
          const glow = this.device.surface(dst.width, dst.height);
          try {
            this.device.pass(
              `uniform float threshold;
            void main() {
              vec4 value=texture(source,uv);
              vec3 rgb=value.a>0.0?bytes(vec4(value.rgb/value.a,1.0)).rgb:vec3(0.0);
              float luminance=dot(rgb,vec3(0.2126,0.7152,0.0722));
              float alpha=floor(value.a * max(0.0,(luminance-threshold)/max(0.001,1.0-threshold))*255.0+0.5)/255.0;
              pixel=bytes(vec4(rgb*alpha,alpha));
            }`,
              glow,
              [dst],
              { threshold: p.threshold as number },
            );
            this.blur(glow, p.radius as number);
            this.replace(dst, blendShader("screen"), [glow, dst], {
              opacity: p.intensity as number,
            });
          } finally {
            this.device.release(glow);
          }
          break;
        }
        default:
          throw new Error(
            `comp-webgl-effect: ${effect.effect} is not implemented`,
          );
      }
    }
  }
}
