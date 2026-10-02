import {
  recordVectorPaints,
  replayVectorPaints,
} from "./webgl-vector-paints.ts";
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

type RasterPart = { surface: WebglSurface; rect: Bounds; primitive: boolean };
type Raster = { key: string; parts: RasterPart[] };
const rasterBytes = (entry: Raster) =>
  entry.parts.reduce(
    (sum, part) => sum + part.surface.width * part.surface.height * 4,
    0,
  );

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
    this.bytes -= rasterBytes(entry);
    for (const part of entry.parts) this.device.release(part.surface);
  }

  private extent(ops: VectorDraw[], dst: WebglSurface): Bounds {
    const corners: DOMPoint[] = [];
    let padding = 2;
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
      if (op.paintBlur)
        padding = Math.max(
          padding,
          4 *
            op.paintBlur *
            Math.max(
              1,
              Math.hypot(world.a, world.b),
              Math.hypot(world.c, world.d),
            ) +
            6,
        );
      for (const [x, y] of [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ])
        corners.push(world.transformPoint({ x: x!, y: y! }));
    }
    return {
      left: Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.x)) - padding),
      ),
      top: Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.y)) - padding),
      ),
      right: Math.min(
        dst.width,
        Math.ceil(Math.max(...corners.map((p) => p.x)) + padding),
      ),
      bottom: Math.min(
        dst.height,
        Math.ceil(Math.max(...corners.map((p) => p.y)) + padding),
      ),
    };
  }

  private paint(dst: WebglSurface, ops: VectorDraw[], rect: Bounds) {
    const pixels = this.raster.createSurface(dst.width, dst.height);
    const recording = this.paintOver.hasBackdrop(dst)
      ? recordVectorPaints(pixels.ctx, rect)
      : undefined;
    const painting = recording ? { ...pixels, ctx: recording.context } : pixels;
    const parts: RasterPart[] = [];
    const upload = (
      canvas: HTMLCanvasElement,
      box: Bounds,
      primitive: boolean,
    ) => {
      if (box.right <= box.left || box.bottom <= box.top) return;
      const width = Math.min(
        dst.width - box.left,
        Math.ceil((box.right - box.left) / 64) * 64,
      );
      const height = Math.min(
        dst.height - box.top,
        Math.ceil((box.bottom - box.top) / 64) * 64,
      );
      const surface = this.device.surface(width, height);
      parts.push({ surface, rect: box, primitive });
      this.device.uploadRegion(surface, canvas, box.left, box.top);
    };
    try {
      for (const op of ops) {
        const c = op.content;
        const args = [
          op.matrix,
          op.opacity,
          "normal",
          op.clips,
          op.transforms,
          op.paintBlur,
        ] as const;
        if (c.type === "solid")
          this.raster.fillRect(
            painting,
            op.matrix,
            c.width,
            c.height,
            c.color,
            op.opacity,
            "normal",
            op.clips,
            op.transforms,
            op.paintBlur,
          );
        else if (c.type === "text") this.raster.drawText(painting, c, ...args);
        else this.raster.drawProvider(painting, c, ...args);
      }
      let groups = recording?.groups();
      if (
        groups &&
        groups.reduce((sum, group) => {
          const box = group.bounds;
          return (
            sum +
            Math.max(0, Math.ceil((box.right - box.left) / 64) * 64) *
              Math.max(0, Math.ceil((box.bottom - box.top) / 64) * 64) *
              4
          );
        }, 0) > this.limit
      )
        groups = undefined;
      if (groups?.length === 1)
        upload(pixels.canvas, groups[0]!.bounds, groups[0]!.primitive);
      else if (!groups)
        upload(
          pixels.canvas,
          rect,
          ops.every((op) => !op.paintBlur),
        );
      else
        for (const group of groups) {
          const scratch = this.raster.createSurface(dst.width, dst.height);
          try {
            replayVectorPaints(scratch.ctx, group);
            upload(scratch.canvas, group.bounds, group.primitive);
          } finally {
            this.raster.releaseSurface(scratch);
          }
        }
      return parts;
    } catch (error) {
      for (const part of parts) this.device.release(part.surface);
      throw error;
    } finally {
      recording?.dispose();
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
    const key = this.keys.of([ops, this.paintOver.hasBackdrop(dst)]);
    let entry = this.cached.get(id);
    const hit = entry?.key === key;
    if (entry?.key !== key) {
      if (entry) this.forget(id);
      const rect = region;
      if (rect.right <= rect.left || rect.bottom <= rect.top) return null;
      entry = { key, parts: this.paint(dst, ops, rect) };
    } else this.cached.delete(id);
    const size = rasterBytes(entry);
    const retained = size <= this.limit;
    if (retained) {
      if (!hit) {
        while (this.bytes + size > this.limit && this.cached.size)
          this.forget(this.cached.keys().next().value!);
        this.bytes += size;
      }
      this.cached.set(id, entry);
    }
    try {
      this.paintOver.drawMany(entry.parts, dst);
    } finally {
      if (!retained)
        for (const part of entry.parts) this.device.release(part.surface);
    }
    return region;
  }

  dispose() {
    for (const id of this.cached.keys()) this.forget(id);
  }
}
