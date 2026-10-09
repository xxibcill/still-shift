import {
  readRenderImageData,
  retainRenderCanvas,
  releaseRenderCanvas,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  hashRenderMetadata,
  hashRenderPixels,
} from "../../managed-metadata-hash.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";
import type { CanvasPixelSource } from "../../canvas-pixel-source.ts";
import {
  compositionSurfaceVisualMetadata,
  type CompositionSurfaceCacheOptions,
} from "./surface-cache.ts";

type SourceCounts = {
  paints: number;
  restores: number;
  reuses: number;
  paintAndReadbackMs: number;
  restoreMs: number;
  uncachedPaints: number;
  uncachedPaintMs: number;
};

type Request = {
  signature: ManagedMetadataText;
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
  private readonly state: {
    entries: Map<
      string,
      { canvas: HTMLCanvasElement; signature: ManagedMetadataText }
    >;
    counts: Map<string, SourceCounts>;
    active: Set<HTMLCanvasElement>;
    pending: Set<PendingSource>;
  };
  private retainedBytes = 0;
  private peakPayloadBytes = 0;
  private closed = false;
  private preparing = false;
  constructor(private readonly options: CompositionSurfaceCacheOptions) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(options.scopeKey) ||
      !Number.isSafeInteger(options.byteLimit) ||
      options.byteLimit < 1 ||
      options.byteLimit > 2 * 1024 ** 3
    )
      throw Error("Composition preparation cache configuration is invalid");
    // Class/state controls plus the original two Maps/two Sets; grow before mutation.
    this.state = allocateRenderMetadata(
      768,
      () => ({
        entries: new Map(),
        counts: new Map(),
        active: new Set(),
        pending: new Set(),
      }),
      false,
      () => this.clear(),
    );
  }
  private resize(
    entries = this.state.entries.size,
    counts = this.state.counts.size,
    active = this.state.active.size,
    pending = this.state.pending.size,
  ) {
    resizeRenderMetadata(
      this.state,
      768 + (entries + counts) * 64 + (active + pending) * 40,
    );
  }
  private drop(canvas: HTMLCanvasElement) {
    releaseRenderCanvas(canvas);
    if (canvas.width || canvas.height) canvas.width = canvas.height = 0;
  }
  private clear() {
    this.closed = true;
    for (const pending of this.state.pending) {
      pending.request.signature.release();
      releaseRenderMetadata(pending);
    }
    this.state.pending.clear();
    for (const canvas of this.state.active) this.drop(canvas);
    this.state.active.clear();
    for (const entry of this.state.entries.values()) {
      entry.signature.release();
      this.drop(entry.canvas);
      releaseRenderMetadata(entry);
    }
    this.state.entries.clear();
    for (const counts of this.state.counts.values())
      releaseRenderMetadata(counts);
    this.state.counts.clear();
    this.retainedBytes = 0;
  }
  readonly read: CanvasPixelSource = (request, paint, restore) => {
    this.assertOpen();
    const signature = compositionSurfaceVisualMetadata([
      "composition-source-pixels-1",
      this.options.scopeKey,
      request,
    ]);
    const entry = this.state.entries.get(signature.value!);
    if (entry) {
      signature.release();
      this.state.counts.get(request.kind)!.reuses++;
      return entry.canvas;
    }
    const bytes = request.width * request.height * 4;
    if (
      !Number.isSafeInteger(bytes) ||
      request.width < 1 ||
      request.height < 1 ||
      !Number.isInteger(request.width) ||
      !Number.isInteger(request.height)
    ) {
      signature.release();
      throw Error(
        "Composition preparation pixels exceed their local byte/entry bound",
      );
    }
    if (
      this.state.entries.size >= 4096 ||
      bytes * 2 + this.retainedBytes > this.options.byteLimit
    ) {
      signature.release();
      if (request.kind !== "glyph-tint")
        throw Error(
          "Composition preparation pixels exceed their local byte/entry bound",
        );
      // A changing tint can use typography's original bounded color cache. Its
      // caller owns this canvas; optional shared capacity never grows to hold it.
      const counts = this.countsFor(request.kind);
      const start = performance.now();
      const canvas = paint();
      counts.uncachedPaintMs += performance.now() - start;
      counts.uncachedPaints++;
      return canvas;
    }
    let pending: PendingSource | undefined;
    try {
      signature.retain();
      this.resize(undefined, undefined, undefined, this.state.pending.size + 1);
      pending = allocateRenderMetadata(
        256,
        () =>
          new PendingSource(this, {
            signature,
            kind: request.kind,
            width: request.width,
            height: request.height,
            paint,
            restore,
          }),
        true,
      );
      this.state.pending.add(pending);
    } catch (error) {
      signature.release();
      if (pending) releaseRenderMetadata(pending);
      try {
        this.resize();
      } catch {
        /* Preserve the original admission error. */
      }
      throw error;
    }
    throw pending;
  };
  private countsFor(kind: string) {
    const existing = this.state.counts.get(kind);
    if (existing) return existing;
    this.resize(undefined, this.state.counts.size + 1);
    let counts: SourceCounts | undefined;
    try {
      counts = allocateRenderMetadata(
        176,
        () => ({
          paints: 0,
          restores: 0,
          reuses: 0,
          paintAndReadbackMs: 0,
          restoreMs: 0,
          uncachedPaints: 0,
          uncachedPaintMs: 0,
        }),
        true,
      );
      this.state.counts.set(kind, counts);
      return counts;
    } catch (error) {
      if (counts) releaseRenderMetadata(counts);
      try {
        this.resize();
      } catch {
        /* Preserve the original allocation error. */
      }
      throw error;
    }
  }
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
    let identity: ManagedMetadataText | undefined;
    let retained = false;
    let failed = false;
    try {
      this.assertOpen();
      const request = error.request;
      const bytes = request.width * request.height * 4;
      identity = await hashRenderMetadata(request.signature.value!);
      const key = identity.value!;
      const body = allocateRenderMetadata(
        416 + request.kind.length * 2,
        () => ({
          path: `source:${request.kind}:${key.slice(7)}`,
          key,
          width: request.width,
          height: request.height,
          encoding: "rgba8-straight" as const,
        }),
      );
      let claim: Awaited<
        ReturnType<CompositionSurfaceCacheOptions["exchange"]["claim"]>
      >;
      try {
        claim = await this.options.exchange.claim(body);
      } finally {
        releaseRenderMetadata(body);
      }
      this.assertOpen();
      const counts = this.countsFor(request.kind);
      let canvas: HTMLCanvasElement;
      if (claim.kind === "uncached")
        throw Error(
          "Immutable composition preparation source changed identity",
        );
      if (claim.kind === "hit") {
        if (
          claim.bytes.byteLength !== bytes ||
          claim.bytes.buffer.byteLength !== bytes
        )
          throw Error(
            "Composition preparation pixels differ from their checksum or dimensions",
          );
        const checksum = await hashRenderPixels(claim.bytes.buffer);
        try {
          if (checksum.value !== claim.checksum)
            throw Error(
              "Composition preparation pixels differ from their checksum or dimensions",
            );
        } finally {
          checksum.release();
        }
        this.assertOpen();
        this.resize(undefined, undefined, this.state.active.size + 1);
        const start = performance.now();
        canvas = request.restore(claim.bytes);
        releaseRenderPixels(claim.bytes);
        counts.restoreMs += performance.now() - start;
        this.state.active.add(canvas);
        counts.restores++;
      } else {
        if (claim.byteLength !== bytes)
          throw Error(
            "Composition preparation lease has incorrect storage size",
          );
        this.resize(undefined, undefined, this.state.active.size + 1);
        const start = performance.now();
        canvas = request.paint();
        this.state.active.add(canvas);
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
        const checksum = await hashRenderPixels(pixels.buffer);
        try {
          this.assertOpen();
          await this.options.exchange.publish(
            claim.token,
            { encoding: "rgba8-straight", bytes: pixels },
            checksum.value!,
          );
          releaseRenderPixels(pixels);
        } finally {
          checksum.release();
        }
      }
      this.assertOpen();
      if (canvas.width !== request.width || canvas.height !== request.height)
        throw Error("Composition preparation restored dimensions differ");
      retainRenderCanvas(canvas);
      this.resize(this.state.entries.size + 1);
      const entry = allocateRenderMetadata(
        96,
        () => ({ canvas, signature: request.signature }),
        true,
      );
      this.state.entries.set(request.signature.value!, entry);
      retained = true;
      this.state.active.delete(canvas);
      this.retainedBytes += bytes;
      this.peakPayloadBytes = Math.max(this.peakPayloadBytes, bytes);
      return true;
    } catch (reason) {
      failed = true;
      for (const canvas of this.state.active) {
        try {
          this.drop(canvas);
        } catch {
          /* Preserve the original preparation error. */
        }
      }
      this.state.active.clear();
      throw reason;
    } finally {
      identity?.release();
      if (!retained) error.request.signature.release();
      this.state.pending.delete(error);
      releaseRenderMetadata(error);
      this.preparing = false;
      if (!failed) this.finishPreparation(ownsScratch === true, memory);
      else {
        try {
          this.finishPreparation(ownsScratch === true, memory);
        } catch {
          /* Preserve the original preparation failure. */
        }
      }
    }
  }
  private finishPreparation(
    ownsScratch: boolean,
    memory: ReturnType<typeof renderMemory>,
  ) {
    try {
      this.resize();
    } finally {
      if (ownsScratch && memory?.hasScratch) memory.endScratch();
    }
  }
  get statistics() {
    return allocateRenderMetadata(
      192 + this.state.counts.size * 256,
      () => ({
        retainedCanvasBytes: this.retainedBytes,
        peakPayloadBytes: this.peakPayloadBytes,
        sources: [...this.state.counts].map(([kind, counts]) => ({
          kind,
          ...counts,
        })),
      }),
      false,
      (value) => {
        value.sources.length = 0;
      },
    );
  }
  dispose() {
    if (this.closed) return;
    this.clear();
    releaseRenderMetadata(this.state);
  }
}
