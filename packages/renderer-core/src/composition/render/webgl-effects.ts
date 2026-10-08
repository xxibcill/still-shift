import {
  allocateRenderPixels,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import { renderGpuEffect } from "./effect-plugins.ts";
import { FLOAT32_RATIONAL_SUM } from "./webgl-float-sum.ts";
import { blurKernel } from "./webgl-blur-kernel.ts";
import { boxBlur } from "./webgl-box-blur.ts";
import { rescaledGaussianBlur } from "./webgl-blur-rescale.ts";
import type { WebglBounds } from "./webgl-bounds.ts";
import {
  paintRisingParticles,
  risingParticles,
} from "../../pixel-generators.ts";
import { WebglPaint } from "./webgl-paint.ts";
import { cssColor, type Canvas2dBackend } from "./canvas2d.ts";
import type { Bounds, Rgba } from "../evaluate/types.ts";
import type { RenderEffect } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { blendShader } from "./webgl-blend.ts";

type GaussianLifetime = {
  managed: boolean;
  owned: WebglSurface[];
  weights: number[];
  parts: number[][];
  arrays: number[][];
  inputs: WebglSurface[][];
  uniforms: Record<string, number | number[]>[];
  shader: string;
  values?: Float32Array | undefined;
};
function clearGaussianWeights(value: GaussianLifetime) {
  value.weights.length = 0;
  for (const part of value.parts) part.length = 0;
  value.parts.length = 0;
}
function clearGaussianLifetime(value: GaussianLifetime) {
  clearGaussianWeights(value);
  for (const array of value.arrays) array.length = 0;
  for (const inputs of value.inputs) inputs.length = 0;
  for (const uniforms of value.uniforms)
    for (const name in uniforms) delete uniforms[name];
  value.arrays.length =
    value.inputs.length =
    value.uniforms.length =
    value.owned.length =
      0;
  value.shader = "";
  value.values = undefined;
}
function gaussianArray(phase: GaussianLifetime, value: number[]) {
  phase.arrays.push(value);
  return value;
}
function gaussianInputs(phase: GaussianLifetime, value: WebglSurface[]) {
  phase.inputs.push(value);
  return value;
}
function gaussianUniforms(
  phase: GaussianLifetime,
  value: Record<string, number | number[]>,
) {
  phase.uniforms.push(value);
  return value;
}
function releaseGaussianSurfaces(device: WebglDevice, phase: GaussianLifetime) {
  let failed = false;
  let first: unknown;
  for (const surface of phase.owned) {
    try {
      device.release(surface);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  }
  phase.owned.length = 0;
  if (failed) throw first;
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
vec4 translated(vec2 offset) {
  offset=pixelTranslation(offset);
  float start=max(0.0,floor(offset.x+0.5));
  float span=start+floor((floor(gl_FragCoord.x)-start)/127.0)*127.0;
  // Canvas starts each fixed-step bitmap span with a float32 mapping. Mapping
  // every pixel separately can round across a 1/16-pixel filter boundary.
  vec2 initial=vec2(span+0.5,gl_FragCoord.y)-offset-0.5;
  vec2 base=floor(initial)+vec2(floor(gl_FragCoord.x)-span,0.0);
  vec2 fraction=fract(initial), p=gl_FragCoord.xy-offset;
  ivec2 size=textureSize(source,0);
  // Canvas clips translated image rectangles at pixel centers, then clamps
  // filtering to the source edge rather than mixing with transparent texels.
  if(any(lessThan(p,vec2(0.0))) || any(greaterThanEqual(p,vec2(size)))) return vec4(0.0);
  vec2 f=floor(fraction*16.0)/16.0;
  ivec2 first=clamp(ivec2(base),ivec2(0),size-1), last=clamp(ivec2(base)+1,ivec2(0),size-1);
  vec4 top=mix(floor(atPixel(first)*255.0+0.5),floor(atPixel(ivec2(last.x,first.y))*255.0+0.5),f.x);
  vec4 bottom=mix(floor(atPixel(ivec2(first.x,last.y))*255.0+0.5),floor(atPixel(last)*255.0+0.5),f.x);
  return floor(mix(top,bottom,f.y))/255.0;
}
`;

// Sine displacement never changes the source row. Preserve the same bitmap
// spans and byte rounding without fetching a second pair of vertical samples.
const HORIZONTAL_SAMPLE = `
vec4 translatedX(float shift) {
  float integral=floor(shift+0.5);
  if(abs(shift-integral)<1.0/256.0) shift=integral;
  float start=max(0.0,floor(shift+0.5));
  float x=floor(gl_FragCoord.x);
  float span=start+floor((x-start)/127.0)*127.0;
  float initial=(span+0.5)-shift-0.5;
  int base=int(floor(initial)+x-span);
  ivec2 size=textureSize(source,0);
  float position=gl_FragCoord.x-shift;
  if(position<=0.0 || position>float(size.x)) return vec4(0.0);
  int y=int(gl_FragCoord.y);
  vec4 first=floor(texelFetch(source,ivec2(clamp(base,0,size.x-1),y),0)*255.0+0.5);
  vec4 last=floor(texelFetch(source,ivec2(clamp(base+1,0,size.x-1),y),0)*255.0+0.5);
  return floor(mix(first,last,floor(fract(initial)*16.0)/16.0))/255.0;
}
`;

export class WebglEffects {
  private readonly paints: WebglPaint;
  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
    private readonly bounds: WebglBounds,
  ) {
    this.paints = new WebglPaint(device, bounds);
  }

  /**
   * Transparent source pixels leave primitive source-over unchanged. Compose
   * each disjoint particle neighborhood instead of uploading and blending the
   * full canvas; merged rectangles keep every pixel composed at most once.
   */
  private particles(
    dst: WebglSurface,
    effect: Parameters<typeof paintRisingParticles>[1],
  ) {
    const rects: Bounds[] = [];
    for (const particle of risingParticles(effect, dst.width, dst.height)) {
      let rect = {
        left: Math.max(0, Math.floor(particle.x - particle.radius) - 2),
        top: Math.max(0, Math.floor(particle.y - particle.radius) - 2),
        right: Math.min(dst.width, Math.ceil(particle.x + particle.radius) + 2),
        bottom: Math.min(
          dst.height,
          Math.ceil(particle.y + particle.radius) + 2,
        ),
      };
      if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
      for (let i = 0; i < rects.length; ) {
        const other = rects[i]!;
        if (
          other.left < rect.right &&
          rect.left < other.right &&
          other.top < rect.bottom &&
          rect.top < other.bottom
        ) {
          rect = {
            left: Math.min(rect.left, other.left),
            top: Math.min(rect.top, other.top),
            right: Math.max(rect.right, other.right),
            bottom: Math.max(rect.bottom, other.bottom),
          };
          rects.splice(i, 1);
          i = 0;
        } else i++;
      }
      rects.push(rect);
    }
    const pixels = this.raster.createSurface(dst.width, dst.height);
    try {
      paintRisingParticles(pixels.ctx, effect, dst.width, dst.height);
      for (const rect of rects) {
        const source = this.device.surface(
          rect.right - rect.left,
          rect.bottom - rect.top,
        );
        try {
          this.device.uploadRegion(source, pixels.canvas, rect.left, rect.top);
          this.paints.draw(source, dst, rect, true);
        } finally {
          this.device.release(source);
        }
      }
    } finally {
      this.raster.releaseSurface(pixels);
    }
  }

  /** `painted` bounds every nonzero canvas pixel; the cleared source keeps the rest. */
  private paint(
    dst: WebglSurface,
    draw: (ctx: CanvasRenderingContext2D) => void,
    shader = blendShader("normal"),
    opacity = 1,
    region?: Bounds | null,
    painted?: Bounds,
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
      if (!painted) this.device.upload(source, pixels.canvas);
      else {
        const area = {
          left: Math.max(0, painted.left),
          top: Math.max(0, painted.top),
          right: Math.min(dst.width, painted.right),
          bottom: Math.min(dst.height, painted.bottom),
        };
        if (area.right > area.left && area.bottom > area.top)
          this.device.uploadArea(source, pixels.canvas, area);
      }
      this.replace(dst, shader, [source, dst], { opacity }, region);
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
    region?: Bounds | null,
  ) {
    if (dst.screen) {
      this.device.pass(shader, dst, inputs, uniforms, false, region);
      return;
    }
    const output = this.device.surface(
      dst.width,
      dst.height,
      false,
      dst.opaque,
    );
    try {
      this.device.pass(shader, output, inputs, uniforms, false, region);
      this.device.swap(dst, output);
    } finally {
      this.device.release(output);
    }
  }

  blur(dst: WebglSurface, sigma: number) {
    if (sigma <= 0.03 || this.bounds.region(dst) === null) return;
    if (
      rescaledGaussianBlur(this.device, dst, sigma, (surface, radius) =>
        this.blur(surface, radius),
      )
    ) {
      this.bounds.full(dst);
      return;
    }
    const kernel = blurKernel(sigma);
    try {
      if (kernel.divisor === 1) return;
      const region = this.bounds.region(dst);
      if (region === null) return;
      this.bounds.blur(dst, kernel.radius);
      const outputRegion = this.bounds.region(dst);
      if (boxBlur(this.device, dst, kernel, region)) return;
      // Match the raster Gaussian's integer reciprocal division after each axis.
      // Floating normalization accumulates visible errors in chained filters.
      const phase = allocateRenderMetadata<GaussianLifetime>(
        // Original temporary RGBA result/part arrays and pointer capacity per
        // weight; fixed original shader/vectors/uniforms/native references/controls.
        16384 + 160 * kernel.weights.length,
        () => ({
          managed: renderMemory() !== undefined,
          owned: [],
          weights: [],
          parts: [],
          arrays: [],
          inputs: [],
          uniforms: [],
          shader: "",
        }),
        false,
        clearGaussianLifetime,
      );
      let cleaned = false;
      try {
        const factor = Math.round(4294967296 / kernel.divisor);
        const source = this.device.surface(kernel.weights.length, 1, true);
        phase.owned.push(source);
        const scratch = this.device.surface(dst.width, dst.height);
        phase.owned.push(scratch);
        const values = allocateRenderPixels(
          kernel.weights.length * 16,
          () =>
            new Float32Array(
              (phase.weights = kernel.weights.flatMap((w) => {
                const part = [w, 0, 0, 1];
                phase.parts.push(part);
                return part;
              })),
            ),
        );
        phase.values = values;
        try {
          this.device.uploadFloats(source, values);
        } finally {
          try {
            releaseRenderPixels(values);
          } finally {
            phase.values = undefined;
            clearGaussianWeights(phase);
          }
        }
        const shader = (phase.shader = `${SAMPLE}
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
      }`);
        this.device.pass(
          shader,
          scratch,
          gaussianInputs(phase, [dst, source]),
          gaussianUniforms(phase, {
            halfDivisor: Math.floor((kernel.divisor + 1) / 2),
            factorParts: gaussianArray(phase, [factor & 65535, factor >>> 16]),
            radius: kernel.radius,
            direction: gaussianArray(phase, [1, 0]),
          }),
          false,
          outputRegion,
        );
        this.device.pass(
          shader,
          dst,
          gaussianInputs(phase, [scratch, source]),
          gaussianUniforms(phase, {
            halfDivisor: Math.floor((kernel.divisor + 1) / 2),
            factorParts: gaussianArray(phase, [factor & 65535, factor >>> 16]),
            radius: kernel.radius,
            direction: gaussianArray(phase, [0, 1]),
          }),
          false,
          outputRegion,
        );
      } catch (error) {
        cleaned = true;
        try {
          releaseGaussianSurfaces(this.device, phase);
        } catch {
          /* Preserve original weight/shader/pass/native failure. */
        }
        throw error;
      } finally {
        try {
          if (!cleaned) releaseGaussianSurfaces(this.device, phase);
        } finally {
          if (phase.managed) releaseRenderMetadata(phase);
          else clearGaussianLifetime(phase);
        }
      }
    } finally {
      releaseRenderMetadata(kernel);
    }
  }

  apply(
    dst: WebglSurface,
    effects: RenderEffect[],
    layers?: ReadonlyMap<string, WebglSurface>,
  ) {
    for (const effect of effects) {
      if (!effect.enabled) continue;
      if (renderGpuEffect(this.device, dst, effect, layers)) {
        this.bounds.full(dst);
        continue;
      }
      const p = effect.params;
      switch (effect.effect) {
        case "light.radial": {
          // Skia dithers the premultiplied gradient before source-over and clips
          // its RGB to source alpha. Preserve that order at the radial boundary.
          const center = [p.x as number, p.y as number],
            radius = p.radius as number;
          const uniforms = {
            center,
            radius,
            strength: p.strength as number,
            color: (p.color as Rgba).map(
              (value) => Math.round(value * 255) / 255,
            ),
          };
          const light = `uniform vec2 center; uniform float radius; uniform float strength; uniform vec4 color;
          vec4 radial() {
            float a=clamp(1.0-distance(gl_FragCoord.xy,center)/radius,0.0,1.0)*color.a*strength;
            vec4 result=vec4(color.rgb*a,a);
            uint x=uint(gl_FragCoord.x), y=uint(gl_FragCoord.y)^x;
            uint matrix=((y&1u)<<5)|((x&1u)<<4)|((y&2u)<<2)|((x&2u)<<1)|((y&4u)>>1)|((x&4u)>>2);
            float dither=(float(matrix)/64.0-63.0/128.0)/255.0;
            result.rgb=clamp(result.rgb+dither,vec3(0.0),vec3(result.a));
            return result;
          }`;
          // Pixels at or beyond the radius keep their stored bytes exactly.
          const reach = {
            left: Math.max(0, Math.floor(center[0]! - radius) - 1),
            top: Math.max(0, Math.floor(center[1]! - radius) - 1),
            right: Math.min(dst.width, Math.ceil(center[0]! + radius) + 1),
            bottom: Math.min(dst.height, Math.ceil(center[1]! + radius) + 1),
          };
          const lit = !dst.screen
            ? undefined
            : reach.right <= reach.left || reach.bottom <= reach.top
              ? null
              : this.device.drawRegion(dst, reach);
          if (lit === null) break;
          const solid = lit ? this.device.solidColor(dst, lit) : undefined;
          if (solid) {
            // A freshly cleared opaque screen needs no snapshot: fetch its
            // stored bytes from one texel, converted as any backdrop texel.
            const backdrop = this.device.surface(1, 1);
            try {
              const bytes = allocateRenderPixels(
                4,
                () => new Uint8Array(solid),
              );
              try {
                this.device.uploadBytes(backdrop, bytes);
              } finally {
                releaseRenderPixels(bytes);
              }
              this.device.pass(
                `${light} void main() {
                vec4 result=radial();
                pixel=bytes(result+texelFetch(source,ivec2(0),0)*(1.0-result.a));
              }`,
                dst,
                [backdrop],
                uniforms,
                false,
                lit,
              );
            } finally {
              this.device.release(backdrop);
            }
            break;
          }
          this.replace(
            dst,
            `${light} void main() {
            vec4 result=radial();
            pixel=bytes(result+texture(source,uv)*(1.0-result.a));
          }`,
            [dst],
            uniforms,
            lit,
          );
          break;
        }
        case "particles.rise": {
          const particles = {
            progress: p.progress as number,
            count: p.count as number,
            radius: p.radius as number,
            opacity: p.opacity as number,
            seed: p.seed as number,
            color: cssColor(p.color as Rgba),
          };
          if (dst.screen) this.particles(dst, particles);
          else
            this.paint(
              dst,
              (ctx) =>
                paintRisingParticles(ctx, particles, dst.width, dst.height),
              blendShader("normal", true),
            );
          break;
        }
        case "stylize.grain": {
          const seed =
            ((p.seed as number) + Math.floor(p.evolution as number) * 7919) >>>
            0;
          // The grain repeats every 128 pixels. Evaluate the generator once per
          // tile texel, storing its exact byte alpha, instead of per frame pixel.
          const tile = this.device.surface(128, 128);
          try {
            this.device.pass(
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
            uvec2 p=uvec2(gl_FragCoord.xy);
            uint seed=uint(seedParts.x)+(uint(seedParts.y)<<16);
            uint value=advance(seed,(p.y*128u+p.x)*2u+1u);
            uint next=value*1664525u+1013904223u;
            pixel=vec4(value<2147483648u?0.0:1.0,0.0,0.0,floor(float(next)*(1.0/4294967296.0)*amount*255.0+0.5)/255.0);
          }`,
              tile,
              [],
              {
                seedParts: [seed & 65535, seed >>> 16],
                amount: p.amount as number,
              },
            );
            // Fixed-function source-over equals bytes(g + d·(1−a)) for every
            // grain byte and backdrop byte, without copying the backdrop.
            const gl = this.device.gl;
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            this.device.pass(
              `void main() {
            vec4 grain=texelFetch(source,ivec2(uvec2(gl_FragCoord.xy)%128u),0);
            float a=floor(grain.a*255.0+0.5)/255.0;
            pixel=vec4(vec3(grain.r*a),a);
          }`,
              dst,
              [tile],
              {},
              true,
            );
          } finally {
            this.device.gl.disable(this.device.gl.BLEND);
            this.device.release(tile);
          }
          break;
        }
        case "light.sweep": {
          if (!effect.placement)
            throw new Error(
              "comp-effect-space: light.sweep requires layer coordinates",
            );
          const placement = effect.placement;
          const width = p.width as number,
            height = p.height as number,
            left = p.left as number,
            top = p.top as number;
          const regionWidth = p.regionWidth as number,
            regionHeight = p.regionHeight as number,
            band = p.band as number;
          // The light is clipped to this placed rectangle; upload only its
          // device bounds, padded beyond antialiased clip coverage.
          const world = new DOMMatrix();
          for (const matrix of placement.transforms ?? [placement.matrix])
            world.multiplySelf(new DOMMatrix(matrix));
          const corners = [
            [left * width, top * height],
            [(left + regionWidth) * width, top * height],
            [(left + regionWidth) * width, (top + regionHeight) * height],
            [left * width, (top + regionHeight) * height],
          ].map(([x, y]) => world.transformPoint({ x: x!, y: y! }));
          const painted = corners.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          )
            ? {
                left: Math.floor(Math.min(...corners.map((c) => c.x))) - 2,
                top: Math.floor(Math.min(...corners.map((c) => c.y))) - 2,
                right: Math.ceil(Math.max(...corners.map((c) => c.x))) + 2,
                bottom: Math.ceil(Math.max(...corners.map((c) => c.y))) + 2,
              }
            : undefined;
          this.paint(
            dst,
            (ctx) => {
              if (placement.transforms)
                for (const matrix of placement.transforms)
                  ctx.transform(...matrix);
              else ctx.transform(...placement.matrix);
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
            this.bounds.region(dst),
            painted,
          );
          break;
        }
        case "blur.gaussian":
          this.blur(dst, p.radius as number);
          break;
        case "blur.directional": {
          if (!p.length) break;
          this.bounds.blur(dst, Math.ceil((p.length as number) / 2) + 2);
          this.replace(
            dst,
            `${SAMPLE}
${FLOAT32_RATIONAL_SUM}
          uniform float length; uniform vec2 direction; uniform float samples;
          void main() {
            vec4 sum=vec4(0.0);
            for(int i=0;i<64;i++) {
              if(float(i)>=samples) break;
              float distance=((float(i)+0.5)/samples-0.5)*length;
              vec4 value=translated(direction*distance);
              uvec4 rgba=uvec4(floor(value*255.0+0.5));
              uvec3 rgb=rgba.a>0u ? (rgba.rgb*255u+rgba.a/2u)/rgba.a : uvec3(0u);
              sum.r=addByteFraction(sum.r,rgb.r*rgba.a,uvec2(rgb.r,rgba.a));
              sum.g=addByteFraction(sum.g,rgb.g*rgba.a,uvec2(rgb.g,rgba.a));
              sum.b=addByteFraction(sum.b,rgb.b*rgba.a,uvec2(rgb.b,rgba.a));
              sum.a=addByteFraction(sum.a,rgba.a);
            }
            uint alpha=averageAlpha(sum.a,uint(samples));
            uvec3 rgb=sum.a>0.0 ? uvec3(straightByte(sum.r,sum.a),straightByte(sum.g,sum.a),straightByte(sum.b,sum.a)) : uvec3(0u);
            pixel=vec4(vec3((rgb*alpha+127u)/255u),float(alpha))/255.0;
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
            this.bounds.region(dst),
          );
          break;
        }
        case "distort.sine": {
          if (!p.amount) break;
          this.bounds.blur(dst, Math.ceil(Math.abs(p.amount as number)) + 2);
          // Offsets are scalar control data, computed with the same Math.sin as
          // authored motion. SwiftShader's approximate sin can cross a 1/16-pixel
          // sampling boundary even when the source double is on the other side.
          const offsets = this.device.surface(1, dst.height, true);
          try {
            const values = allocateRenderPixels(
              dst.height * 16,
              () => new Float32Array(dst.height * 4),
            );
            for (let y = 0; y < dst.height; y++)
              values[y * 4] =
                Math.sin(
                  (y / (p.wavelength as number)) * Math.PI * 2 +
                    (p.phase as number),
                ) * (p.amount as number);
            try {
              this.device.uploadFloats(offsets, values);
            } finally {
              releaseRenderPixels(values);
            }
            this.replace(
              dst,
              `${HORIZONTAL_SAMPLE}
            void main() {
              float shift=texelFetch(backdrop,ivec2(0,int(gl_FragCoord.y)),0).r;
              pixel=translatedX(shift);
            }`,
              [dst, offsets],
              {},
              this.bounds.region(dst),
            );
          } finally {
            this.device.release(offsets);
          }
          break;
        }
        case "light.glow": {
          if (!p.radius || !p.intensity) break;
          // Canvas filters the opacity-scaled input; scaling the blurred result
          // changes byte rounding and can accumulate through a matte or effect stack.
          const glow = this.device.surface(dst.width, dst.height);
          const inputRegion = this.bounds.region(dst);
          this.bounds.clear(glow, null);
          if (inputRegion === undefined) this.bounds.full(glow);
          else this.bounds.include(glow, inputRegion);
          try {
            this.device.pass(
              `uniform float threshold; uniform float opacity;
            void main() {
              vec4 value=texture(source,uv);
              vec3 rgb=value.a>0.0?bytes(vec4(value.rgb/value.a,1.0)).rgb:vec3(0.0);
              float luminance=dot(rgb,vec3(0.2126,0.7152,0.0722));
              float alpha=floor(value.a * max(0.0,(luminance-threshold)/max(0.001,1.0-threshold))*255.0+0.5)/255.0;
              vec4 thresholded=floor(bytes(vec4(rgb*alpha,alpha))*255.0+0.5);
              pixel=floor(thresholded*(floor(opacity*255.0+0.5)+1.0)/256.0)/255.0;
            }`,
              glow,
              [dst],
              {
                threshold: p.threshold as number,
                opacity: p.intensity as number,
              },
              false,
              inputRegion,
            );
            this.blur(glow, p.radius as number);
            this.bounds.include(dst, this.bounds.snapshot(glow));
            this.replace(
              dst,
              blendShader("screen"),
              [glow, dst],
              {
                opacity: 1,
              },
              this.bounds.region(dst),
            );
          } finally {
            this.bounds.release(glow);
            this.device.release(glow);
          }
          break;
        }
        default:
          throw new Error(
            `comp-webgl-effect: ${effect.effect} is not implemented`,
          );
      }
      if (
        ![
          "blur.gaussian",
          "blur.directional",
          "distort.sine",
          "light.glow",
          "light.sweep",
        ].includes(effect.effect)
      )
        this.bounds.full(dst);
    }
  }
}
