import type { WebglPaint } from "./webgl-paint.ts";
import {
  vectorRegions,
  boundsOverlap,
  unionBounds,
} from "./webgl-vector-regions.ts";
import type { Canvas2dBackend } from "./canvas2d.ts";
import type { Bounds } from "../evaluate/types.ts";
import type { ProviderContent, TextContent } from "./graph.ts";
import type { VectorDraw } from "./backend.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import type { WebglVisualKey } from "./webgl-visual-key.ts";

type Raster = { key: string; surface: WebglSurface; rect: Bounds };

/** Cache local vector coverage; retain per-primitive rounding where artwork overlaps. */
export class WebglVectors {
  private readonly cached = new Map<string, Raster>();
  private bytes = 0;
  private readonly limit = 128 * 1024 * 1024;
  constructor(
    private readonly device: WebglDevice,
    private readonly raster: Canvas2dBackend,
    private readonly keys: WebglVisualKey,
    private readonly paintOver: WebglPaint,
    private readonly contentBounds?: (
      content: ProviderContent | TextContent,
    ) => Bounds | undefined,
  ) {}

  private forget(id: string) {
    const entry = this.cached.get(id)!;
    this.cached.delete(id);
    this.bytes -= entry.surface.width * entry.surface.height * 4;
    this.device.release(entry.surface);
  }

  private extent(ops: VectorDraw[], dst: WebglSurface): Bounds {
    const corners: DOMPoint[] = [];
    for (const op of ops) {
      const c = op.content;
      const box =
        c.type === "solid"
          ? { left: 0, top: 0, right: c.width, bottom: c.height }
          : this.contentBounds?.(c);
      if (!box)
        return { left: 0, top: 0, right: dst.width, bottom: dst.height };
      const world = new DOMMatrix();
      for (const matrix of op.transforms ?? [op.matrix])
        world.multiplySelf(new DOMMatrix(matrix));
      for (const [x, y] of [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ])
        corners.push(world.transformPoint({ x: x!, y: y! }));
    }
    return {
      left: Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2),
      top: Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2),
      right: Math.min(
        dst.width,
        Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
      ),
      bottom: Math.min(
        dst.height,
        Math.ceil(Math.max(...corners.map((p) => p.y))) + 2,
      ),
    };
  }

  private paint(dst: WebglSurface, ops: VectorDraw[], rect: Bounds) {
    const pixels = this.raster.createSurface(dst.width, dst.height);
    const width = Math.min(
      dst.width - rect.left,
      Math.ceil((rect.right - rect.left) / 64) * 64,
    );
    const height = Math.min(
      dst.height - rect.top,
      Math.ceil((rect.bottom - rect.top) / 64) * 64,
    );
    const surface = this.device.surface(width, height);
    try {
      for (const op of ops) {
        const c = op.content;
        const args = [
          op.matrix,
          op.opacity,
          "normal",
          op.clips,
          op.transforms,
        ] as const;
        if (c.type === "solid")
          this.raster.fillRect(
            pixels,
            op.matrix,
            c.width,
            c.height,
            c.color,
            op.opacity,
            "normal",
            op.clips,
            op.transforms,
          );
        else if (c.type === "text") this.raster.drawText(pixels, c, ...args);
        else this.raster.drawProvider(pixels, c, ...args);
      }
      this.device.uploadRegion(surface, pixels.canvas, rect.left, rect.top);
      return surface;
    } catch (error) {
      this.device.release(surface);
      throw error;
    } finally {
      this.raster.releaseSurface(pixels);
    }
  }

  draw(dst: WebglSurface, ops: VectorDraw[]): Bounds | null {
    const boxes = ops.map((op) => this.extent([op], dst));
    const backdrop = this.paintOver.hasBackdrop(dst);
    let painted: Bounds | null = null;
    const draw = (indices: number[], region: Bounds) => {
      const bounds = this.drawBatch(
        dst,
        indices.map((index) => ops[index]!),
        region,
      );
      if (bounds) painted = painted ? unionBounds(painted, bounds) : bounds;
    };
    for (const region of vectorRegions(boxes)) {
      const overlap =
        backdrop &&
        region.indices.some((index, position) =>
          region.indices
            .slice(position + 1)
            .some((other) => boundsOverlap(boxes[index]!, boxes[other]!)),
        );
      // Rounding source-over is not associative. Overlapping primitives must
      // reach the actual GPU backdrop individually, in their original order.
      if (overlap)
        for (const index of region.indices) draw([index], boxes[index]!);
      else draw(region.indices, region.bounds);
    }
    return painted;
  }

  private drawBatch(
    dst: WebglSurface,
    ops: VectorDraw[],
    region: Bounds,
  ): Bounds | null {
    const id = JSON.stringify([
      dst.width,
      dst.height,
      ops.map((op) => op.layer),
    ]);
    const key = this.keys.of(ops);
    let entry = this.cached.get(id);
    const hit = entry?.key === key;
    if (entry?.key !== key) {
      if (entry) this.forget(id);
      const rect = region;
      if (rect.right <= rect.left || rect.bottom <= rect.top) return null;
      entry = { key, rect, surface: this.paint(dst, ops, rect) };
    } else this.cached.delete(id);
    const size = entry.surface.width * entry.surface.height * 4;
    const retained = size <= this.limit;
    if (retained) {
      if (!hit) {
        while (this.bytes + size > this.limit && this.cached.size)
          this.forget(this.cached.keys().next().value!);
        this.bytes += size;
      }
      this.cached.set(id, entry);
    }
    const { surface, rect } = entry;
    try {
      this.paintOver.draw(surface, dst, rect);
    } finally {
      if (!retained) this.device.release(surface);
    }
    return rect;
  }

  dispose() {
    for (const id of this.cached.keys()) this.forget(id);
  }
}
