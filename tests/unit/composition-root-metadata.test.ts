import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { CompositionRootCache } from "../../packages/renderer-core/src/composition/render/root-cache.ts";
import { compositionSurfaceVisualKey } from "../../packages/renderer-core/src/composition/render/surface-cache.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateRenderPixels,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";

const scopeKey = "sha256:" + "a".repeat(64);
const graph = {
  root: { id: "root", width: 2, height: 2, background: null, ops: [] },
  culled: [],
};
function unexpected(): never {
  throw Error("No native pixel producer is needed for an uncached claim");
}
function identityBackend() {
  return {
    version: "test-identity",
    rootPixels: {
      identity: () => ({
        policy: "original-policy",
        encoding: "rgba8-straight",
      }),
      reset: unexpected,
      capture: unexpected,
      restore: unexpected,
    },
  } as unknown as RenderBackend<Surface>;
}
function expectedClaim() {
  const role = compositionSurfaceVisualKey(["frame", "original-policy"]);
  const path = compositionSurfaceVisualKey([
    "original-root",
    "root",
    2,
    2,
    role,
    "rgba8-straight",
    [],
  ]);
  const signature = compositionSurfaceVisualKey([
    scopeKey,
    "test-identity",
    path,
    graph.root,
  ]);
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  return {
    path: "root:" + hash(path),
    key: "sha256:" + hash(signature),
    width: 2,
    height: 2,
    encoding: "rgba8-straight",
  };
}
it("retains exact root path/role counters across preparation scratch while snapshots survive disposal", async () => {
  const expected = expectedClaim();
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    let claims = 0;
    const backend = identityBackend();
    const cache = new CompositionRootCache(backend, {
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim(identity) {
          claims++;
          expect(identity).toEqual(expected);
          return { kind: "uncached" };
        },
        publish: unexpected,
      },
    });
    for (let n = 0; n < 3; n++) {
      memory.beginScratch();
      await cache.prepare(graph, { width: 2, height: 2 });
      memory.endScratch();
      expect(memory.statistics.reservations).toBe(4);
    }
    expect(claims).toBe(3);
    const snapshot = cache.statistics;
    expect(snapshot.roots).toHaveLength(1);
    expect(snapshot.roots[0]!.role).toBe('["frame","original-policy"]');
    cache.dispose();
    expect(backend.renderRoot).toBeUndefined();
    expect(backend.rootPrefix).toBeUndefined();
    expect(snapshot.roots).toHaveLength(1);
    expect(memory.statistics.reservations).toBe(1);
    releaseRenderMetadata(snapshot);
    expect(snapshot.roots).toEqual([]);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    memory.dispose();
  });
});
it("releases temporary root identities after a null claim failure", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    const cache = new CompositionRootCache(identityBackend(), {
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          throw null;
        },
        publish: unexpected,
      },
    });
    memory.beginScratch();
    await expect(cache.prepare(graph, { width: 2, height: 2 })).rejects.toBe(
      null,
    );
    memory.endScratch();
    expect(memory.statistics.current.metadata).toBe(640);
    expect(memory.statistics.reservations).toBe(1);
    cache.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("denies root identity metadata before exchange claims or native pixel work", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 768 });
  await withManagedMemory(memory, async () => {
    const cache = new CompositionRootCache(identityBackend(), {
      scopeKey,
      byteLimit: 1024,
      exchange: { claim: unexpected, publish: unexpected },
    });
    await expect(cache.prepare(graph, { width: 2, height: 2 })).rejects.toThrow(
      "metadata",
    );
    expect(memory.statistics.reservations).toBe(1);
    cache.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("evicts old root pixels within a fixed budget and restores revisited roots exactly", async () => {
  const memory = new ManagedMemory({ pixels: 64, metadata: 65536 });
  await withManagedMemory(memory, async () => {
    let claims = 0;
    let restored: number[] = [];
    const backings: Uint8Array[] = [];
    const backend = identityBackend();
    backend.rootPixels!.restore = (_target, pixels) => {
      restored = [...pixels.bytes];
    };
    const cache = new CompositionRootCache(backend, {
      scopeKey,
      byteLimit: 48,
      exchange: {
        async claim() {
          claims++;
          const bytes = allocateRenderPixels(
            16,
            () => new Uint8Array(16).fill(claims),
            true,
          );
          backings.push(bytes);
          return {
            kind: "hit",
            bytes,
            checksum:
              "sha256:" + createHash("sha256").update(bytes).digest("hex"),
          };
        },
        publish: unexpected,
      },
    });
    try {
      for (const [index, id] of [
        "first",
        "second",
        "third",
        "fourth",
        "first",
      ].entries()) {
        memory.beginScratch();
        const current = { ...graph, root: { ...graph.root, id } };
        await cache.prepare(current, { width: 2, height: 2 });
        backend.renderRoot!(
          current.root,
          { width: 2, height: 2 },
          unexpected,
          "frame",
        );
        expect(restored).toEqual(new Array(16).fill(index + 1));
        const snapshot = cache.statistics;
        expect(snapshot.retainedBytes).toBeLessThanOrEqual(32);
        releaseRenderMetadata(snapshot);
        memory.endScratch();
        expect(memory.statistics.current.pixels).toBeLessThanOrEqual(32);
      }
      expect(claims).toBe(5);
      expect(backings.slice(0, 3).map((bytes) => bytes.byteLength)).toEqual([
        0, 0, 0,
      ]);
    } finally {
      cache.dispose();
    }
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    memory.dispose();
  });
});
it("rejects a root that cannot fit by itself before claiming pixels", async () => {
  const memory = new ManagedMemory({ pixels: 64, metadata: 16384 });
  await withManagedMemory(memory, async () => {
    const cache = new CompositionRootCache(identityBackend(), {
      scopeKey,
      byteLimit: 31,
      exchange: { claim: unexpected, publish: unexpected },
    });
    try {
      await expect(
        cache.prepare(graph, { width: 2, height: 2 }),
      ).rejects.toThrow("worker byte/entry bound");
    } finally {
      cache.dispose();
    }
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    memory.dispose();
  });
});
