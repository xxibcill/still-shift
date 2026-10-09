import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { CompositionSourceCache } from "../../packages/renderer-core/src/composition/render/source-cache.ts";
import { compositionSurfaceVisualKey } from "../../packages/renderer-core/src/composition/render/surface-cache.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const scopeKey = "sha256:" + "a".repeat(64);
const request = { kind: "unit", input: { text: "ไทย" }, width: 2, height: 2 };
const unexpected = () => {
  throw Error("A denied source must not reach painting or restoration");
};
function miss(source: CompositionSourceCache, requestValue = request): unknown {
  try {
    source.read(requestValue, unexpected, unexpected);
  } catch (error) {
    return error;
  }
  throw Error("Expected original preparation rendezvous");
}
it("holds a pending canonical identity across failed preview scratch and cleans original null claim failure", async () => {
  const canonical = compositionSurfaceVisualKey([
    "composition-source-pixels-1",
    scopeKey,
    request,
  ]);
  const expectedKey =
    "sha256:" + createHash("sha256").update(canonical).digest("hex");
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    let claims = 0;
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim(identity) {
          claims++;
          expect(identity.key).toBe(expectedKey);
          expect(identity.path).toBe("source:unit:" + expectedKey.slice(7));
          throw null;
        },
        async publish() {
          unexpected();
        },
      },
    });
    memory.beginScratch();
    const pending = miss(source);
    memory.endScratch();
    expect(memory.statistics.reservations).toBe(3);
    expect(memory.statistics.current.metadata).toBeGreaterThan(768);
    await expect(source.prepare(pending)).rejects.toBe(null);
    expect(claims).toBe(1);
    expect(memory.hasScratch).toBe(false);
    expect(memory.statistics.current.metadata).toBe(768);
    expect(memory.statistics.reservations).toBe(1);
    source.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("releases every outstanding pending identity when the cache is disposed", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          throw Error("Must not claim a disposed source");
        },
        async publish() {
          unexpected();
        },
      },
    });
    const first = miss(source),
      second = miss(source);
    expect(first).not.toBe(second);
    expect(memory.statistics.reservations).toBe(5);
    source.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    await expect(source.prepare(first)).rejects.toThrow("disposed");
    expect(memory.hasScratch).toBe(false);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("preserves a null claim failure after cache disposal and ends its owned preparation phase", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          source.dispose();
          throw null;
        },
        async publish() {
          unexpected();
        },
      },
    });
    const pending = miss(source);
    await expect(source.prepare(pending)).rejects.toBe(null);
    expect(memory.hasScratch).toBe(false);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});

it("uses the original tint painter when shared capacity is exhausted without retaining its canvas", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const claim = vi.fn(async () => {
      throw Error("An uncached tint must not claim shared storage");
    });
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 16,
      exchange: {
        claim,
        async publish() {
          unexpected();
        },
      },
    });
    const canvas = { width: 2, height: 2 } as HTMLCanvasElement;
    const paint = vi.fn(() => canvas);
    memory.beginScratch();
    expect(
      source.read({ ...request, kind: "glyph-tint" }, paint, unexpected),
    ).toBe(canvas);
    memory.endScratch();
    const statistics = source.statistics;
    expect(statistics.retainedCanvasBytes).toBe(0);
    expect(statistics.sources).toEqual([
      expect.objectContaining({
        kind: "glyph-tint",
        paints: 0,
        uncachedPaints: 1,
      }),
    ]);
    expect(paint).toHaveBeenCalledOnce();
    expect(claim).not.toHaveBeenCalled();
    source.dispose();
    expect(canvas.width).toBe(2);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("keeps invalid tint sizes and oversized immutable sources fail-closed", () => {
  const source = new CompositionSourceCache({
    scopeKey,
    byteLimit: 16,
    exchange: {
      async claim() {
        return unexpected();
      },
      async publish() {
        unexpected();
      },
    },
  });
  const paint = vi.fn(unexpected);
  expect(() => source.read(request, paint, unexpected)).toThrow(
    /byte\/entry bound/,
  );
  expect(() =>
    source.read(
      { ...request, kind: "glyph-tint", width: 0 },
      paint,
      unexpected,
    ),
  ).toThrow(/byte\/entry bound/);
  expect(paint).not.toHaveBeenCalled();
  source.dispose();
});

it("falls back locally after a typed shared-capacity denial without retrying claims or retaining negative source keys", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const claim = vi.fn(async (identity: { fallback?: string }) => {
      expect(identity.fallback).toBe("uncached");
      return { kind: "uncached" as const, reason: "capacity" as const };
    });
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 1024,
      exchange: {
        claim,
        async publish() {
          unexpected();
        },
      },
    });
    const tint = { ...request, kind: "glyph-tint" };
    await expect(source.prepare(miss(source, tint))).resolves.toBe(true);
    expect(memory.statistics.current.metadata).toBe(768);
    const canvas = { width: 2, height: 2 } as HTMLCanvasElement;
    const paint = vi.fn(() => canvas);
    memory.beginScratch();
    expect(source.read(tint, paint, unexpected)).toBe(canvas);
    expect(
      source.read(
        { ...tint, input: { text: "another color" } },
        paint,
        unexpected,
      ),
    ).toBe(canvas);
    memory.endScratch();
    expect(claim).toHaveBeenCalledOnce();
    expect(paint).toHaveBeenCalledTimes(2);
    const statistics = source.statistics;
    expect(statistics.retainedCanvasBytes).toBe(0);
    expect(statistics.sources).toEqual([
      expect.objectContaining({ kind: "glyph-tint", uncachedPaints: 2 }),
    ]);
    source.dispose();
    expect(canvas.width).toBe(2);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("keeps changed source identity and unrequested capacity denials fatal", async () => {
  for (const [kind, response] of [
    ["glyph-tint", { kind: "uncached" as const }],
    ["glyph", { kind: "uncached" as const, reason: "capacity" as const }],
  ] as const) {
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 1024,
      exchange: {
        async claim() {
          return response;
        },
        async publish() {
          unexpected();
        },
      },
    });
    await expect(
      source.prepare(miss(source, { ...request, kind })),
    ).rejects.toThrow("changed identity");
    source.dispose();
  }
});

it("bounds optional managed tint retention before control owners fill while retaining immutable sources", async () => {
  const memory = new ManagedMemory({
    pixels: 64 * 1024,
    metadata: 16 * 1024 ** 2,
  });
  const canvases: HTMLCanvasElement[] = [];
  await withManagedMemory(memory, async () => {
    const claim = vi.fn(async () => ({
      kind: "lease" as const,
      token: "native",
      byteLength: 4,
    }));
    const source = new CompositionSourceCache({
      scopeKey,
      byteLimit: 128 * 1024 ** 2,
      exchange: { claim, async publish() {} },
    });
    const paint = () => {
      const canvas = memory.allocate(
        "pixels",
        4,
        () =>
          ({
            width: 1,
            height: 1,
            getContext() {
              return {
                getImageData() {
                  return { data: new Uint8ClampedArray([0, 0, 0, 255]) };
                },
              };
            },
          }) as unknown as HTMLCanvasElement,
        true,
      );
      canvases.push(canvas);
      return canvas;
    };
    const small = { kind: "glyph-tint", input: 0, width: 1, height: 1 };
    for (let input = 0; input < 2048; input++) {
      let pending: unknown;
      try {
        source.read({ ...small, input }, paint, unexpected);
      } catch (error) {
        pending = error;
      }
      expect(await source.prepare(pending)).toBe(true);
    }
    const local = { width: 1, height: 1 } as HTMLCanvasElement;
    expect(
      source.read({ ...small, input: 2048 }, () => local, unexpected),
    ).toBe(local);
    expect(claim).toHaveBeenCalledTimes(2048);
    let pending: unknown;
    try {
      source.read({ ...small, kind: "glyph", input: 2048 }, paint, unexpected);
    } catch (error) {
      pending = error;
    }
    expect(await source.prepare(pending)).toBe(true);
    expect(claim).toHaveBeenCalledTimes(2049);
    source.dispose();
    for (const canvas of canvases) memory.release(canvas);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
