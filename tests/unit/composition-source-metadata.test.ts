import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { CompositionSourceCache } from "../../packages/renderer-core/src/composition/render/source-cache.ts";
import { compositionSurfaceVisualKey } from "../../packages/renderer-core/src/composition/render/surface-cache.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const scopeKey = "sha256:" + "a".repeat(64);
const request = { kind: "unit", input: { text: "ไทย" }, width: 2, height: 2 };
const unexpected = () => {
  throw Error("A denied source must not reach painting or restoration");
};
function miss(source: CompositionSourceCache): unknown {
  try {
    source.read(request, unexpected, unexpected);
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
