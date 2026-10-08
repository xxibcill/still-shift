import type { Bounds } from "../evaluate/types.ts";
import type { WebglBounds } from "./webgl-bounds.ts";
import {
  inputSampler,
  type WebglDevice,
  type WebglSurface,
} from "./webgl-device.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

const PAINT = `uniform vec2 origin; uniform vec2 backdropOrigin; uniform vec4 region; uniform float primitive;
void main() {
  vec2 p=gl_FragCoord.xy;
  vec4 s=vec4(0.0);
  if(p.x>=region.x && p.y>=region.y && p.x<region.z && p.y<region.w)
    s=floor(texelFetch(source,ivec2(p-origin),0)*255.0+0.5);
  vec4 d=floor(texelFetch(backdrop,ivec2(p-backdropOrigin),0)*255.0+0.5);
  pixel=(primitive > 0.5 ? s+floor(d*(256.0-s.a)/256.0) : floor(s+d*(1.0-s.a/255.0)+0.5))/255.0;
}`;

export type PreparedPaint = {
  surface: WebglSurface;
  rect: Bounds;
  primitive: boolean;
};

function batchShader(count: number) {
  const declarations: string[] = [],
    operations: string[] = [];
  for (let i = 0; i < count; i++) {
    const sampler = inputSampler(i + 1);
    if (i + 1 >= 3) declarations.push(`uniform sampler2D ${sampler};`);
    declarations.push(`uniform vec4 region${i}; uniform float primitive${i};`);
    operations.push(`if (all(greaterThanEqual(p,region${i}.xy)) && all(lessThan(p,region${i}.zw))) {
      vec4 s=floor(texelFetch(${sampler},ivec2(p-region${i}.xy),0)*255.0+0.5);
      d=primitive${i}>0.5 ? s+floor(d*(256.0-s.a)/256.0) : floor(s+d*(1.0-s.a/255.0)+0.5);
    }`);
  }
  return `${declarations.join("\n")}
    uniform vec2 backdropOrigin;
    void main() {
      vec2 p=gl_FragCoord.xy;
      vec4 d=floor(texelFetch(source,ivec2(p-backdropOrigin),0)*255.0+0.5);
      ${operations.join("\n")}
      pixel=d/255.0;
    }`;
}

/** Compose prepared primitive bytes with Canvas's integer source-over rounding. */
export class WebglPaint {
  constructor(
    private device: WebglDevice,
    private bounds: WebglBounds,
  ) {}
  hasBackdrop(dst: WebglSurface) {
    return dst.opaque || this.bounds.snapshot(dst) !== null;
  }

  /** WebGL2 guarantees 16 fragment samplers; one holds the original backdrop. */
  drawMany(parts: PreparedPaint[], dst: WebglSurface) {
    const visible = parts.filter((part) =>
      this.device.drawRegion(dst, part.rect),
    );
    for (let start = 0; start < visible.length; start += 15) {
      const batch = visible.slice(start, start + 15);
      if (batch.length === 1) {
        const part = batch[0]!;
        this.draw(part.surface, dst, part.rect, part.primitive);
        continue;
      }
      const rect = batch.map((part) => part.rect).reduce(unionBounds);
      const active = this.device.drawRegion(dst, rect)!;
      const previous = this.bounds.snapshot(dst);
      const backdrop = dst.screen ? this.device.copyRegion(dst, active) : dst;
      const output = dst.screen
        ? dst
        : this.device.surface(dst.width, dst.height, false, dst.opaque);
      const uniforms: Record<string, number | number[]> = {
        backdropOrigin: dst.screen ? [active.left, active.top] : [0, 0],
      };
      for (const [i, part] of batch.entries()) {
        uniforms[`region${i}`] = [
          part.rect.left,
          part.rect.top,
          part.rect.right,
          part.rect.bottom,
        ];
        uniforms[`primitive${i}`] = part.primitive ? 1 : 0;
      }
      try {
        this.device.pass(
          batchShader(batch.length),
          output,
          [backdrop, ...batch.map((part) => part.surface)],
          uniforms,
          false,
          dst.screen ? active : previous ? unionBounds(previous, rect) : rect,
        );
        if (!dst.screen) this.device.swap(dst, output);
        this.bounds.include(dst, rect);
      } finally {
        if (dst.screen) this.device.release(backdrop);
        else this.device.release(output);
      }
    }
  }

  draw(
    source: WebglSurface,
    dst: WebglSurface,
    rect: Bounds,
    primitive = true,
    bitmapRounding = false,
  ) {
    const active = this.device.drawRegion(dst, rect);
    if (!active) return;
    if (!primitive && !dst.floating && !bitmapRounding) {
      const gl = this.device.gl;
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      try {
        this.device.pass(
          `uniform vec2 origin; void main() {
            pixel=texelFetch(source,ivec2(gl_FragCoord.xy-origin),0);
          }`,
          dst,
          [source],
          { origin: [rect.left, rect.top] },
          true,
          active,
        );
        this.bounds.include(dst, rect);
      } finally {
        gl.disable(gl.BLEND);
      }
      return;
    }
    const previous = this.bounds.snapshot(dst);
    const backdrop = dst.screen ? this.device.copyRegion(dst, active) : dst;
    const output = dst.screen
      ? dst
      : this.device.surface(dst.width, dst.height, false, dst.opaque);
    try {
      this.device.pass(
        PAINT,
        output,
        [source, backdrop],
        {
          origin: [rect.left, rect.top],
          backdropOrigin: dst.screen ? [active.left, active.top] : [0, 0],
          region: [rect.left, rect.top, rect.right, rect.bottom],
          primitive: primitive && !bitmapRounding ? 1 : 0,
        },
        false,
        dst.screen ? active : previous ? unionBounds(previous, rect) : rect,
      );
      if (!dst.screen) this.device.swap(dst, output);
      this.bounds.include(dst, rect);
    } finally {
      if (dst.screen) this.device.release(backdrop);
      else this.device.release(output);
    }
  }
}
