import {
  renderMembers,
  type CompositionRenderStatistics,
} from "./statistics.ts";
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

import { renderMemory } from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  serializeRenderMetadata,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";

type RasterPart = { surface: WebglSurface; rect: Bounds; primitive: boolean };
type Raster = { key: string; parts: RasterPart[] };
type Geometry = {
  boxes: Bounds[] | undefined;
  regions: ReturnType<typeof vectorRegions> | undefined;
  painted: Bounds | null;
};
function geometryCapacity(ops: VectorDraw[]): number {
  if (!renderMemory()) return 0;
  let matrices = 0;
  for (const op of ops) matrices += op.transforms?.length ?? 1;
  const count = ops.length;
  // Per extent: input/fallback arrays, corner/coordinate arrays, inline/output
  // bounds, one DOMMatrix and four input points/DOMPoints (<= 1616 bytes).
  // Each authored transform contributes a 192-byte DOMMatrix wrapper/value.
  // Region records/unions/indices/splice arrays and batching add <= 584 bytes per operation;
  // worst-case merged indices and overlap slices add 8*count*(count-1).
  return 640 + 2200 * count + 192 * matrices + 8 * count * (count - 1);
}
function clearGeometry(value: Geometry): void {
  if (value.boxes) value.boxes.length = 0;
  value.boxes = undefined;
  if (value.regions) {
    for (const region of value.regions) region.indices.length = 0;
    value.regions.length = 0;
  }
  value.regions = undefined;
  value.painted = null;
}
type OwnedRaster = {
  entry: Raster | undefined;
  id: ManagedMetadataText;
  key: ManagedMetadataText;
  removed: boolean;
};
function preserveFailure(failed: boolean, cleanup: () => void): void {
  if (!failed) return cleanup();
  try {
    cleanup();
  } catch {
    /* Preserve the original producer/consumer failure. */
  }
}
const rasterBytes = (entry: Raster) =>
  entry.parts.reduce(
    (sum, part) => sum + part.surface.width * part.surface.height * 4,
    0,
  );

/** Cache local vector coverage; retain per-primitive rounding where artwork overlaps. */
export class WebglVectors {
  private readonly state: { cached: Map<string, OwnedRaster> };
  private closed = false;
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
    private readonly singleImage?: (
      content: ProviderContent | TextContent,
    ) => boolean,
    private readonly stableImages?: (
      content: ProviderContent | TextContent,
    ) => boolean,
    private readonly boundedCanvas?: (
      content: ProviderContent | TextContent,
    ) => boolean,
    private readonly statistics?: CompositionRenderStatistics,
  ) {
    this.state = allocateRenderMetadata(
      256,
      () => ({ cached: new Map<string, OwnedRaster>() }),
      false,
      () => this.clear(),
    );
  }
  private resize(entries = this.state.cached.size) {
    resizeRenderMetadata(this.state, 256 + 64 * entries);
  }
  private destroy(value: OwnedRaster) {
    if (value.removed) return;
    value.removed = true;
    let failed = false,
      failure: unknown;
    const entry = value.entry;
    try {
      if (entry)
        for (const part of entry.parts)
          try {
            this.device.release(part.surface);
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
    } finally {
      if (entry) {
        releaseRenderMetadata(entry.parts);
        entry.parts.length = 0;
      }
      value.entry = undefined;
      value.key.release();
      value.id.release();
    }
    if (failed) throw failure;
  }
  private release(value: OwnedRaster) {
    try {
      this.destroy(value);
    } finally {
      releaseRenderMetadata(value);
    }
  }

  private forget(id: string) {
    const owner = this.state.cached.get(id)!;
    const entry = owner.entry!;
    this.state.cached.delete(id);
    this.bytes -= rasterBytes(entry);
    try {
      this.release(owner);
    } finally {
      if (!this.closed) this.resize();
    }
  }

  private extent(ops: VectorDraw[], dst: WebglSurface): Bounds {
    const corners: DOMPoint[] = [];
    let padding = 2;
    for (const op of ops) {
      const c = op.content;
      const box =
        c.type === "solid"
          ? { left: 0, top: 0, right: c.width, bottom: c.height }
          : c.type === "shape"
            ? c.shapes.bounds
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
    // Custom drawers retain full dimensions unless they explicitly opt in.
    const bounded = ops.every(
      ({ content }) =>
        content.type === "solid" ||
        content.type === "shape" ||
        this.boundedCanvas?.(content),
    );
    const rasterWidth = bounded
      ? Math.min(dst.width, Math.ceil((rect.right + 63) / 256) * 256)
      : dst.width;
    const rasterHeight = bounded
      ? Math.min(dst.height, Math.ceil((rect.bottom + 63) / 256) * 256)
      : dst.height;
    // Native cubic strokes and Canvas filters differ on the hardware raster path.
    const rasterMode = ops.some(
      (op) => op.paintBlur || op.content.type === "shape",
    )
      ? "software"
      : undefined;
    const pixels = this.raster.createSurface(
      rasterWidth,
      rasterHeight,
      rasterMode,
    );
    // draw() separates overlapping coverage before batching paints over a backdrop.
    const imageOnly = ops.every(
      ({ content }) =>
        content.type !== "solid" &&
        content.type !== "shape" &&
        this.singleImage?.(content),
    );
    const content = ops.length === 1 ? ops[0]!.content : undefined;
    const stableImages =
      !!content &&
      content.type !== "solid" &&
      content.type !== "shape" &&
      content.stateFrom === undefined &&
      this.stableImages?.(content) === true;
    let recording: ReturnType<typeof recordVectorPaints> | undefined;
    let painting = pixels;
    let parts: RasterPart[] | undefined;
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
      const target = parts!;
      resizeRenderMetadata(target, 32 + 168 * (target.length + 1));
      const surface = this.device.surface(width, height);
      target.push({ surface, rect: { ...box }, primitive });
      this.device.uploadRegion(surface, canvas, box.left, box.top);
    };
    try {
      recording =
        this.paintOver.hasBackdrop(dst) && !imageOnly
          ? recordVectorPaints(pixels.ctx, rect, {
              stableImages,
              deferPaints: true,
            })
          : undefined;
      if (recording) {
        const context = recording.context;
        let fields = 1;
        for (const field in pixels) if (Object.hasOwn(pixels, field)) fields++;
        painting = allocateRenderMetadata(
          64 + 16 * fields,
          () => ({ ...pixels, ctx: context }),
          false,
          (value) => {
            for (const field in value)
              if (Object.hasOwn(value, field))
                delete (value as unknown as Record<string, unknown>)[field];
          },
        );
      }
      parts = allocateRenderMetadata<RasterPart[]>(
        32,
        () => [],
        true,
        (value) => {
          value.length = 0;
        },
      );
      for (const op of ops) {
        const c = op.content;
        const args = allocateRenderMetadata(
          80,
          () =>
            [
              op.matrix,
              op.opacity,
              "normal",
              op.clips,
              op.transforms,
              op.paintBlur,
            ] as const,
          false,
          (value) => {
            (value as unknown as unknown[]).length = 0;
          },
        );
        const paint = () => {
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
          else if (c.type === "shape")
            this.raster.drawShape(painting, c, ...args);
          else if (c.type === "text")
            this.raster.drawText(painting, c, ...args);
          else this.raster.drawProvider(painting, c, ...args);
        };
        try {
          if (this.statistics)
            this.statistics.measure(
              { stage: "native-content", members: renderMembers([op]) },
              paint,
            );
          else paint();
        } finally {
          releaseRenderMetadata(args);
        }
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
      if (!groups || groups.length === 1) recording?.render();
      if (groups?.length === 1)
        upload(pixels.canvas, groups[0]!.bounds, groups[0]!.primitive);
      else if (!groups)
        upload(
          pixels.canvas,
          rect,
          !imageOnly && ops.every((op) => !op.paintBlur),
        );
      else
        for (const [index, group] of groups.entries()) {
          if (
            index === 0 &&
            group.shadow === undefined &&
            recording?.firstGroupOnly()
          ) {
            upload(pixels.canvas, group.bounds, group.primitive);
            continue;
          }
          const scratch = this.raster.createSurface(
            rasterWidth,
            rasterHeight,
            rasterMode,
          );
          try {
            replayVectorPaints(scratch.ctx, group);
            upload(scratch.canvas, group.bounds, group.primitive);
          } finally {
            this.raster.releaseSurface(scratch);
          }
        }
      return parts;
    } catch (error) {
      preserveFailure(true, () => {
        try {
          if (parts)
            for (const part of parts) this.device.release(part.surface);
        } finally {
          if (parts) releaseRenderMetadata(parts);
        }
      });
      throw error;
    } finally {
      if (painting !== pixels) releaseRenderMetadata(painting);
      try {
        recording?.dispose();
      } finally {
        this.raster.releaseSurface(pixels);
      }
    }
  }

  /** Consume synchronously to release geometry after the backend copies its bounds. */
  draw(
    dst: WebglSurface,
    ops: VectorDraw[],
    consume?: (bounds: Bounds | null) => void,
  ): Bounds | null {
    const geometry = allocateRenderMetadata<Geometry>(
      geometryCapacity(ops),
      () => ({ boxes: undefined, regions: undefined, painted: null }),
      false,
      clearGeometry,
    );
    let failed = false;
    try {
      const boxes = (geometry.boxes = ops.map((op) => this.extent([op], dst)));
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
      const regions = (geometry.regions = vectorRegions(boxes));
      for (const region of regions) {
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
      geometry.painted = painted;
      consume?.(painted);
      return painted;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // Without a consumer, an active frame scratch owns the returned bounds.
      if (failed || consume) releaseRenderMetadata(geometry);
    }
  }

  private drawBatch(
    dst: WebglSurface,
    ops: VectorDraw[],
    region: Bounds,
  ): Bounds | null {
    if (this.closed) throw Error("WebGL vector cache is disposed");
    const input = allocateRenderMetadata(
      96 + 8 * ops.length,
      () => [dst.width, dst.height, ops.map((op) => op.layer)],
      false,
      (value) => {
        const layers = value[2];
        if (Array.isArray(layers)) layers.length = 0;
        value.length = 0;
      },
    );
    let id: ManagedMetadataText;
    try {
      id = serializeRenderMetadata(input);
    } finally {
      releaseRenderMetadata(input);
    }
    let key: ManagedMetadataText | undefined, owner: OwnedRaster | undefined;
    let kept = false,
      failed = false;
    try {
      const keyInput = allocateRenderMetadata(
        48,
        () => [ops, this.paintOver.hasBackdrop(dst)],
        false,
        (value) => {
          value.length = 0;
        },
      );
      try {
        key = this.keys.metadata(keyInput);
      } finally {
        releaseRenderMetadata(keyInput);
      }
      const existing = this.state.cached.get(id.value!),
        hit = existing?.entry?.key === key.value;
      if (!hit) {
        if (existing) this.forget(id.value!);
        if (region.right <= region.left || region.bottom <= region.top)
          return null;
        this.resize(this.state.cached.size + 1);
        const signature = key;
        owner = allocateRenderMetadata<OwnedRaster>(
          192,
          () => ({
            entry: {
              key: signature.value!,
              parts: this.paint(dst, ops, region),
            },
            id,
            key: signature,
            removed: false,
          }),
          true,
          (value) => this.destroy(value),
        );
        id.retain();
        key.retain();
      } else {
        owner = existing!;
        this.state.cached.delete(id.value!);
      }
      const entry = owner.entry!,
        size = rasterBytes(entry),
        retained = size <= this.limit;
      if (retained) {
        if (!hit) {
          while (this.bytes + size > this.limit && this.state.cached.size)
            this.forget(this.state.cached.keys().next().value!);
        }
        this.resize(this.state.cached.size + 1);
        if (!hit) this.bytes += size;
        // Keep the actual retained text owner when reinserting a cache hit.
        this.state.cached.set(owner.id.value!, owner);
        kept = true;
      }
      this.paintOver.drawMany(entry.parts, dst);
      return region;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      preserveFailure(failed, () => {
        try {
          if (owner && !kept) this.release(owner);
        } finally {
          if (!owner || owner.id !== id) id.release();
          if (!owner || owner.key !== key) key?.release();
          if (!this.closed) this.resize();
        }
      });
    }
  }

  private clear() {
    if (this.closed) return;
    this.closed = true;
    let failed = false,
      failure: unknown;
    for (const id of this.state.cached.keys())
      try {
        this.forget(id);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    this.state.cached.clear();
    this.bytes = 0;
    if (failed) throw failure;
  }
  dispose() {
    try {
      this.clear();
    } finally {
      releaseRenderMetadata(this.state);
    }
  }
}
