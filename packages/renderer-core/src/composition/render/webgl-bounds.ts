import type { Matrix } from "../../node-transform.ts";
import type { Rgba } from "../evaluate/types.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

type Rect = { left: number; top: number; right: number; bottom: number };
/** Conservative painted bounds allow readback to omit an unchanged clear color. */
export class WebglBounds {
  private readonly bounds = new WeakMap<WebglSurface, Rect | null>();
  private background: number | undefined;
  constructor(private readonly root: WebglSurface) {}
  clear(surface: WebglSurface, color: Rgba | null) {
    if (surface === this.root) {
      const alpha = color?.[3] ?? 0;
      const bytes = new Uint8Array([
        ...(color ?? [0, 0, 0, 0])
          .slice(0, 3)
          .map((v) => Math.round(Math.max(0, Math.min(1, v * alpha)) * 255)),
        255,
      ]);
      this.background = new Uint32Array(bytes.buffer)[0]!;
      this.bounds.set(surface, null);
    } else
      this.bounds.set(
        surface,
        color && color[3] > 0
          ? { left: 0, top: 0, right: surface.width, bottom: surface.height }
          : null,
      );
  }
  release(surface: WebglSurface) {
    this.bounds.delete(surface);
  }
  full(surface: WebglSurface) {
    this.bounds.set(surface, {
      left: 0,
      top: 0,
      right: surface.width,
      bottom: surface.height,
    });
  }
  snapshot(surface: WebglSurface) {
    return this.bounds.get(surface) ?? null;
  }
  clearColor(surface: WebglSurface) {
    return surface === this.root ? this.background : undefined;
  }
  present(device: WebglDevice) {
    const rect = this.snapshot(this.root);
    if (
      this.background === undefined ||
      !rect ||
      (rect.right - rect.left) * (rect.bottom - rect.top) >
        this.root.width * this.root.height * 0.75
    ) {
      device.present(this.root);
      return;
    }
    device.present(
      this.root,
      rect,
      new Uint8Array(new Uint32Array([this.background]).buffer),
    );
  }
  include(surface: WebglSurface, rect: Rect | null) {
    if (!rect) return;
    const prior = this.bounds.get(surface);
    const next = {
      left: Math.max(0, Math.floor(rect.left)),
      top: Math.max(0, Math.floor(rect.top)),
      right: Math.min(surface.width, Math.ceil(rect.right)),
      bottom: Math.min(surface.height, Math.ceil(rect.bottom)),
    };
    if (next.right <= next.left || next.bottom <= next.top) return;
    this.bounds.set(
      surface,
      prior
        ? {
            left: Math.min(prior.left, next.left),
            top: Math.min(prior.top, next.top),
            right: Math.max(prior.right, next.right),
            bottom: Math.max(prior.bottom, next.bottom),
          }
        : next,
    );
  }
  draw(surface: WebglSurface, matrix: Matrix, width: number, height: number) {
    this.transform(
      surface,
      { left: 0, top: 0, right: width, bottom: height },
      matrix,
    );
  }
  composite(source: WebglSurface, dst: WebglSurface, matrix: Matrix) {
    if (!this.bounds.has(source)) {
      this.full(dst);
      return;
    }
    this.transform(dst, this.snapshot(source), matrix);
  }
  private transform(surface: WebglSurface, rect: Rect | null, matrix: Matrix) {
    if (!rect) return;
    const points = [
      [rect.left, rect.top],
      [rect.right, rect.top],
      [rect.right, rect.bottom],
      [rect.left, rect.bottom],
    ].map(([x, y]) => [
      matrix[0] * x! + matrix[2] * y! + matrix[4],
      matrix[1] * x! + matrix[3] * y! + matrix[5],
    ]);
    this.include(surface, {
      left: Math.min(...points.map((p) => p[0]!)) - 2,
      top: Math.min(...points.map((p) => p[1]!)) - 2,
      right: Math.max(...points.map((p) => p[0]!)) + 2,
      bottom: Math.max(...points.map((p) => p[1]!)) + 2,
    });
  }
  read(device: WebglDevice, surface: WebglSurface) {
    if (surface !== this.root || this.background === undefined)
      return undefined;
    const rect = this.snapshot(surface);
    if (
      rect &&
      (rect.right - rect.left) * (rect.bottom - rect.top) >
        surface.width * surface.height * 0.75
    )
      return undefined;
    const result = new Uint8ClampedArray(surface.width * surface.height * 4);
    new Uint32Array(result.buffer).fill(this.background);
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
      for (let y = 0; y < height; y++)
        result.set(
          pixels.subarray(y * width * 4, (y + 1) * width * 4),
          ((rect.top + y) * surface.width + rect.left) * 4,
        );
    }
    return result;
  }
}
