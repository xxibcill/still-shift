import { compositionRootPrefix } from "./prefix.ts";
import { sha256Hex } from "../../browser-checksum.ts";
import {
  executeGraph,
  type RenderBackend,
  type Surface,
  type SurfacePixels,
} from "./backend.ts";
import type { RenderGraph, SurfaceNode } from "./graph.ts";
import {
  compositionSurfaceVisualKey,
  type CompositionSurfaceCacheOptions,
} from "./surface-cache.ts";
import type { PreparedContentKey } from "./webgl-visual-key.ts";

type Entry = { signature: string; pixels: SurfacePixels };
type Counts = {
  role: string;
  name: string;
  phase: "root" | "prefix";
  operations: { kind: string; layer: string }[];
  paints: number;
  restores: number;
  copies: number;
  fallbacks: number;
  paintAndReadbackMs: number;
  copyMs: number;
};

/** Retains the first complete root state in its original native target policy. */
export class CompositionRootCache<S extends Surface> {
  private readonly entries = new Map<string, Entry>();
  private readonly counts = new Map<string, Counts>();
  private retainedBytes = 0;
  private peakPayloadBytes = 0;
  private preparing = false;
  private closed = false;
  private seedPath: string | undefined;
  private readonly originalPrefix: RenderBackend<S>["rootPrefix"];
  private readonly original: RenderBackend<S>["renderRoot"];
  constructor(
    private readonly backend: RenderBackend<S>,
    private readonly options: CompositionSurfaceCacheOptions,
    private readonly contentKey?: PreparedContentKey,
    private readonly prefixLayers: ReadonlySet<string> = new Set(),
  ) {
    if (
      !backend.rootPixels ||
      !/^sha256:[a-f0-9]{64}$/.test(options.scopeKey) ||
      !Number.isSafeInteger(options.byteLimit) ||
      options.byteLimit < 1 ||
      options.byteLimit > 128 * 1024 * 1024
    )
      throw Error("Composition root cache configuration is invalid");
    this.original = backend.renderRoot?.bind(backend);
    this.originalPrefix = backend.rootPrefix?.bind(backend);
    backend.rootPrefix = (node, target, role) => {
      this.assertOpen();
      const prefix = compositionRootPrefix(backend, node, prefixLayers);
      if (prefix) {
        if (this.copy(prefix, target, role + ":prefix"))
          return prefix.ops.length;
        if (!this.preparing) {
          const { path } = this.identity(prefix, target, role + ":prefix");
          const counts = this.counts.get(path);
          if (counts) counts.fallbacks++;
        }
      }
      return this.originalPrefix?.(node, target, role) ?? 0;
    };
    backend.renderRoot = (node, target, draw, role) => {
      this.assertOpen();
      const { path } = this.identity(node, target, role);
      if (this.copy(node, target, role)) return;
      if (!this.preparing) {
        const counts = this.counts.get(path);
        if (counts) counts.fallbacks++;
      }
      if (this.original) this.original(node, target, draw, role);
      else draw();
    };
  }
  private assertOpen() {
    this.options.signal?.throwIfAborted();
    if (this.closed) throw Error("Composition root cache is disposed");
  }
  private identity(node: SurfaceNode, target: S, purpose: string) {
    const { policy, encoding } = this.backend.rootPixels!.identity(target);
    const role = compositionSurfaceVisualKey([purpose, policy]);
    const path = compositionSurfaceVisualKey([
      "original-root",
      node.id,
      node.width,
      node.height,
      role,
      encoding,
      node.ops.map((op) => [op.kind, op.layer]),
    ]);
    const signature = compositionSurfaceVisualKey(
      [this.options.scopeKey, this.backend.version, path, node],
      this.contentKey,
    );
    return { role, path, signature, encoding };
  }
  private copy(node: SurfaceNode, target: S, role: string) {
    const { path, signature } = this.identity(node, target, role);
    const entry = this.entries.get(path);
    if (path === this.seedPath || entry?.signature !== signature) return false;
    const start = performance.now();
    this.backend.rootPixels!.restore(target, entry.pixels);
    const counts = this.counts.get(path)!;
    counts.copyMs += performance.now() - start;
    counts.copies++;
    return true;
  }
  async prepare(graph: RenderGraph, target: S, purpose = "frame") {
    this.assertOpen();
    if (this.preparing)
      throw Error("Composition root preparation must be sequential");
    this.preparing = true;
    try {
      const prefix = compositionRootPrefix(
        this.backend,
        graph.root,
        this.prefixLayers,
      );
      if (prefix)
        await this.prepareNode(
          { ...graph, root: prefix },
          target,
          purpose + ":prefix",
        );
      await this.prepareNode(graph, target, purpose);
    } finally {
      this.preparing = false;
    }
  }
  private async prepareNode(graph: RenderGraph, target: S, purpose: string) {
    const { role, path, signature, encoding } = this.identity(
      graph.root,
      target,
      purpose,
    );
    if (this.entries.has(path)) return;
    const bytes =
      target.width *
      target.height *
      (encoding === "rgba32f-premultiplied" ? 16 : 4);
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      this.entries.size >= 4096 ||
      this.retainedBytes + bytes * 2 > this.options.byteLimit
    )
      throw Error("Composition root pixels exceed the worker byte/entry bound");
    try {
      const identity = {
        path:
          "root:" + (await sha256Hex(new TextEncoder().encode(path).buffer)),
        key:
          "sha256:" +
          (await sha256Hex(new TextEncoder().encode(signature).buffer)),
        width: target.width,
        height: target.height,
        encoding,
      };
      this.assertOpen();
      const claim = await this.options.exchange.claim(identity);
      this.assertOpen();
      const counts: Counts = this.counts.get(path) ?? {
        role,
        name: graph.root.id,
        phase: purpose.endsWith(":prefix") ? "prefix" : "root",
        operations: graph.root.ops.map(({ kind, layer }) => ({ kind, layer })),
        paints: 0,
        restores: 0,
        copies: 0,
        fallbacks: 0,
        paintAndReadbackMs: 0,
        copyMs: 0,
      };
      this.counts.set(path, counts);
      if (claim.kind === "uncached") return;
      let pixels: SurfacePixels;
      if (claim.kind === "hit") {
        if (
          claim.bytes.byteLength !== bytes ||
          claim.bytes.byteOffset !== 0 ||
          claim.bytes.buffer.byteLength !== bytes ||
          "sha256:" + (await sha256Hex(claim.bytes.buffer)) !== claim.checksum
        )
          throw Error(
            "Composition root pixels differ from their checksum or dimensions",
          );
        this.assertOpen();
        pixels = { encoding: identity.encoding, bytes: claim.bytes };
        counts.restores++;
      } else {
        if (claim.byteLength !== bytes)
          throw Error("Composition root lease has incorrect storage size");
        this.backend.rootPixels!.reset();
        const start = performance.now();
        this.seedPath = path;
        executeGraph(this.backend, graph, target, { rootRole: purpose });
        pixels = this.backend.rootPixels!.capture(target);
        if (
          pixels.encoding !== identity.encoding ||
          pixels.bytes.byteLength !== bytes ||
          pixels.bytes.byteOffset !== 0 ||
          pixels.bytes.buffer.byteLength !== bytes
        )
          throw Error(
            "Composition root paint storage differs from its identity",
          );
        counts.paintAndReadbackMs += performance.now() - start;
        counts.paints++;
        const checksum = "sha256:" + (await sha256Hex(pixels.bytes.buffer));
        this.assertOpen();
        await this.options.exchange.publish(claim.token, pixels, checksum);
        this.assertOpen();
      }
      this.entries.set(path, { signature, pixels });
      this.counts.set(path, counts);
      this.retainedBytes += bytes;
      this.peakPayloadBytes = Math.max(this.peakPayloadBytes, bytes);
    } finally {
      this.seedPath = undefined;
    }
  }
  get statistics() {
    return {
      retainedBytes: this.retainedBytes,
      peakPayloadBytes: this.peakPayloadBytes,
      roots: [...this.counts.values()].map((counts) => ({
        ...counts,
        operations: counts.operations.map((operation) => ({ ...operation })),
      })),
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    if (this.original) this.backend.renderRoot = this.original;
    else delete this.backend.renderRoot;
    if (this.originalPrefix) this.backend.rootPrefix = this.originalPrefix;
    else delete this.backend.rootPrefix;
    this.entries.clear();
    this.retainedBytes = 0;
  }
}
