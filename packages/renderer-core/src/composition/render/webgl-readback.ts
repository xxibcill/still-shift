import type { Bounds } from "../evaluate/types.ts";

/** Retain GPU-produced bytes and refresh every region written since the previous read. */
export class WebglReadback {
  private pixels: Uint8ClampedArray | undefined;
  private pending: Bounds | null | undefined;
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly readFull: () => Uint8ClampedArray,
    private readonly readRegion: (region: Bounds) => Uint8Array,
    private readonly limit = 64 * 1024 * 1024,
  ) {}

  changed(region?: Bounds | null) {
    if (region === null) return;
    if (region === undefined) {
      this.pending = undefined;
      return;
    }
    if (this.pending === undefined) return;
    const box = {
      left: Math.max(0, Math.floor(region.left)),
      top: Math.max(0, Math.floor(region.top)),
      right: Math.min(this.width, Math.ceil(region.right)),
      bottom: Math.min(this.height, Math.ceil(region.bottom)),
    };
    if (box.right <= box.left || box.bottom <= box.top) return;
    const old = this.pending;
    this.pending = old
      ? {
          left: Math.min(old.left, box.left),
          top: Math.min(old.top, box.top),
          right: Math.max(old.right, box.right),
          bottom: Math.max(old.bottom, box.bottom),
        }
      : box;
  }

  dispose() {
    this.pixels = undefined;
    this.pending = undefined;
  }

  read() {
    if (this.width * this.height * 4 > this.limit) return this.readFull();
    if (!this.pixels || this.pending === undefined)
      this.pixels = this.readFull();
    else if (this.pending) {
      const rect = this.pending,
        pixels = this.readRegion(rect),
        stride = (rect.right - rect.left) * 4;
      for (let row = 0; row < rect.bottom - rect.top; row++)
        this.pixels.set(
          pixels.subarray(row * stride, (row + 1) * stride),
          ((rect.top + row) * this.width + rect.left) * 4,
        );
    }
    this.pending = null;
    // Callers own their returned bytes, including across later incremental updates.
    return this.pixels.slice();
  }
}
