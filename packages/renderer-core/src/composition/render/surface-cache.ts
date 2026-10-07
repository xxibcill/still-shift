import { sha256Hex } from "../../browser-checksum.ts";
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
type Entry<S> = { signature: string; surface: S; users: number; bytes: number };
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
  return JSON.stringify(value, (_property, item: unknown) => {
    const normalized = preparedVisualState(item, key);
    if (
      normalized === null ||
      typeof normalized !== "object" ||
      Array.isArray(normalized)
    )
      return normalized;
    return Object.fromEntries(
      Object.entries(normalized).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  });
}

function candidatePath(candidate: Candidate) {
  return JSON.stringify([
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
  return [op.ops, op.effects, op.masks, op.matte, op.lighting ?? null];
}

/** Dependency-first order prevents pages from holding a parent lease while awaiting a child. */
function* independentSurfaces(graph: RenderGraph): Generator<Candidate> {
  const visited = new Set<object>(),
    active = new Set<object>();
  const colorSpace = graph.root.colorSpace ?? "srgb";
  function* surface(node: SurfaceNode): Generator<Candidate> {
    if (active.has(node)) throw Error("Composition surface dependency cycle");
    if (visited.has(node)) return;
    active.add(node);
    yield* operations(node.ops, node.width, node.height);
    active.delete(node);
    visited.add(node);
    yield {
      kind: "surface",
      name: node.id,
      width: node.width,
      height: node.height,
      colorSpace,
      value: node,
    };
  }
  function* operations(
    ops: RenderOp[],
    width: number,
    height: number,
  ): Generator<Candidate> {
    if (active.has(ops)) throw Error("Composition operation dependency cycle");
    active.add(ops);
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
        for (const effect of op.effects)
          for (const input of Object.values(effect.layerInputs ?? {}))
            yield* operations(input, effectWidth, effectHeight);
        if (op.matte) yield* operations(op.matte.ops, width, height);
        if (op.kind === "isolate")
          yield {
            kind: "isolate",
            name: op.layer,
            width,
            height,
            colorSpace,
            value: op,
          };
      }
    } finally {
      active.delete(ops);
    }
  }
  yield* operations(graph.root.ops, graph.root.width, graph.root.height);
}

/** Shares only existing independent surfaces. Ordinary direct drawing retains its native boundaries. */
export class CompositionSurfaceCache<S extends Surface> {
  private readonly entries = new Map<string, Entry<S>>();
  private readonly owned = new Map<S, Entry<S>>();
  private readonly counts = new Map<string, SurfaceCounts>();
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
    backend.renderIsolate = (op, like, draw) =>
      this.render(
        {
          kind: "isolate",
          name: op.layer,
          width: like.width,
          height: like.height,
          colorSpace,
          value: op,
        },
        draw,
        () => this.renderIsolate?.(op, like, draw) ?? draw(),
      );
    backend.renderSurface = (node, draw) =>
      this.render(
        {
          kind: "surface",
          name: node.id,
          width: node.width,
          height: node.height,
          colorSpace: node.colorSpace ?? colorSpace,
          value: node,
        },
        draw,
        draw,
      );
    backend.releaseSurface = (surface) => {
      const entry = this.owned.get(surface);
      if (!entry) return this.release(surface);
      if (entry.users === 0)
        throw Error("Composition retained surface released twice");
      entry.users--;
    };
  }

  get statistics() {
    return {
      independentSurfacePaints: this.paints,
      surfaceRestores: this.restores,
      surfaceReuses: this.reuse,
      retainedBytes: this.retainedBytes,
      peakTransferBytes: this.peakTransferBytes,
      paintAndReadbackMs: this.paintAndReadbackMs,
      surfaces: [...this.counts.values()].map((counts) => ({ ...counts })),
    };
  }
  private assertOpen() {
    this.options.signal?.throwIfAborted();
    if (this.closed) throw Error("Composition surface cache is disposed");
  }
  private signature(candidate: Candidate) {
    return compositionSurfaceVisualKey(
      [
        this.options.scopeKey,
        this.backend.version,
        this.backend.surfaceEncoding,
        candidatePath(candidate),
        candidateState(candidate),
      ],
      this.contentKey,
    );
  }
  private render(candidate: Candidate, draw: () => S, fallback: () => S) {
    this.assertOpen();
    const path = candidatePath(candidate),
      signature = this.signature(candidate);
    const entry = this.entries.get(path);
    if (entry?.signature === signature) {
      entry.users++;
      this.reuse++;
      this.counts.get(path)!.reuses++;
      return entry.surface;
    }
    if (this.seeding?.path !== path || this.seeding.signature !== signature)
      return fallback();
    if (this.seeding.entry)
      throw Error("Composition surface seed rendered twice");
    const surface = draw();
    const captured = {
      signature,
      surface,
      users: 1,
      bytes:
        candidate.width *
        candidate.height *
        (this.backend.surfaceEncoding === "rgba32f-premultiplied" ? 16 : 4),
    };
    this.entries.set(path, captured);
    this.owned.set(surface, captured);
    this.seeding.entry = captured;
    this.retainedBytes += captured.bytes;
    this.paints++;
    this.counts.set(path, {
      kind: candidate.kind,
      name: candidate.name,
      paints: 1,
      restores: 0,
      reuses: 0,
    });
    return surface;
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
      for (const candidate of independentSurfaces(graph))
        await this.prepareCandidate(candidate);
    } finally {
      this.preparing = false;
    }
  }

  private async prepareCandidate(candidate: Candidate) {
    this.assertOpen();
    const path = candidatePath(candidate),
      signature = this.signature(candidate);
    if (this.entries.get(path)?.signature === signature) return;
    const bytes =
      candidate.width *
      candidate.height *
      (this.backend.surfaceEncoding === "rgba32f-premultiplied" ? 16 : 4);
    if (
      !this.entries.has(path) &&
      this.retainedBytes + bytes > this.options.byteLimit
    )
      throw Error(
        "Composition retained surfaces exceed the worker memory budget",
      );
    const identity = {
      path:
        "sha256:" + (await sha256Hex(new TextEncoder().encode(path).buffer)),
      key:
        "sha256:" +
        (await sha256Hex(new TextEncoder().encode(signature).buffer)),
      width: candidate.width,
      height: candidate.height,
      encoding: this.backend.surfaceEncoding!,
    };
    const claim = await this.options.exchange.claim(identity);
    this.assertOpen();
    if (claim.kind === "uncached") return;
    if (
      this.entries.has(path) ||
      this.retainedBytes + bytes > this.options.byteLimit
    )
      throw Error(
        "Composition retained surfaces exceed the worker memory budget",
      );
    if (claim.kind === "hit") {
      if (
        claim.bytes.byteOffset !== 0 ||
        claim.bytes.buffer.byteLength !== bytes ||
        claim.bytes.byteLength !== bytes ||
        "sha256:" + (await sha256Hex(claim.bytes.buffer)) !== claim.checksum
      )
        throw Error(
          "Composition retained surface bytes differ from their checksum or dimensions",
        );
      this.assertOpen();
      this.peakTransferBytes = Math.max(this.peakTransferBytes, bytes);
      const surface = this.backend.restoreSurface!(
        candidate.width,
        candidate.height,
        {
          encoding: identity.encoding,
          bytes: claim.bytes,
        },
      );
      const entry = { signature, surface, users: 0, bytes };
      this.entries.set(path, entry);
      this.owned.set(surface, entry);
      this.retainedBytes += bytes;
      this.restores++;
      this.counts.set(path, {
        kind: candidate.kind,
        name: candidate.name,
        paints: 0,
        restores: 1,
        reuses: 0,
      });
      return;
    }
    if (claim.byteLength !== bytes)
      throw Error("Composition cache lease has incorrect storage size");
    const start = performance.now();
    const seed = { path, signature } as NonNullable<typeof this.seeding>;
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
        throw Error("Composition cache seed storage differs from its identity");
      this.paintAndReadbackMs += performance.now() - start;
      this.peakTransferBytes = Math.max(this.peakTransferBytes, bytes);
      const checksum = "sha256:" + (await sha256Hex(pixels.bytes.buffer));
      this.assertOpen();
      await this.options.exchange.publish(claim.token, pixels, checksum);
      this.assertOpen();
    } finally {
      this.seeding = undefined;
    }
  }

  private seed(candidate: Candidate) {
    const target = this.backend.createSurface(
      candidate.width,
      candidate.height,
    );
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
    try {
      executeGraph(
        this.backend,
        {
          root: {
            id: "cache-preparation",
            width: candidate.width,
            height: candidate.height,
            background: null,
            colorSpace: this.colorSpace,
            ops: [op],
          },
          culled: [],
        },
        target,
        { lifecycle: false },
      );
    } finally {
      this.backend.releaseSurface(target);
    }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) this.release(entry.surface);
    this.entries.clear();
    this.owned.clear();
    this.retainedBytes = 0;
  }
}
