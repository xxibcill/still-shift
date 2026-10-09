import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import type { Bounds } from "../evaluate/types.ts";
import type { Canvas2dBackend, CanvasSurface } from "./canvas2d.ts";
import type { WebglBounds } from "./webgl-bounds.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

type Placement = { rect: Bounds; x: number; y: number };
const area = (rect: Bounds) =>
  (rect.right - rect.left) * (rect.bottom - rect.top);

/** Pack disjoint Canvas coverage without changing its device-space sampling. */
export class WebglDisjointPaints {
  private floatingSupported: boolean | undefined;
  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
    private readonly bounds: WebglBounds,
  ) {}

  draw(canvas: CanvasSurface, dst: WebglSurface, rects: Bounds[]) {
    if (!dst.screen || rects.length < 8) return false;
    if (
      rects.some((rect, index) =>
        rects
          .slice(index + 1)
          .some(
            (other) =>
              rect.left < other.right &&
              other.left < rect.right &&
              rect.top < other.bottom &&
              other.top < rect.bottom,
          ),
      )
    )
      return false;
    const visible = rects.filter((rect) => this.device.drawRegion(dst, rect));
    if (!visible.length) return true;
    this.floatingSupported ??= !!this.device.gl.getExtension(
      "EXT_color_buffer_float",
    );
    if (!this.floatingSupported) return false;
    const maximum = this.device.gl.getParameter(
      this.device.gl.MAX_TEXTURE_SIZE,
    ) as number;
    const width =
      Math.ceil(
        Math.max(
          ...visible.map((rect) => rect.right - rect.left),
          Math.sqrt(visible.reduce((sum, rect) => sum + area(rect), 0)),
        ) / 64,
      ) * 64;
    const placements: Placement[] = [];
    let x = 0,
      y = 0,
      rowHeight = 0;
    for (const rect of visible) {
      const w = rect.right - rect.left,
        h = rect.bottom - rect.top;
      if (x + w > width) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      placements.push({ rect, x, y });
      x += w;
      rowHeight = Math.max(rowHeight, h);
    }
    const height = Math.ceil((y + rowHeight) / 64) * 64;
    if (
      width > maximum ||
      height > maximum ||
      visible.length > maximum ||
      width * height * 4 + visible.length * 32 > 128 * 1024 * 1024
    )
      return false;
    const rect = visible.reduce(unionBounds),
      active = this.device.drawRegion(dst, rect)!;
    const solid = this.device.solidColor(dst, active);
    // Starting a screen pass retires the device's clear-color cache.
    const color = solid
      ? allocateRenderMetadata(64, () => [...solid])
      : undefined;
    let atlas: CanvasSurface | undefined,
      source: WebglSurface | undefined,
      layout: WebglSurface | undefined;
    let backdrop: WebglSurface | undefined;
    try {
      atlas = this.raster.createSurface(width, height);
      source = this.device.surface(width, height);
      layout = this.device.surface(2, placements.length, true);
      const coordinates = new Float32Array(placements.length * 8);
      for (const [index, placement] of placements.entries()) {
        const { rect, x, y } = placement;
        // Integer, unscaled copies into cleared storage preserve premultiplied bytes.
        atlas.ctx.drawImage(
          canvas.canvas,
          rect.left,
          rect.top,
          rect.right - rect.left,
          rect.bottom - rect.top,
          x,
          y,
          rect.right - rect.left,
          rect.bottom - rect.top,
        );
        coordinates.set(
          [rect.left, rect.top, rect.right, rect.bottom, x, y, 0, 0],
          index * 8,
        );
      }
      this.device.upload(source, atlas.canvas);
      this.device.uploadFloats(layout, coordinates);
      if (!color) backdrop = this.device.copyRegion(dst, active);
      this.device.pass(
        `flat in vec4 rectangleOrigin;
        uniform vec2 backdropOrigin; uniform vec4 clearBytes;
        void main() {
          ivec2 p=ivec2(gl_FragCoord.xy);
          vec4 s=floor(texelFetch(source,p-ivec2(rectangleOrigin.xy)+ivec2(rectangleOrigin.zw),0)*255.0+0.5);
          vec4 d=${color ? "clearBytes" : "floor(texelFetch(backdrop,p-ivec2(backdropOrigin),0)*255.0+0.5)"};
          pixel=(s+floor(d*(256.0-s.a)/256.0))/255.0;
        }`,
        dst,
        [source, backdrop ?? source, layout],
        {
          destinationSize: [dst.width, dst.height],
          backdropOrigin: [active.left, active.top],
          clearBytes: color ?? [0, 0, 0, 0],
        },
        false,
        active,
        placements.length,
      );
      this.bounds.include(dst, rect);
      return true;
    } finally {
      if (color) releaseRenderMetadata(color);
      if (backdrop) this.device.release(backdrop);
      if (layout) this.device.release(layout);
      if (source) this.device.release(source);
      if (atlas) this.raster.releaseSurface(atlas);
    }
  }
}
