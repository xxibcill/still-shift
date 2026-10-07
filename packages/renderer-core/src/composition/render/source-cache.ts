import {
  readRenderImageData,
  retainRenderCanvas,
  releaseRenderCanvas,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import { sha256Hex } from "../../browser-checksum.ts";
import type { CanvasPixelSource } from "../../canvas-pixel-source.ts";
import {
  compositionSurfaceVisualKey,
  type CompositionSurfaceCacheOptions,
} from "./surface-cache.ts";

type Request = {
  signature: string;
  kind: string;
  width: number;
  height: number;
  paint: () => HTMLCanvasElement;
  restore: (pixels: Uint8Array<ArrayBuffer>) => HTMLCanvasElement;
};
class PendingSource {
  constructor(
    readonly owner: CompositionSourceCache,
    readonly request: Request,
  ) {}
}

/** Async rendezvous around unchanged synchronous preparation kernels. */
export class CompositionSourceCache {
  private readonly entries = new Map<string, HTMLCanvasElement>();
  private readonly counts = new Map<
    string,
    {
      paints: number;
      restores: number;
      reuses: number;
      paintAndReadbackMs: number;
      restoreMs: number;
    }
  >();
  private retainedBytes = 0;
  private peakPayloadBytes = 0;
  private closed = false;
  private preparing = false;
  private readonly active = new Set<HTMLCanvasElement>();
  constructor(private readonly options: CompositionSurfaceCacheOptions) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(options.scopeKey) ||
      !Number.isSafeInteger(options.byteLimit) ||
      options.byteLimit < 1 ||
      options.byteLimit > 128 * 1024 * 1024
    )
      throw Error("Composition preparation cache configuration is invalid");
  }
  readonly read: CanvasPixelSource = (request, paint, restore) => {
    this.assertOpen();
    const signature = compositionSurfaceVisualKey([
      "composition-source-pixels-1",
      this.options.scopeKey,
      request,
    ]);
    const entry = this.entries.get(signature);
    if (entry) {
      this.counts.get(request.kind)!.reuses++;
      return entry;
    }
    const bytes = request.width * request.height * 4;
    if (
      !Number.isSafeInteger(bytes) ||
      request.width < 1 ||
      request.height < 1 ||
      !Number.isInteger(request.width) ||
      !Number.isInteger(request.height) ||
      this.entries.size >= 4096 ||
      bytes * 2 + this.retainedBytes > this.options.byteLimit
    )
      throw Error(
        "Composition preparation pixels exceed their local byte/entry bound",
      );
    throw new PendingSource(this, {
      signature,
      kind: request.kind,
      width: request.width,
      height: request.height,
      paint,
      restore,
    });
  };
  private assertOpen() {
    this.options.signal?.throwIfAborted();
    if (this.closed) throw Error("Composition preparation cache is disposed");
  }
  /** False identifies an original preparation error, which the caller must preserve. */
  async prepare(error: unknown): Promise<boolean> {
    if (!(error instanceof PendingSource) || error.owner !== this) return false;
    if (this.preparing)
      throw Error("Composition preparation is already running");
    this.preparing = true;
    const memory = renderMemory();
    const ownsScratch = memory && !memory.hasScratch;
    if (ownsScratch) memory.beginScratch();
    try {
      this.assertOpen();
      const request = error.request;
      const bytes = request.width * request.height * 4;
      const key =
        "sha256:" +
        (await sha256Hex(new TextEncoder().encode(request.signature).buffer));
      const claim = await this.options.exchange.claim({
        path: `source:${request.kind}:${key.slice(7)}`,
        key,
        width: request.width,
        height: request.height,
        encoding: "rgba8-straight",
      });
      this.assertOpen();
      const counts = this.counts.get(request.kind) ?? {
        paints: 0,
        restores: 0,
        reuses: 0,
        paintAndReadbackMs: 0,
        restoreMs: 0,
      };
      this.counts.set(request.kind, counts);
      let canvas: HTMLCanvasElement;
      if (claim.kind === "uncached")
        throw Error(
          "Immutable composition preparation source changed identity",
        );
      if (claim.kind === "hit") {
        if (
          claim.bytes.byteLength !== bytes ||
          claim.bytes.buffer.byteLength !== bytes ||
          "sha256:" + (await sha256Hex(claim.bytes.buffer)) !== claim.checksum
        )
          throw Error(
            "Composition preparation pixels differ from their checksum or dimensions",
          );
        this.assertOpen();
        const start = performance.now();
        canvas = request.restore(claim.bytes);
        releaseRenderPixels(claim.bytes);
        counts.restoreMs += performance.now() - start;
        this.active.add(canvas);
        counts.restores++;
      } else {
        if (claim.byteLength !== bytes)
          throw Error(
            "Composition preparation lease has incorrect storage size",
          );
        const start = performance.now();
        canvas = request.paint();
        this.active.add(canvas);
        if (canvas.width !== request.width || canvas.height !== request.height)
          throw Error("Composition preparation paint dimensions differ");
        const context = canvas.getContext("2d");
        if (!context) throw Error("Canvas 2D is unavailable");
        const pixels = new Uint8Array(
          readRenderImageData(
            context,
            0,
            0,
            request.width,
            request.height,
          ).data.buffer,
        );
        counts.paintAndReadbackMs += performance.now() - start;
        counts.paints++;
        const checksum = "sha256:" + (await sha256Hex(pixels.buffer));
        this.assertOpen();
        await this.options.exchange.publish(
          claim.token,
          { encoding: "rgba8-straight", bytes: pixels },
          checksum,
        );
        releaseRenderPixels(pixels);
      }
      this.assertOpen();
      if (canvas.width !== request.width || canvas.height !== request.height)
        throw Error("Composition preparation restored dimensions differ");
      this.entries.set(request.signature, canvas);
      retainRenderCanvas(canvas);
      this.active.delete(canvas);
      this.retainedBytes += bytes;
      this.peakPayloadBytes = Math.max(this.peakPayloadBytes, bytes);
      return true;
    } catch (reason) {
      for (const canvas of this.active) {
        canvas.width = canvas.height = 0;
        releaseRenderCanvas(canvas);
      }
      this.active.clear();
      throw reason;
    } finally {
      this.preparing = false;
      if (ownsScratch) memory.endScratch();
    }
  }
  get statistics() {
    return {
      retainedCanvasBytes: this.retainedBytes,
      peakPayloadBytes: this.peakPayloadBytes,
      sources: [...this.counts].map(([kind, counts]) => ({ kind, ...counts })),
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const canvas of this.active) {
      canvas.width = canvas.height = 0;
      releaseRenderCanvas(canvas);
    }
    this.active.clear();
    for (const canvas of this.entries.values()) {
      canvas.width = canvas.height = 0;
      releaseRenderCanvas(canvas);
    }
    this.entries.clear();
    this.retainedBytes = 0;
  }
}
