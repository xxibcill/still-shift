import { imagePlacement, type Matrix } from "../../node-transform.ts";
import type { Canvas2dBackend, CanvasImageResources } from "./canvas2d.ts";
import type { ClipRect, ImageContent } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

const LIMIT = 128 * 1024 * 1024;
const f = Math.fround;
const SHADER = `uniform vec2 imageSize; uniform vec4 edges; uniform float opacity;
void main() {
  ivec2 pos=ivec2(gl_FragCoord.xy);
  vec2 position=vec2(pos)+0.5;
  if(any(lessThanEqual(position,edges.xy)) || any(greaterThan(position,edges.zw))) {
    pixel=vec4(0.0); return;
  }
  vec2 q=vec2(texelFetch(backdrop,ivec2(pos.x,0),0).r,texelFetch(backdrop,ivec2(pos.y,0),0).g);
  vec2 lo=floor(q/16.0), weight=q-lo*16.0;
  vec4 value=floor(texture(source,(lo+0.5+weight/16.0)/imageSize)*255.0+0.001);
  pixel=floor(value*(floor(opacity*255.0+0.5)+1.0)/256.0)/255.0;
}`;

/** Native bitmap spans, restricted to downscaled PNG sprites with transparent borders. */
export class WebglPngImages {
  private readonly sources = new Map<string, WebglSurface>();
  private readonly unsupported = new Set<string>();
  private bytes = 0;
  private control:
    | {
        surface: WebglSurface;
        values: Float32Array<ArrayBuffer>;
      }
    | undefined;
  private readonly maximum: number;

  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
    private readonly resources: CanvasImageResources,
  ) {
    this.maximum = Math.min(
      16384,
      device.gl.getParameter(device.gl.MAX_TEXTURE_SIZE) as number,
    );
  }

  private forget(key: string) {
    const surface = this.sources.get(key)!;
    this.sources.delete(key);
    this.bytes -= surface.width * surface.height * 4;
    this.device.release(surface);
  }

  private source(asset: string, level: number) {
    const key = JSON.stringify([asset, level]);
    if (this.unsupported.has(key)) return undefined;
    const cached = this.sources.get(key);
    if (cached) {
      this.sources.delete(key);
      this.sources.set(key, cached);
      return cached;
    }
    const size = this.resources.sizes.get(asset)!;
    const width = size[0] / 2 ** level,
      height = size[1] / 2 ** level;
    if (width < 6 || height < 6) return undefined;
    const pixels = this.raster.createSurface(width, height);
    try {
      pixels.ctx.drawImage(
        this.resources.images.get(asset)!,
        0,
        0,
        width,
        height,
      );
      // With effective mip scale >= 1/2, three transparent source rows/columns
      // keep native rectangle/clip antialiasing outside all visible filtering.
      const edges = [
        pixels.ctx.getImageData(0, 0, width, 3),
        pixels.ctx.getImageData(0, height - 3, width, 3),
        pixels.ctx.getImageData(0, 0, 3, height),
        pixels.ctx.getImageData(width - 3, 0, 3, height),
      ];
      if (
        edges.some(({ data }) =>
          data.some((value, i) => i % 4 === 3 && value !== 0),
        )
      ) {
        if (this.unsupported.size >= 1024)
          this.unsupported.delete(this.unsupported.values().next().value!);
        this.unsupported.add(key);
        return undefined;
      }
      const bytes = width * height * 4;
      while (this.bytes + bytes > LIMIT && this.sources.size)
        this.forget(this.sources.keys().next().value!);
      const surface = this.device.surface(width, height);
      try {
        this.device.upload(surface, pixels.canvas);
      } catch (error) {
        this.device.release(surface);
        throw error;
      }
      this.sources.set(key, surface);
      this.bytes += bytes;
      return surface;
    } finally {
      this.raster.releaseSurface(pixels);
    }
  }

  draw(
    dst: WebglSurface,
    content: ImageContent,
    matrix: Matrix,
    opacity: number,
    clips: ClipRect[],
    transforms?: Matrix[],
  ) {
    if (content.media) return false;
    if (clips.length || content.rasterize !== "draw") return false;
    if (
      content.stateFrom !== undefined &&
      content.stateFrom !== content.state &&
      content.stateMix !== 0 &&
      content.stateMix !== 1
    )
      return false;
    const variant =
      content.sources[
        content.stateMix === 0 && content.stateFrom !== undefined
          ? content.stateFrom
          : content.state
      ]!;
    if (
      variant.crop ||
      variant.registration ||
      !this.resources.pngImages?.has(variant.asset)
    )
      return false;
    if (!(this.resources.images.get(variant.asset) instanceof HTMLImageElement))
      return false;
    const size = this.resources.sizes.get(variant.asset)!;
    if (size[0] * size[1] * 4 > LIMIT || Math.max(...size) >= this.maximum)
      return false;
    let a = 1,
      d = 1,
      tx = 0,
      ty = 0;
    for (const local of transforms ?? [matrix]) {
      if (local[1] !== 0 || local[2] !== 0 || local[0] <= 0 || local[3] <= 0)
        return false;
      tx = f(f(a * f(local[4])) + tx);
      ty = f(f(d * f(local[5])) + ty);
      a = f(a * f(local[0]));
      d = f(d * f(local[3]));
    }
    const p = imagePlacement(content, [0, 0, ...size]);
    if (
      p.x < 0 ||
      p.y < 0 ||
      p.x + p.width > content.width + 0.000001 ||
      p.y + p.height > content.height + 0.000001
    )
      return false;
    const scaleX = (a * p.width) / size[0],
      scaleY = (d * p.height) / size[1];
    const scale = Math.max(scaleX, scaleY),
      log = Math.log2(scale);
    // Keep unverified anisotropic, identity and mip-boundary procedures on Canvas.
    if (
      !(scale > 0 && scale < 1) ||
      Math.abs(scaleX - scaleY) > scale * 0.000001 ||
      Math.abs(log - Math.round(log)) < 1 / 256
    )
      return false;
    const level = Math.max(0, Math.floor(-log));
    // Keep ordinary downscales on the existing raster cache. The measured
    // benefit is for mipped sprites, which reuse a smaller source texture.
    if (level === 0 || size.some((value) => value % 2 ** level !== 0))
      return false;
    const source = this.source(variant.asset, level);
    if (!source) return false;
    const left = f(a * f(p.x) + tx),
      top = f(d * f(p.y) + ty);
    const right = f(a * f(f(p.x) + f(p.width)) + tx);
    const bottom = f(d * f(f(p.y) + f(p.height)) + ty);
    const rect = {
      left: Math.max(0, Math.floor(left)),
      top: Math.max(0, Math.floor(top)),
      right: Math.min(dst.width, Math.ceil(right)),
      bottom: Math.min(dst.height, Math.ceil(bottom)),
    };
    if (rect.right <= rect.left || rect.bottom <= rect.top) return true;
    if (!this.device.drawRegion(dst, rect)) return true;
    const imageScaleX = f(
      a * f(f(f(f(p.x) + f(p.width)) - f(p.x)) / source.width),
    );
    const imageScaleY = f(
      d * f(f(f(f(p.y) + f(p.height)) - f(p.y)) / source.height),
    );
    const sx = f(1 / imageScaleX),
      sy = f(1 / imageScaleY);
    const control = this.coordinates(
      dst,
      sx,
      sy,
      f(-left * sx),
      f(-top * sy),
      left,
    );
    const gl = this.device.gl;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    try {
      this.device.pass(
        SHADER,
        dst,
        [source, control],
        {
          imageSize: [source.width, source.height],
          edges: [left, top, right, bottom],
          opacity,
        },
        true,
        rect,
      );
    } finally {
      gl.disable(gl.BLEND);
    }
    return true;
  }

  private coordinates(
    dst: WebglSurface,
    sx: number,
    sy: number,
    ix: number,
    iy: number,
    left: number,
  ) {
    const length = Math.max(dst.width, dst.height);
    if (this.control?.surface.width !== length) {
      if (this.control) this.device.release(this.control.surface);
      this.control = {
        surface: this.device.surface(length, 1, true),
        values: new Float32Array(length * 4),
      };
    }
    const { surface, values } = this.control;
    const start = Math.max(0, Math.floor(left + 0.5));
    for (let x = 0; x < dst.width; x++) {
      const span = start + Math.floor((x - start) / 127) * 127;
      const initial = f(f(sx * (span + 0.5)) + ix) - 0.5;
      values[x * 4] = Math.floor((initial + sx * (x - span)) * 16);
    }
    for (let y = 0; y < dst.height; y++)
      values[y * 4 + 1] = Math.floor((f(f(sy * (y + 0.5)) + iy) - 0.5) * 16);
    this.device.uploadFloats(surface, values);
    return surface;
  }

  dispose() {
    for (const key of this.sources.keys()) this.forget(key);
    this.unsupported.clear();
    if (this.control) this.device.release(this.control.surface);
    this.control = undefined;
  }
}
