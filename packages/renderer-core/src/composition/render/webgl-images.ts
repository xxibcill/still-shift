import type { Matrix } from "../../node-transform.ts";
import type { Canvas2dBackend } from "./canvas2d.ts";
import type { ClipRect, ImageContent } from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

type Raster = {
  key: string;
  surface: WebglSurface;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Preserve image sampling precision while compositing bounded textures on the GPU. */
export class WebglImages {
  private readonly cached = new Map<ImageContent["sources"], Raster>();
  private bytes = 0;
  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
  ) {}

  private forget(sources: ImageContent["sources"]) {
    const old = this.cached.get(sources);
    if (!old) return;
    this.bytes -= old.surface.width * old.surface.height * 4;
    this.cached.delete(sources);
    this.device.release(old.surface);
  }

  draw(
    dst: WebglSurface,
    content: ImageContent,
    matrix: Matrix,
    opacity: number,
    clips: ClipRect[],
    transforms?: Matrix[],
  ) {
    const key = JSON.stringify([
      content,
      matrix,
      opacity,
      clips,
      transforms,
      dst.width,
      dst.height,
    ]);
    let entry = this.cached.get(content.sources);
    if (entry?.key !== key) {
      this.forget(content.sources);
      const world = new DOMMatrix();
      for (const local of transforms ?? [matrix])
        world.multiplySelf(new DOMMatrix(local));
      const points = [
        [0, 0],
        [content.width, 0],
        [content.width, content.height],
        [0, content.height],
      ].map(([x, y]) => world.transformPoint({ x: x!, y: y! }));
      const left = Math.max(
          0,
          Math.floor(Math.min(...points.map((p) => p.x))) - 2,
        ),
        top = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y))) - 2),
        right = Math.min(
          dst.width,
          Math.ceil(Math.max(...points.map((p) => p.x))) + 2,
        ),
        bottom = Math.min(
          dst.height,
          Math.ceil(Math.max(...points.map((p) => p.y))) + 2,
        );
      if (right <= left || bottom <= top) return true;
      const width = Math.min(
          dst.width - left,
          Math.ceil((right - left) / 64) * 64,
        ),
        height = Math.min(
          dst.height - top,
          Math.ceil((bottom - top) / 64) * 64,
        ),
        bytes = width * height * 4;
      if (bytes > 128 * 1024 * 1024) return false;
      while (this.bytes + bytes > 128 * 1024 * 1024 && this.cached.size)
        this.forget(this.cached.keys().next().value!);
      const pixels = this.raster.createSurface(dst.width, dst.height);
      const surface = this.device.surface(width, height);
      try {
        this.raster.drawImage(
          pixels,
          content,
          matrix,
          opacity,
          "normal",
          clips,
          transforms,
        );
        this.device.uploadRegion(surface, pixels.canvas, left, top);
      } catch (error) {
        this.device.release(surface);
        throw error;
      } finally {
        this.raster.releaseSurface(pixels);
      }
      entry = { key, surface, left, top, right, bottom };
      this.bytes += bytes;
    }
    this.cached.delete(content.sources);
    this.cached.set(content.sources, entry);
    const { surface, left, top, right, bottom } = entry;
    const gl = this.device.gl;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, top, right - left, bottom - top);
    try {
      this.device.pass(
        `uniform vec2 origin; void main() {
        pixel=texelFetch(source,ivec2(gl_FragCoord.xy-origin),0);
      }`,
        dst,
        [surface],
        { origin: [left, top] },
      );
    } finally {
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
    }
    return true;
  }
}
