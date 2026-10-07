import {
  allocateRenderPixels,
  releaseRenderPixels,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import type { Matrix } from "../../node-transform.ts";
import type { Rgba } from "../evaluate/types.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

export type WebglRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type Rect = WebglRect;
type Entry = { rect: Rect | null | undefined };
type BoundsState = {
  bounds: WeakMap<WebglSurface, Entry> | undefined;
  entries: Set<Entry>;
  background: number | undefined;
};
/** Conservative painted bounds allow readback to omit an unchanged clear color. */
export class WebglBounds {
  private readonly state: BoundsState;
  constructor(private readonly root: WebglSurface) {
    this.state = allocateRenderMetadata<BoundsState>(
      512,
      () => ({
        bounds: new WeakMap(),
        entries: new Set(),
        background: undefined,
      }),
      false,
      (value) => {
        value.bounds = undefined;
        value.background = undefined;
        for (const entry of value.entries) releaseRenderMetadata(entry);
        value.entries.clear();
      },
    );
  }
  private write(surface: WebglSurface, factory: () => Rect | null) {
    const map = this.state.bounds;
    if (!map) throw Error("WebGL framebuffer bounds are disposed");
    const prior = map.get(surface);
    resizeRenderMetadata(
      this.state,
      512 + 80 * (this.state.entries.size + (prior ? 0 : 1)),
    );
    let failed = false,
      entry: Entry | undefined,
      committed = false;
    try {
      entry = allocateRenderMetadata<Entry>(
        160,
        () => ({ rect: factory() }),
        true,
        (value) => {
          value.rect = undefined;
        },
      );
      map.set(surface, entry);
      if (prior) this.state.entries.delete(prior);
      this.state.entries.add(entry);
      committed = true;
      if (prior) releaseRenderMetadata(prior);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (entry && !committed) releaseRenderMetadata(entry);
      if (!failed)
        resizeRenderMetadata(this.state, 512 + 80 * this.state.entries.size);
      else
        try {
          resizeRenderMetadata(this.state, 512 + 80 * this.state.entries.size);
        } catch {
          /* Preserve the original bounds producer failure. */
        }
    }
  }
  dispose() {
    const state = this.state;
    state.bounds = undefined;
    state.background = undefined;
    for (const entry of state.entries) releaseRenderMetadata(entry);
    state.entries.clear();
    releaseRenderMetadata(state);
  }
  clear(surface: WebglSurface, color: Rgba | null) {
    this.write(surface, () => {
      if (surface !== this.root)
        return color && color[3] > 0
          ? { left: 0, top: 0, right: surface.width, bottom: surface.height }
          : null;
      const temporary = allocateRenderMetadata(512, () => ({}));
      try {
        const alpha = color?.[3] ?? 0;
        const bytes = allocateRenderPixels(
          4,
          () =>
            new Uint8Array([
              ...(color ?? [0, 0, 0, 0])
                .slice(0, 3)
                .map((v) =>
                  Math.round(Math.max(0, Math.min(1, v * alpha)) * 255),
                ),
              surface.opaque ? 255 : Math.round(alpha * 255),
            ]),
        );
        try {
          this.state.background = new Uint32Array(bytes.buffer)[0]!;
        } finally {
          releaseRenderPixels(bytes);
        }
        return null;
      } finally {
        releaseRenderMetadata(temporary);
      }
    });
  }
  release(surface: WebglSurface) {
    const entry = this.state.bounds?.get(surface);
    this.state.bounds?.delete(surface);
    if (entry) {
      this.state.entries.delete(entry);
      releaseRenderMetadata(entry);
      resizeRenderMetadata(this.state, 512 + 80 * this.state.entries.size);
    }
  }
  full(surface: WebglSurface) {
    this.write(surface, () => ({
      left: 0,
      top: 0,
      right: surface.width,
      bottom: surface.height,
    }));
  }
  snapshot(surface: WebglSurface) {
    return this.state.bounds?.get(surface)?.rect ?? null;
  }
  region(surface: WebglSurface) {
    return surface.opaque ? undefined : this.state.bounds?.get(surface)?.rect;
  }
  blur(surface: WebglSurface, radius: number) {
    const rect = this.region(surface);
    if (rect === undefined) this.full(surface);
    else if (rect) {
      const expanded = allocateRenderMetadata(64, () => ({
        left: rect.left - radius,
        top: rect.top - radius,
        right: rect.right + radius,
        bottom: rect.bottom + radius,
      }));
      try {
        this.include(surface, expanded);
      } finally {
        releaseRenderMetadata(expanded);
      }
    }
  }

  clearColor(surface: WebglSurface) {
    return surface === this.root ? this.state.background : undefined;
  }
  include(surface: WebglSurface, rect: Rect | null) {
    if (!rect) return;
    const prior = this.state.bounds?.get(surface)?.rect;
    const next = allocateRenderMetadata(64, () => ({
      left: Math.max(0, Math.floor(rect.left)),
      top: Math.max(0, Math.floor(rect.top)),
      right: Math.min(surface.width, Math.ceil(rect.right)),
      bottom: Math.min(surface.height, Math.ceil(rect.bottom)),
    }));
    try {
      if (next.right <= next.left || next.bottom <= next.top) return;
      this.write(surface, () =>
        prior
          ? {
              left: Math.min(prior.left, next.left),
              top: Math.min(prior.top, next.top),
              right: Math.max(prior.right, next.right),
              bottom: Math.max(prior.bottom, next.bottom),
            }
          : next,
      );
    } finally {
      releaseRenderMetadata(next);
    }
  }
  draw(surface: WebglSurface, matrix: Matrix, width: number, height: number) {
    const rect = allocateRenderMetadata(64, () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    }));
    try {
      this.transform(surface, rect, matrix);
    } finally {
      releaseRenderMetadata(rect);
    }
  }
  composite(source: WebglSurface, dst: WebglSurface, matrix: Matrix) {
    if (source.opaque) {
      this.draw(dst, matrix, source.width, source.height);
      return;
    }
    if (!this.state.bounds?.has(source)) {
      this.full(dst);
      return;
    }
    this.transform(dst, this.snapshot(source), matrix);
  }
  transform(surface: WebglSurface, rect: Rect | null, matrix: Matrix) {
    if (!rect) return;
    const temporary = allocateRenderMetadata<{
      points: number[][] | undefined;
    }>(
      896,
      () => ({ points: undefined }),
      false,
      (value) => {
        if (value.points) {
          for (const point of value.points) point.length = 0;
          value.points.length = 0;
        }
        value.points = undefined;
      },
    );
    try {
      const points = (temporary.points = [
        [rect.left, rect.top],
        [rect.right, rect.top],
        [rect.right, rect.bottom],
        [rect.left, rect.bottom],
      ].map(([x, y]) => [
        matrix[0] * x! + matrix[2] * y! + matrix[4],
        matrix[1] * x! + matrix[3] * y! + matrix[5],
      ]));
      this.include(surface, {
        left: Math.min(...points.map((p) => p[0]!)) - 2,
        top: Math.min(...points.map((p) => p[1]!)) - 2,
        right: Math.max(...points.map((p) => p[0]!)) + 2,
        bottom: Math.max(...points.map((p) => p[1]!)) + 2,
      });
    } finally {
      releaseRenderMetadata(temporary);
    }
  }

  read(device: WebglDevice, surface: WebglSurface) {
    if (
      !surface.opaque ||
      surface !== this.root ||
      this.state.background === undefined
    )
      return undefined;
    const rect = this.snapshot(surface);
    if (
      rect &&
      (rect.right - rect.left) * (rect.bottom - rect.top) >
        surface.width * surface.height * 0.75
    )
      return undefined;
    const result = allocateRenderPixels(
      surface.width * surface.height * 4,
      () => new Uint8ClampedArray(surface.width * surface.height * 4),
    );
    try {
      const fillView = allocateRenderMetadata(128, () => ({}));
      try {
        new Uint32Array(result.buffer).fill(this.state.background);
      } finally {
        releaseRenderMetadata(fillView);
      }
      if (rect) {
        const width = rect.right - rect.left,
          height = rect.bottom - rect.top;
        const pixels = device.readRegion(
          surface,
          rect.left,
          rect.top,
          width,
          height,
        );
        try {
          for (let y = 0; y < height; y++) {
            const rowView = allocateRenderMetadata(128, () => ({}));
            try {
              result.set(
                pixels.subarray(y * width * 4, (y + 1) * width * 4),
                ((rect.top + y) * surface.width + rect.left) * 4,
              );
            } finally {
              releaseRenderMetadata(rowView);
            }
          }
        } finally {
          releaseRenderPixels(pixels);
        }
      }
      return result;
    } catch (error) {
      releaseRenderPixels(result);
      throw error;
    }
  }
}
