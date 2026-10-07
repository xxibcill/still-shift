import { expect, it } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";

it("rejects combined retained and scratch pixels before invoking the allocator", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  const retained = memory.allocate(
    "pixels",
    12,
    () => new Uint8Array(12),
    true,
  );
  memory.beginScratch();
  let allocations = 0;
  expect(() =>
    memory.allocate("pixels", 5, () => {
      allocations++;
      return new Uint8Array(5);
    }),
  ).toThrow("aggregate worker quota");
  expect(allocations).toBe(0);
  memory.allocate("pixels", 4, () => new Uint8Array(4));
  expect(memory.statistics.peak.pixels).toBe(16);
  memory.endScratch();
  expect(memory.statistics.current.pixels).toBe(12);
  memory.release(retained);
  expect(memory.statistics.current.pixels).toBe(0);
});
it("keeps admitted scratch promoted to retained storage across phases", () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  memory.beginScratch();
  const retained = memory.allocate("pixels", 16, () => new Uint8Array(16));
  memory.retain(retained);
  memory.allocate("pixels", 16, () => new Uint8Array(16));
  memory.endScratch();
  expect(memory.statistics.current.pixels).toBe(16);
  memory.beginScratch();
  memory.release(retained);
  memory.allocate("pixels", 32, () => new Uint8Array(32));
  memory.endScratch();
  expect(memory.statistics.current.pixels).toBe(0);
});
it("admits metadata separately and rejects resize without changing prior ownership", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  const pixels = memory.reserve("pixels", 16),
    metadata = memory.reserve("metadata", 8);
  expect(() => pixels.resize(17)).toThrow("aggregate worker quota");
  expect(() => metadata.resize(9)).toThrow("aggregate worker quota");
  expect(memory.statistics.current).toEqual({ pixels: 16, metadata: 8 });
  pixels.resize(4);
  metadata.release();
  metadata.release();
  expect(memory.statistics.current).toEqual({ pixels: 4, metadata: 0 });
  memory.dispose();
  memory.dispose();
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(() => pixels.resize(1)).toThrow("disposed");
});
it("preserves allocator errors including null and releases failed admission", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  let reason: unknown = "not thrown";
  try {
    memory.allocate("pixels", 16, () => {
      throw null;
    });
  } catch (error) {
    reason = error;
  }
  expect(reason).toBe(null);
  expect(memory.statistics.current.pixels).toBe(0);
});
it("requires sequential scratch phases and bounds disposed/new reservations", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  expect(() => memory.endScratch()).toThrow("not active");
  memory.beginScratch();
  expect(() => memory.beginScratch()).toThrow("sequential");
  memory.dispose();
  expect(() => memory.reserve("pixels", 1)).toThrow("disposed");
  expect(() => new ManagedMemory({ pixels: NaN, metadata: 8 })).toThrow(
    "safe integers",
  );
});

it("tracks backing-store aliases and refuses to retain storage after scratch ends", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  memory.beginScratch();
  const pixels = memory.allocate(
    "pixels",
    16,
    () => new Uint8Array(16),
    false,
    (value) => value.buffer,
  );
  memory.retain(new Uint8ClampedArray(pixels.buffer).buffer);
  memory.endScratch();
  expect(memory.statistics.current.pixels).toBe(16);
  memory.release(pixels.buffer);
  memory.beginScratch();
  const temporary = memory.allocate("pixels", 16, () => new Uint8Array(16));
  memory.endScratch();
  expect(() => memory.retain(temporary)).toThrow("no admitted owner");
});
it("commits constructor ownership and destroys rejected attempt scratch exactly once", () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let destroyed = 0;
  memory.beginScratch();
  memory.reserve("pixels", 16, () => destroyed++);
  memory.endScratch();
  expect(destroyed).toBe(1);
  memory.beginScratch();
  memory.reserve("pixels", 16, () => destroyed++);
  memory.commitScratch();
  expect(memory.statistics.current.pixels).toBe(16);
  memory.beginScratch();
  memory.reserve("pixels", 16, () => destroyed++);
  memory.endScratch();
  expect(destroyed).toBe(2);
  memory.dispose();
  expect(destroyed).toBe(3);
});

it.each(["scratch", "dispose"])(
  "releases every %s owner even when a destructor throws null",
  (phase) => {
    const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
    memory.beginScratch();
    let destroyed = 0;
    memory.reserve("pixels", 16, () => {
      destroyed++;
      throw null;
    });
    memory.reserve("pixels", 16, () => {
      destroyed++;
    });
    let reason: unknown = "not thrown";
    try {
      if (phase === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(destroyed).toBe(2);
    expect(memory.statistics.current.pixels).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
    expect(destroyed).toBe(2);
  },
);

it("transfers one active backing owner without changing admission or retained lifetime", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  memory.beginScratch();
  const before = memory.allocate("pixels", 16, () => new ArrayBuffer(16));
  memory.retain(before);
  const transferred = structuredClone(before, { transfer: [before] });
  memory.transfer(before, transferred);
  expect(before.byteLength).toBe(0);
  expect(memory.statistics.current.pixels).toBe(16);
  expect(() => memory.retain(before)).toThrow("no admitted owner");
  memory.endScratch();
  expect(memory.statistics.current.pixels).toBe(16);
  memory.release(transferred);
  expect(memory.statistics.reservations).toBe(0);
  expect(() => memory.transfer(transferred, new ArrayBuffer(16))).toThrow(
    "no active admitted owner",
  );
});

it("destroys the transferred resource and preserves the first original destructor failure", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  const original = {};
  const transferred = {};
  let destroyed: object | undefined;
  const lease = memory.reserve("pixels", 16, () => {
    throw null;
  });
  memory.adopt(original, lease, (resource) => {
    destroyed = resource;
    throw Error("secondary destructor");
  });
  memory.transfer(original, transferred);
  let reason: unknown = "not thrown";
  try {
    memory.dispose();
  } catch (error) {
    reason = error;
  }
  expect(reason).toBe(null);
  expect(destroyed).toBe(transferred);
  expect(memory.statistics.reservations).toBe(0);
});

it("refuses a second adopted owner and transfer into a foreign reservation", () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  const first = {},
    second = {};
  const lease = memory.reserve("pixels", 16);
  memory.adopt(first, lease);
  expect(() => memory.adopt(second, lease)).toThrow(
    "already has a resource owner",
  );
  const other = memory.reserve("pixels", 16);
  memory.adopt(second, other);
  expect(() => memory.transfer(first, second)).toThrow("already has an owner");
  memory.release(first);
  expect(memory.statistics.current.pixels).toBe(16);
  memory.release(second);
  expect(memory.statistics.reservations).toBe(0);
});
