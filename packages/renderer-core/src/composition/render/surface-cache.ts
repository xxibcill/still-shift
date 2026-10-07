import {
  hashRenderMetadata,
  hashRenderPixels,
} from "../../managed-metadata-hash.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  serializeRenderMetadata,
  sortedMetadataObject,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";
import {
  executeGraph,
  type RenderBackend,
  type Surface,
  type SurfaceEncoding,
  type SurfacePixels,
} from "./backend.ts";
import type { IsolateOp, RenderGraph, RenderOp, SurfaceNode } from "./graph.ts";
import { requireSpatialCapabilities } from "./spatial-capabilities.ts";
import {
  preparedVisualState,
  type PreparedContentKey,
} from "./webgl-visual-key.ts";

export type CompositionSurfaceIdentity = {
  path: string;
  key: string;
  width: number;
  height: number;
  encoding: SurfaceEncoding;
};
export type CompositionSurfaceClaim =
  | { kind: "lease"; token: string; byteLength: number }
  | { kind: "hit"; bytes: Uint8Array<ArrayBuffer>; checksum: string }
  | { kind: "uncached" };
export type CompositionSurfaceExchange = {
  claim(identity: CompositionSurfaceIdentity): Promise<CompositionSurfaceClaim>;
  publish(
    token: string,
    pixels: SurfacePixels,
    checksum: string,
  ): Promise<void>;
};
export type CompositionSurfaceCacheOptions = {
  /** Hash of the captured document, prepared resources and pinned render environment. */
  scopeKey: string;
  byteLimit: number;
  exchange: CompositionSurfaceExchange;
  signal?: AbortSignal;
};

type Candidate = {
  kind: "surface" | "isolate";
  name: string;
  width: number;
  height: number;
  colorSpace: "srgb" | "linear-srgb";
  value: SurfaceNode | IsolateOp;
};
type Entry<S> = {
  path: ManagedMetadataText;
  signature: ManagedMetadataText;
  surface: S;
  users: number;
  bytes: number;
  released: boolean;
};
type CandidateIdentity = {
  path: ManagedMetadataText;
  signature: ManagedMetadataText;
  retained: boolean;
};
type SurfaceCounts = {
  kind: Candidate["kind"];
  name: string;
  paints: number;
  restores: number;
  reuses: number;
};
const checksumPattern = /^sha256:[a-f0-9]{64}$/;
const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

/** Definitions are serialized in full, so keys never depend on a page's visit order. */
export function compositionSurfaceVisualKey(
  value: unknown,
  key?: PreparedContentKey,
) {
  return JSON.stringify(value, visualReplacer(key));
}
export function compositionSurfaceVisualMetadata(
  value: unknown,
  key?: PreparedContentKey,
) {
  return serializeRenderMetadata(value, visualReplacer(key));
}
function visualReplacer(key?: PreparedContentKey) {
  return (_property: string, item: unknown) => {
    const normalized = preparedVisualState(item, key);
    if (
      normalized === null ||
      typeof normalized !== "object" ||
      Array.isArray(normalized)
    )
      return normalized;
    return sortedMetadataObject(normalized);
  };
}

function candidatePath(candidate: Candidate) {
  return serializeRenderMetadata([
    candidate.kind,
    candidate.name,
    candidate.width,
    candidate.height,
    candidate.colorSpace,
  ]);
}
function candidateState(candidate: Candidate) {
  if (candidate.kind === "surface") return candidate.value;
  const op = candidate.value as IsolateOp;
  return allocateRenderMetadata(80, () => [
    op.ops,
    op.effects,
    op.masks,
    op.matte,
    op.lighting ?? null,
  ]);
}

/** Dependency-first order prevents pages from holding a parent lease while awaiting a child. */
function* independentSurfaces(graph: RenderGraph): Generator<Candidate> {
  const state = allocateRenderMetadata(
    384,
    () => ({ visited: new Set<object>(), active: new Set<object>() }),
    false,
    (value) => {
      value.visited.clear();
      value.active.clear();
    },
  );
  const { visited, active } = state;
  let capacity = 384;
  const add = (set: Set<object>, value: object) => {
    capacity = Math.max(capacity, 384 + 40 * (visited.size + active.size + 1));
    resizeRenderMetadata(state, capacity);
    set.add(value);
  };
  const colorSpace = graph.root.colorSpace ?? "srgb";
  function* surface(node: SurfaceNode): Generator<Candidate> {
    if (active.has(node)) throw Error("Composition surface dependency cycle");
    if (visited.has(node)) return;
    add(active, node);
    yield* operations(node.ops, node.width, node.height);
    active.delete(node);
    add(visited, node);
    yield allocateRenderMetadata(160, () => ({
      kind: "surface" as const,
      name: node.id,
      width: node.width,
      height: node.height,
      colorSpace,
      value: node,
    }));
  }
  function* operations(
    ops: RenderOp[],
    width: number,
    height: number,
  ): Generator<Candidate> {
    if (active.has(ops)) throw Error("Composition operation dependency cycle");
    add(active, ops);
    try {
      for (const op of ops) {
        if (op.kind === "draw") {
          if (op.content.type === "surface") yield* surface(op.content.surface);
          continue;
        }
        if (op.kind === "project") yield* surface(op.surface);
        if (op.kind === "isolate") yield* operations(op.ops, width, height);
        if (op.kind === "adjust")
          for (const sample of op.history ?? [])
            yield* operations(sample.ops, width, height);
        const effectWidth =
          op.kind === "project" ? width + (op.focusPadding ?? 0) * 2 : width;
        const effectHeight =
          op.kind === "project" ? height + (op.focusPadding ?? 0) * 2 : height;
        for (const effect of op.effects) {
          let count = 0;
          for (const property in effect.layerInputs)
            if (Object.hasOwn(effect.layerInputs!, property)) count++;
          const inputs = allocateRenderMetadata(32 + count * 8, () =>
            Object.values(effect.layerInputs ?? {}),
          );
          try {
            for (const input of inputs)
              yield* operations(input, effectWidth, effectHeight);
          } finally {
            releaseRenderMetadata(inputs);
          }
        }
        if (op.matte) yield* operations(op.matte.ops, width, height);
        if (op.kind === "isolate")
          yield allocateRenderMetadata(160, () => ({
            kind: "isolate" as const,
            name: op.layer,
            width,
            height,
            colorSpace,
            value: op,
          }));
      }
    } finally {
      active.delete(ops);
    }
  }
  try {
    yield* operations(graph.root.ops, graph.root.width, graph.root.height);
  } finally {
    releaseRenderMetadata(state);
  }
}

/** Shares only existing independent surfaces. Ordinary direct drawing retains its native boundaries. */
export class CompositionSurfaceCache<S extends Surface> {
  private readonly state: {
    entries: Map<string, Entry<S>>;
    owned: Map<S, Entry<S>>;
    counts: Map<string, SurfaceCounts>;
  };
  private readonly release: (surface: S) => void;
  private readonly renderIsolate: RenderBackend<S>["renderIsolate"];
  private seeding:
    | { path: string; signature: string; entry?: Entry<S> }
    | undefined;
  private retainedBytes = 0;
  private peakTransferBytes = 0;
  private paints = 0;
  private restores = 0;
  private reuse = 0;
  private paintAndReadbackMs = 0;
  private closed = false;
  private preparing = false;
  constructor(
    private readonly backend: RenderBackend<S>,
    private readonly options: CompositionSurfaceCacheOptions,
    private readonly contentKey?: PreparedContentKey,
    private readonly colorSpace: "srgb" | "linear-srgb" = "srgb",
  ) {
    if (
      !checksumPattern.test(options.scopeKey) ||
      !Number.isSafeInteger(options.byteLimit) ||
      options.byteLimit < 1 ||
      options.byteLimit > 128 * 1024 * 1024 ||
      !backend.captureSurface ||
      !backend.restoreSurface ||
      !backend.surfaceEncoding
    )
      throw Error("Composition surface cache configuration is invalid");
    this.release = backend.releaseSurface.bind(backend);
    this.renderIsolate = backend.renderIsolate?.bind(backend);
    this.state = allocateRenderMetadata(
      768,
      () => ({ entries: new Map(), owned: new Map(), counts: new Map() }),
      false,
      () => this.clear(),
    );
    backend.renderIsolate = (op, like, draw) => {
      const candidate = allocateRenderMetadata(160, () => ({
        kind: "isolate" as const,
        name: op.layer,
        width: like.width,
        height: like.height,
        colorSpace,
        value: op,
      }));
      try {
        return this.render(
          candidate,
          draw,
          () => this.renderIsolate?.(op, like, draw) ?? draw(),
        );
      } finally {
        releaseRenderMetadata(candidate);
      }
    };
    backend.renderSurface = (node, draw) => {
      const candidate = allocateRenderMetadata(160, () => ({
        kind: "surface" as const,
        name: node.id,
        width: node.width,
        height: node.height,
        colorSpace: node.colorSpace ?? colorSpace,
        value: node,
      }));
      try {
        return this.render(candidate, draw, draw);
      } finally {
        releaseRenderMetadata(candidate);
      }
    };
    backend.releaseSurface = (surface) => {
      const entry = this.state.owned.get(surface);
      if (!entry) return this.release(surface);
      if (entry.users === 0)
        throw Error("Composition retained surface released twice");
      entry.users--;
    };
  }

  get statistics() {
    let bytes = 320;
    for (const counts of this.state.counts.values())
      bytes += 192 + 2 * (counts.kind.length + counts.name.length);
    return allocateRenderMetadata(
      bytes,
      () => ({
        independentSurfacePaints: this.paints,
        surfaceRestores: this.restores,
        surfaceReuses: this.reuse,
        retainedBytes: this.retainedBytes,
        peakTransferBytes: this.peakTransferBytes,
        paintAndReadbackMs: this.paintAndReadbackMs,
        surfaces: [...this.state.counts.values()].map((counts) => ({
          ...counts,
        })),
      }),
      false,
      (value) => {
        value.surfaces.length = 0;
      },
    );
  }
  private assertOpen() {
    this.options.signal?.throwIfAborted();
    if (this.closed) throw Error("Composition surface cache is disposed");
  }
  private signature(candidate: Candidate) {
    const path = candidatePath(candidate);
    let state: ReturnType<typeof candidateState> | undefined;
    let input: unknown[] | undefined;
    try {
      state = candidateState(candidate);
      input = allocateRenderMetadata(80, () => [
        this.options.scopeKey,
        this.backend.version,
        this.backend.surfaceEncoding,
        path.value,
        state,
      ]);
      return compositionSurfaceVisualMetadata(input, this.contentKey);
    } finally {
      path.release();
      if (input) releaseRenderMetadata(input);
      if (candidate.kind === "isolate" && state) releaseRenderMetadata(state);
    }
  }
  private identity(candidate: Candidate): CandidateIdentity {
    const path = candidatePath(candidate);
    let signature: ManagedMetadataText | undefined;
    try {
      signature = this.signature(candidate);
      return allocateRenderMetadata(128, () => ({
        path,
        signature: signature!,
        retained: false,
      }));
    } catch (error) {
      path.release();
      signature?.release();
      throw error;
    }
  }
  private releaseIdentity(identity: CandidateIdentity) {
    if (!identity.retained) {
      identity.path.release();
      identity.signature.release();
    }
    releaseRenderMetadata(identity);
  }
  private resize(
    entries = this.state.entries.size,
    owned = this.state.owned.size,
    counts = this.state.counts.size,
  ) {
    resizeRenderMetadata(this.state, 768 + (entries + owned + counts) * 64);
  }
  private destroyEntry(entry: Entry<S>) {
    if (entry.released) return;
    entry.released = true;
    try {
      this.release(entry.surface);
    } finally {
      entry.path.release();
      entry.signature.release();
    }
  }
  private store(
    candidate: Candidate,
    identity: CandidateIdentity,
    producer: () => S,
    mode: "paint" | "restore",
  ) {
    this.resize(
      this.state.entries.size + 1,
      this.state.owned.size + 1,
      this.state.counts.size + 1,
    );
    let counts: SurfaceCounts | undefined, entry: Entry<S> | undefined;
    try {
      counts = allocateRenderMetadata(
        192 + 2 * (candidate.kind.length + candidate.name.length),
        () => ({
          kind: candidate.kind,
          name: candidate.name,
          paints: mode === "paint" ? 1 : 0,
          restores: mode === "restore" ? 1 : 0,
          reuses: 0,
        }),
        true,
      );
      entry = allocateRenderMetadata(
        160,
        () => ({
          path: identity.path,
          signature: identity.signature,
          surface: producer(),
          users: mode === "paint" ? 1 : 0,
          bytes:
            candidate.width *
            candidate.height *
            (this.backend.surfaceEncoding === "rgba32f-premultiplied" ? 16 : 4),
          released: false,
        }),
        true,
        (value) => this.destroyEntry(value),
      );
      identity.path.retain();
      identity.signature.retain();
      const path = identity.path.value!;
      this.state.entries.set(path, entry);
      this.state.owned.set(entry.surface, entry);
      this.state.counts.set(path, counts);
      identity.retained = true;
      this.retainedBytes += entry.bytes;
      if (mode === "paint") this.paints++;
      else this.restores++;
      return entry;
    } catch (error) {
      if (entry) {
        try {
          this.destroyEntry(entry);
        } catch {
          /* Preserve the producer/admission failure. */
        }
        releaseRenderMetadata(entry);
      }
      if (counts) releaseRenderMetadata(counts);
      try {
        this.resize();
      } catch {
        /* Preserve the producer/admission failure. */
      }
      throw error;
    }
  }
  private render(candidate: Candidate, draw: () => S, fallback: () => S) {
    this.assertOpen();
    const identity = this.identity(candidate);
    try {
      const path = identity.path.value!,
        signature = identity.signature.value!;
      const entry = this.state.entries.get(path);
      if (entry?.signature.value === signature) {
        entry.users++;
        this.reuse++;
        this.state.counts.get(path)!.reuses++;
        return entry.surface;
      }
      if (this.seeding?.path !== path || this.seeding.signature !== signature)
        return fallback();
      if (this.seeding.entry)
        throw Error("Composition surface seed rendered twice");
      const captured = this.store(candidate, identity, draw, "paint");
      this.seeding.entry = captured;
      return captured.surface;
    } finally {
      this.releaseIdentity(identity);
    }
  }

  async prepare(graph: RenderGraph) {
    this.assertOpen();
    if (this.preparing)
      throw Error("Composition surface preparation must be sequential");
    this.preparing = true;
    try {
      if (graph.spatial)
        requireSpatialCapabilities(graph.root, {
          depthImage: !!this.backend.drawDepthImage,
          lighting: !!this.backend.applyLighting,
          projective:
            !!this.backend.project && !!this.backend.applyProjectiveClips,
          validateSurface: this.backend.validateSpatialSurface,
        });
      for (const candidate of independentSurfaces(graph)) {
        try {
          await this.prepareCandidate(candidate);
        } finally {
          releaseRenderMetadata(candidate);
        }
      }
    } finally {
      this.preparing = false;
    }
  }

  private async prepareCandidate(candidate: Candidate) {
    this.assertOpen();
    const originalIdentity = this.identity(candidate);
    let pathHash: ManagedMetadataText | undefined,
      signatureHash: ManagedMetadataText | undefined;
    let identity: CompositionSurfaceIdentity | undefined;
    try {
      const path = originalIdentity.path.value!,
        signature = originalIdentity.signature.value!;
      if (this.state.entries.get(path)?.signature.value === signature) return;
      const bytes =
        candidate.width *
        candidate.height *
        (this.backend.surfaceEncoding === "rgba32f-premultiplied" ? 16 : 4);
      if (
        !this.state.entries.has(path) &&
        this.retainedBytes + bytes > this.options.byteLimit
      )
        throw Error(
          "Composition retained surfaces exceed the worker memory budget",
        );
      pathHash = await hashRenderMetadata(path);
      signatureHash = await hashRenderMetadata(signature);
      identity = allocateRenderMetadata(128, () => ({
        path: pathHash!.value!,
        key: signatureHash!.value!,
        width: candidate.width,
        height: candidate.height,
        encoding: this.backend.surfaceEncoding!,
      }));
      const claim = await this.options.exchange.claim(identity);
      this.assertOpen();
      if (claim.kind === "uncached") return;
      if (
        this.state.entries.has(path) ||
        this.retainedBytes + bytes > this.options.byteLimit
      )
        throw Error(
          "Composition retained surfaces exceed the worker memory budget",
        );
      if (claim.kind === "hit") {
        if (
          claim.bytes.byteOffset !== 0 ||
          claim.bytes.buffer.byteLength !== bytes ||
          claim.bytes.byteLength !== bytes
        )
          throw Error(
            "Composition retained surface bytes differ from their checksum or dimensions",
          );
        const checksum = await hashRenderPixels(claim.bytes.buffer);
        try {
          if (checksum.value !== claim.checksum)
            throw Error(
              "Composition retained surface bytes differ from their checksum or dimensions",
            );
        } finally {
          checksum.release();
        }
        this.assertOpen();
        this.peakTransferBytes = Math.max(this.peakTransferBytes, bytes);
        const pixels = allocateRenderMetadata(64, () => ({
          encoding: identity!.encoding,
          bytes: claim.bytes,
        }));
        try {
          this.store(
            candidate,
            originalIdentity,
            () =>
              this.backend.restoreSurface!(
                candidate.width,
                candidate.height,
                pixels,
              ),
            "restore",
          );
        } finally {
          releaseRenderMetadata(pixels);
        }
        releaseRenderPixels(claim.bytes);
        return;
      }
      if (claim.byteLength !== bytes)
        throw Error("Composition cache lease has incorrect storage size");
      const start = performance.now();
      const seed = allocateRenderMetadata(
        128,
        () => ({ path, signature }) as NonNullable<typeof this.seeding>,
      );
      this.seeding = seed;
      try {
        this.seed(candidate);
        if (!seed.entry || seed.entry.users !== 0)
          throw Error("Composition surface seed was not released");
        const pixels = this.backend.captureSurface!(seed.entry.surface);
        if (
          pixels.encoding !== identity.encoding ||
          pixels.bytes.byteLength !== bytes
        )
          throw Error(
            "Composition cache seed storage differs from its identity",
          );
        this.paintAndReadbackMs += performance.now() - start;
        this.peakTransferBytes = Math.max(this.peakTransferBytes, bytes);
        const checksum = await hashRenderPixels(pixels.bytes.buffer);
        try {
          this.assertOpen();
          await this.options.exchange.publish(
            claim.token,
            pixels,
            checksum.value!,
          );
          releaseRenderPixels(pixels.bytes);
          this.assertOpen();
        } finally {
          checksum.release();
        }
      } finally {
        this.seeding = undefined;
        releaseRenderMetadata(seed);
      }
    } finally {
      if (identity) releaseRenderMetadata(identity);
      pathHash?.release();
      signatureHash?.release();
      this.releaseIdentity(originalIdentity);
    }
  }

  private seed(candidate: Candidate) {
    // Fixed seed graph/op/content/matrix and three array headers/slots, before native production.
    const holder = allocateRenderMetadata(
      1024,
      () => ({ graph: undefined as RenderGraph | undefined }),
      false,
      (value) => {
        value.graph = undefined;
      },
    );
    let target: S | undefined;
    try {
      target = this.backend.createSurface(candidate.width, candidate.height);
      const op: RenderOp =
        candidate.kind === "isolate"
          ? {
              ...(candidate.value as IsolateOp),
              opacity: 1,
              blend: "normal",
              clips: [],
            }
          : {
              kind: "draw",
              layer: candidate.name,
              content: {
                type: "surface",
                surface: candidate.value as SurfaceNode,
              },
              matrix: [...IDENTITY],
              transforms: [],
              opacity: 1,
              blend: "normal",
              clips: [],
            };
      holder.graph = {
        root: {
          id: "cache-preparation",
          width: candidate.width,
          height: candidate.height,
          background: null,
          colorSpace: this.colorSpace,
          ops: [op],
        },
        culled: [],
      };
      executeGraph(this.backend, holder.graph, target, {
        lifecycle: false,
        statisticsPhase: "preparation",
      });
    } finally {
      releaseRenderMetadata(holder);
      if (target) this.backend.releaseSurface(target);
    }
  }

  private clear() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.state.entries.values()) {
      this.destroyEntry(entry);
      releaseRenderMetadata(entry);
    }
    this.state.entries.clear();
    this.state.owned.clear();
    for (const counts of this.state.counts.values())
      releaseRenderMetadata(counts);
    this.state.counts.clear();
    this.retainedBytes = 0;
  }
  dispose() {
    this.clear();
    releaseRenderMetadata(this.state);
  }
}
import { releaseRenderPixels } from "../../managed-memory-context.ts";
