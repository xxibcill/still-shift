import { renderMembers } from "./statistics.ts";
import { compositionRootPrefix } from "./prefix.ts";
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
import {
  executeGraph,
  type RenderBackend,
  type Surface,
  type SurfacePixels,
} from "./backend.ts";
import type { RenderGraph, SurfaceNode } from "./graph.ts";
import {
  compositionSurfaceVisualMetadata,
  type CompositionSurfaceCacheOptions,
} from "./surface-cache.ts";
import type { PreparedContentKey } from "./webgl-visual-key.ts";

type Entry = { signature: ManagedMetadataText; pixels: SurfacePixels };
type Identity = {
  role: ManagedMetadataText;
  path: ManagedMetadataText;
  signature: ManagedMetadataText;
  encoding: SurfacePixels["encoding"];
};
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
type CountOwner = {
  row: Counts;
  role: ManagedMetadataText;
  path: ManagedMetadataText;
};

/** Retains the first complete root state in its original native target policy. */
export class CompositionRootCache<S extends Surface> {
  private readonly state: {
    entries: Map<string, Entry>;
    counts: Map<string, CountOwner>;
  };
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
      options.byteLimit > 2 * 1024 ** 3
    )
      throw Error("Composition root cache configuration is invalid");
    this.original = backend.renderRoot?.bind(backend);
    this.originalPrefix = backend.rootPrefix?.bind(backend);
    this.state = allocateRenderMetadata(
      640,
      () => ({ entries: new Map(), counts: new Map() }),
      false,
      () => this.clear(),
    );
    backend.rootPrefix = (node, target, role) => {
      this.assertOpen();
      const prefix = compositionRootPrefix(backend, node, prefixLayers);
      if (prefix) {
        if (this.copy(prefix, target, role + ":prefix"))
          return prefix.ops.length;
        if (!this.preparing) {
          const identity = this.identity(prefix, target, role + ":prefix");
          try {
            const counts = this.state.counts.get(identity.path.value!);
            if (counts) counts.row.fallbacks++;
          } finally {
            this.releaseIdentity(identity);
          }
        }
      }
      return this.originalPrefix?.(node, target, role) ?? 0;
    };
    backend.renderRoot = (node, target, draw, role) => {
      this.assertOpen();
      const identity = this.identity(node, target, role);
      try {
        if (this.copy(node, target, role)) return;
        if (!this.preparing) {
          const counts = this.state.counts.get(identity.path.value!);
          if (counts) counts.row.fallbacks++;
        }
        if (this.original) this.original(node, target, draw, role);
        else draw();
      } finally {
        this.releaseIdentity(identity);
      }
    };
  }
  private assertOpen() {
    this.options.signal?.throwIfAborted();
    if (this.closed) throw Error("Composition root cache is disposed");
  }
  private identity(node: SurfaceNode, target: S, purpose: string) {
    const { policy, encoding } = this.backend.rootPixels!.identity(target);
    let role: ManagedMetadataText | undefined,
      path: ManagedMetadataText | undefined,
      signature: ManagedMetadataText | undefined;
    let operations: [string, string][] | undefined;
    try {
      role = compositionSurfaceVisualMetadata([purpose, policy]);
      operations = allocateRenderMetadata(32 + node.ops.length * 96, () =>
        node.ops.map((op): [string, string] => [op.kind, op.layer]),
      );
      path = compositionSurfaceVisualMetadata([
        "original-root",
        node.id,
        node.width,
        node.height,
        role.value,
        encoding,
        operations,
      ]);
      signature = compositionSurfaceVisualMetadata(
        [this.options.scopeKey, this.backend.version, path.value, node],
        this.contentKey,
      );
      return allocateRenderMetadata(128, () => ({
        role: role!,
        path: path!,
        signature: signature!,
        encoding,
      }));
    } catch (error) {
      role?.release();
      path?.release();
      signature?.release();
      throw error;
    } finally {
      if (operations) releaseRenderMetadata(operations);
    }
  }
  private releaseIdentity(
    identity: Identity,
    keepCounts = false,
    keepSignature = false,
  ) {
    if (!keepCounts) {
      identity.role.release();
      identity.path.release();
    }
    if (!keepSignature) identity.signature.release();
    releaseRenderMetadata(identity);
  }
  private resize(
    entries = this.state.entries.size,
    counts = this.state.counts.size,
  ) {
    resizeRenderMetadata(this.state, 640 + (entries + counts) * 64);
  }
  private copy(node: SurfaceNode, target: S, role: string) {
    const identity = this.identity(node, target, role);
    try {
      const path = identity.path.value!;
      const entry = this.state.entries.get(path);
      if (
        path === this.seedPath ||
        !entry ||
        entry.signature.value !== identity.signature.value
      )
        return false;
      const start = performance.now();
      const restore = () =>
        this.backend.rootPixels!.restore(target, entry.pixels);
      if (this.backend.statistics)
        this.backend.statistics.measure(
          { stage: "cache-copy", members: renderMembers(node.ops) },
          restore,
        );
      else restore();
      const counts = this.state.counts.get(path)!.row;
      counts.copyMs += performance.now() - start;
      counts.copies++;
      return true;
    } finally {
      this.releaseIdentity(identity);
    }
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
    const originalIdentity = this.identity(graph.root, target, purpose);
    const { encoding } = originalIdentity;
    const path = originalIdentity.path.value!,
      signature = originalIdentity.signature.value!;
    let keepCounts = false,
      keepSignature = false;
    let pixels: SurfacePixels | undefined;
    let pathHash: ManagedMetadataText | undefined,
      signatureHash: ManagedMetadataText | undefined;
    let identity:
      | {
          path: string;
          key: string;
          width: number;
          height: number;
          encoding: SurfacePixels["encoding"];
        }
      | undefined;
    try {
      if (this.state.entries.has(path)) return;
      const bytes =
        target.width *
        target.height *
        (encoding === "rgba32f-premultiplied" ? 16 : 4);
      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 1 ||
        this.state.entries.size >= 4096 ||
        this.retainedBytes + bytes * 2 > this.options.byteLimit
      )
        throw Error(
          "Composition root pixels exceed the worker byte/entry bound",
        );
      pathHash = await hashRenderMetadata(path);
      signatureHash = await hashRenderMetadata(signature);
      identity = allocateRenderMetadata(320, () => ({
        path: "root:" + pathHash!.value!.slice(7),
        key: signatureHash!.value!,
        width: target.width,
        height: target.height,
        encoding,
      }));
      this.assertOpen();
      const claim = await this.options.exchange.claim(identity);
      this.assertOpen();
      let countOwner = this.state.counts.get(path);
      if (!countOwner) {
        this.resize(undefined, this.state.counts.size + 1);
        try {
          countOwner = allocateRenderMetadata<CountOwner>(
            384 + graph.root.ops.length * 104,
            () => ({
              role: originalIdentity.role,
              path: originalIdentity.path,
              row: {
                role: originalIdentity.role.value!,
                name: graph.root.id,
                phase: purpose.endsWith(":prefix") ? "prefix" : "root",
                operations: graph.root.ops.map(({ kind, layer }) => ({
                  kind,
                  layer,
                })),
                paints: 0,
                restores: 0,
                copies: 0,
                fallbacks: 0,
                paintAndReadbackMs: 0,
                copyMs: 0,
              },
            }),
            true,
          );
          originalIdentity.role.retain();
          originalIdentity.path.retain();
          this.state.counts.set(path, countOwner);
          keepCounts = true;
        } catch (error) {
          if (countOwner) releaseRenderMetadata(countOwner);
          try {
            this.resize();
          } catch {
            /* Preserve the allocation error. */
          }
          throw error;
        }
      }
      const counts = countOwner.row;
      if (claim.kind === "uncached") return;
      if (claim.kind === "hit") {
        if (
          claim.bytes.byteLength !== bytes ||
          claim.bytes.byteOffset !== 0 ||
          claim.bytes.buffer.byteLength !== bytes
        )
          throw Error(
            "Composition root pixels differ from their checksum or dimensions",
          );
        const checksum = await hashRenderPixels(claim.bytes.buffer);
        try {
          if (checksum.value !== claim.checksum)
            throw Error(
              "Composition root pixels differ from their checksum or dimensions",
            );
        } finally {
          checksum.release();
        }
        this.assertOpen();
        pixels = allocateRenderMetadata(
          64,
          () => ({ encoding: identity!.encoding, bytes: claim.bytes }),
          true,
        );
        counts.restores++;
      } else {
        if (claim.byteLength !== bytes)
          throw Error("Composition root lease has incorrect storage size");
        this.backend.rootPixels!.reset();
        const start = performance.now();
        this.seedPath = path;
        executeGraph(this.backend, graph, target, {
          rootRole: purpose,
          statisticsPhase: "preparation",
        });
        pixels = allocateRenderMetadata(
          64,
          () => this.backend.rootPixels!.capture(target),
          true,
        );
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
        const checksum = await hashRenderPixels(pixels.bytes.buffer);
        try {
          this.assertOpen();
          await this.options.exchange.publish(
            claim.token,
            pixels,
            checksum.value!,
          );
          this.assertOpen();
        } finally {
          checksum.release();
        }
      }
      this.resize(this.state.entries.size + 1);
      let entry: Entry | undefined;
      try {
        entry = allocateRenderMetadata(
          96,
          () => ({ signature: originalIdentity.signature, pixels: pixels! }),
          true,
        );
        originalIdentity.signature.retain();
        retainRenderPixels(pixels.bytes);
        this.state.entries.set(path, entry);
        keepSignature = true;
      } catch (error) {
        if (entry) releaseRenderMetadata(entry);
        try {
          this.resize();
        } catch {
          /* Preserve the allocation error. */
        }
        throw error;
      }
      this.retainedBytes += bytes;
      this.peakPayloadBytes = Math.max(this.peakPayloadBytes, bytes);
    } finally {
      this.seedPath = undefined;
      if (identity) releaseRenderMetadata(identity);
      pathHash?.release();
      signatureHash?.release();
      if (!keepSignature && pixels) {
        releaseRenderPixels(pixels.bytes);
        releaseRenderMetadata(pixels);
      }
      this.releaseIdentity(originalIdentity, keepCounts, keepSignature);
    }
  }
  get statistics() {
    let bytes = 320;
    for (const { row } of this.state.counts.values()) {
      bytes +=
        384 +
        row.operations.length * 104 +
        2 * (row.role.length + row.name.length);
      for (const operation of row.operations)
        bytes += 2 * (operation.kind.length + operation.layer.length);
    }
    return allocateRenderMetadata(
      bytes,
      () => ({
        retainedBytes: this.retainedBytes,
        peakPayloadBytes: this.peakPayloadBytes,
        roots: [...this.state.counts.values()].map(({ row }) => ({
          ...row,
          operations: row.operations.map((operation) => ({ ...operation })),
        })),
      }),
      false,
      (value) => {
        value.roots.length = 0;
      },
    );
  }
  private clear() {
    if (this.closed) return;
    this.closed = true;
    if (this.original) this.backend.renderRoot = this.original;
    else delete this.backend.renderRoot;
    if (this.originalPrefix) this.backend.rootPrefix = this.originalPrefix;
    else delete this.backend.rootPrefix;
    for (const entry of this.state.entries.values()) {
      releaseRenderPixels(entry.pixels.bytes);
      releaseRenderMetadata(entry.pixels);
      entry.signature.release();
      releaseRenderMetadata(entry);
    }
    this.state.entries.clear();
    for (const count of this.state.counts.values()) {
      count.role.release();
      count.path.release();
      releaseRenderMetadata(count);
    }
    this.state.counts.clear();
    this.retainedBytes = 0;
  }
  dispose() {
    this.clear();
    releaseRenderMetadata(this.state);
  }
}
import {
  retainRenderPixels,
  releaseRenderPixels,
} from "../../managed-memory-context.ts";
