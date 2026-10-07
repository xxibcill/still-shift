import {
  allocateRenderPixels,
  releaseRenderPixels,
  retainRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import type { Bounds } from "../evaluate/types.ts";

type Pending = { bounds: Bounds | undefined };
type ReadbackState = {
  pixels: Uint8ClampedArray | undefined;
  pending: Pending | null | undefined;
};
/** Retain GPU-produced bytes and refresh every region written since the previous read. */
export class WebglReadback {
  private readonly state: ReadbackState;
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly readFull: () => Uint8ClampedArray,
    private readonly readRegion: (
      region: Bounds,
    ) => Uint8Array | Uint8ClampedArray,
    private readonly limit = 64 * 1024 * 1024,
    private readonly regionRows: "top-down" | "bottom-up" = "top-down",
  ) {
    const memory = renderMemory();
    this.state = allocateRenderMetadata<ReadbackState>(
      192,
      () => ({ pixels: undefined, pending: undefined }),
      false,
      (state) => {
        try {
          if (state.pixels) memory?.release(state.pixels.buffer);
        } finally {
          state.pixels = undefined;
          if (state.pending) releaseRenderMetadata(state.pending);
          state.pending = undefined;
        }
      },
    );
  }
  private clearPending(value: null | undefined) {
    if (this.state.pending) releaseRenderMetadata(this.state.pending);
    this.state.pending = value;
  }

  changed(region?: Bounds | null) {
    if (region === null) return;
    if (region === undefined) {
      this.clearPending(undefined);
      return;
    }
    if (this.state.pending === undefined) return;
    const box = allocateRenderMetadata(64, () => ({
      left: Math.max(0, Math.floor(region.left)),
      top: Math.max(0, Math.floor(region.top)),
      right: Math.min(this.width, Math.ceil(region.right)),
      bottom: Math.min(this.height, Math.ceil(region.bottom)),
    }));
    try {
      if (box.right <= box.left || box.bottom <= box.top) return;
      const old = this.state.pending?.bounds;
      const next = allocateRenderMetadata<Pending>(
        128,
        () => ({
          bounds: old
            ? {
                left: Math.min(old.left, box.left),
                top: Math.min(old.top, box.top),
                right: Math.max(old.right, box.right),
                bottom: Math.max(old.bottom, box.bottom),
              }
            : box,
        }),
        true,
        (value) => {
          value.bounds = undefined;
        },
      );
      if (this.state.pending) releaseRenderMetadata(this.state.pending);
      this.state.pending = next;
    } finally {
      releaseRenderMetadata(box);
    }
  }

  dispose() {
    releaseRenderMetadata(this.state);
    releaseRenderPixels(this.state.pixels);
    this.state.pixels = undefined;
    this.clearPending(undefined);
  }

  read() {
    if (this.width * this.height * 4 > this.limit) return this.readFull();
    if (!this.state.pixels || this.state.pending === undefined) {
      releaseRenderPixels(this.state.pixels);
      this.state.pixels = undefined;
      const pixels = this.readFull();
      retainRenderPixels(pixels);
      this.state.pixels = pixels;
    } else if (this.state.pending) {
      const rect = this.state.pending.bounds!,
        pixels = this.readRegion(rect),
        stride = (rect.right - rect.left) * 4;
      try {
        for (let row = 0; row < rect.bottom - rect.top; row++) {
          const sourceRow =
            this.regionRows === "bottom-up"
              ? rect.bottom - rect.top - row - 1
              : row;
          const view = allocateRenderMetadata(128, () => ({}));
          try {
            this.state.pixels.set(
              pixels.subarray(sourceRow * stride, (sourceRow + 1) * stride),
              ((rect.top + row) * this.width + rect.left) * 4,
            );
          } finally {
            releaseRenderMetadata(view);
          }
        }
      } finally {
        releaseRenderPixels(pixels);
      }
    }
    this.clearPending(null);
    // Callers own their returned bytes, including across later incremental updates.
    return allocateRenderPixels(this.state.pixels.byteLength, () =>
      this.state.pixels!.slice(),
    );
  }
}
