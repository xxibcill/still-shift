import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  CompositionSurfaceCache,
  compositionSurfaceVisualKey,
} from "../../packages/renderer-core/src/composition/render/surface-cache.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import type {
  RenderGraph,
  SurfaceNode,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const scopeKey = "sha256:" + "a".repeat(64);
function unexpected(): never {
  throw Error("No native surface producer is allowed in this control test");
}
function controlBackend() {
  return {
    version: "test-surface",
    surfaceEncoding: "rgba8-straight",
    captureSurface: unexpected,
    restoreSurface: unexpected,
    releaseSurface: unexpected,
  } as unknown as RenderBackend<Surface>;
}
function fixture() {
  const child: SurfaceNode = {
    id: "child",
    width: 2,
    height: 2,
    background: null,
    ops: [],
  };
  const graph: RenderGraph = {
    root: {
      id: "root",
      width: 2,
      height: 2,
      background: null,
      ops: [
        {
          kind: "draw",
          layer: "host",
          content: { type: "surface", surface: child },
          matrix: [1, 0, 0, 1, 0, 0],
          transforms: [],
          opacity: 1,
          blend: "normal",
          clips: [],
        },
      ],
    },
    culled: [],
  };
  return { child, graph };
}
it("preserves original canonical candidate hashes and releases repeated uncached traversal identities", async () => {
  const { child, graph } = fixture();
  const path = JSON.stringify(["surface", "child", 2, 2, "srgb"]);
  const signature = compositionSurfaceVisualKey([
    scopeKey,
    "test-surface",
    "rgba8-straight",
    path,
    child,
  ]);
  const hash = (s: string) =>
    "sha256:" + createHash("sha256").update(s).digest("hex");
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    let claims = 0;
    const cache = new CompositionSurfaceCache(controlBackend(), {
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim(identity) {
          claims++;
          expect(identity).toEqual({
            path: hash(path),
            key: hash(signature),
            width: 2,
            height: 2,
            encoding: "rgba8-straight",
          });
          return { kind: "uncached" };
        },
        publish: unexpected,
      },
    });
    for (let n = 0; n < 3; n++) {
      memory.beginScratch();
      await cache.prepare(graph);
      memory.endScratch();
      expect(memory.statistics.current.metadata).toBe(768);
      expect(memory.statistics.reservations).toBe(1);
    }
    expect(claims).toBe(3);
    cache.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("preserves a null claim failure while releasing active traversal and key owners", async () => {
  const { graph } = fixture();
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    const cache = new CompositionSurfaceCache(controlBackend(), {
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          throw null;
        },
        publish: unexpected,
      },
    });
    await expect(cache.prepare(graph)).rejects.toBe(null);
    expect(memory.statistics.current.metadata).toBe(768);
    expect(memory.statistics.reservations).toBe(1);
    cache.dispose();
    memory.dispose();
  });
});
it("releases traversal containers when a real graph dependency cycle rejects before claims", async () => {
  const { child, graph } = fixture();
  child.ops.push({
    ...graph.root.ops[0]!,
    kind: "draw",
    content: { type: "surface", surface: child },
  } as (typeof child.ops)[number]);
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    const cache = new CompositionSurfaceCache(controlBackend(), {
      scopeKey,
      byteLimit: 1024,
      exchange: { claim: unexpected, publish: unexpected },
    });
    await expect(cache.prepare(graph)).rejects.toThrow("dependency cycle");
    expect(memory.statistics.current.metadata).toBe(768);
    expect(memory.statistics.reservations).toBe(1);
    cache.dispose();
    memory.dispose();
  });
});
it("denies insertion control capacity before restoring any claimed native surface", async () => {
  const { graph } = fixture();
  const bytes = new Uint8Array(16),
    checksum = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    let blocker: MemoryLease | undefined,
      restores = 0;
    const backend = controlBackend();
    backend.restoreSurface = () => {
      restores++;
      return unexpected();
    };
    const cache = new CompositionSurfaceCache(backend, {
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          blocker = memory.reserve(
            "metadata",
            16384 - memory.statistics.current.metadata - 191,
          );
          return { kind: "hit", bytes, checksum };
        },
        publish: unexpected,
      },
    });
    try {
      await expect(cache.prepare(graph)).rejects.toThrow("metadata");
    } finally {
      blocker?.release();
    }
    expect(restores).toBe(0);
    expect(memory.statistics.current.metadata).toBe(768);
    expect(memory.statistics.reservations).toBe(1);
    cache.dispose();
    memory.dispose();
  });
});
