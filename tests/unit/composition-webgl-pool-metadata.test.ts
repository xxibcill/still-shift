import { expect, it, vi } from "vitest";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
const limits = { pixels: 65536, metadata: 65536 };
type Entry = {
  key: string | undefined;
  surfaces: unknown[] | undefined;
  capacity: number;
};
function pool(device: WebglDevice) {
  return (device as unknown as { pool: Map<string, Entry> }).pool;
}
it("admits actual original key text/controller before tuple coercion, lookup and native texture production", async () => {
  const memory = new ManagedMemory({ pixels: 65536, metadata: 1535 });
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const lookup = vi.spyOn(pool(device), "get");
    const coerce = vi.fn(() => 2);
    const width = { [Symbol.toPrimitive]: coerce } as unknown as number;
    expect(() => device.surface(width, 2)).toThrow("metadata");
    expect(coerce).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(1024);
    device.dispose();
    memory.dispose();
  });
});
it("owns the original canonical key and actual pool array through pop/reuse without repeated retained replacement", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2);
    device.release(surface);
    const entry = pool(device).get("2x2/false/false/false")!;
    const list = entry.surfaces!;
    const before = memory.statistics.current.metadata;
    expect(memory.owns(entry)).toBe(true);
    expect(list).toEqual([surface]);
    for (let i = 0; i < 4; i++) {
      expect(device.surface(2, 2)).toBe(surface);
      expect(list).toHaveLength(0);
      device.release(surface);
      expect(pool(device).get("2x2/false/false/false")).toBe(entry);
      expect(entry.surfaces).toBe(list);
      expect(entry.capacity).toBe(1);
      expect(memory.statistics.current.metadata).toBe(before);
    }
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    device.dispose();
    expect(list).toHaveLength(0);
    expect(entry.key).toBeUndefined();
    expect(entry.surfaces).toBeUndefined();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("denies new actual array-slot growth before push and preserves prior key/list/surfaces for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const first = device.surface(2, 2),
      second = device.surface(2, 2);
    device.release(first);
    const entry = pool(device).get("2x2/false/false/false")!;
    const list = entry.surfaces!;
    const before = memory.statistics.current;
    const push = vi.spyOn(list, "push");
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - 519,
    );
    expect(() => device.release(second)).toThrow("metadata");
    expect(push).not.toHaveBeenCalled();
    expect(list).toEqual([first]);
    expect(entry.capacity).toBe(1);
    expect(memory.owns(second)).toBe(true);
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    device.release(second);
    expect(list).toEqual([first, second]);
    expect(entry.capacity).toBe(2);
    expect(memory.statistics.current.metadata).toBe(before.metadata + 8);
    push.mockRestore();
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves original per-key sixteen-surface cap and pool pixel-byte cap with exact native discard", async () => {
  for (const byteLimit of [128 * 1024 * 1024, 16]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const { canvas, gl } = fakeWebglDevice();
      const device = new WebglDevice(canvas, false, byteLimit);
      const surfaces = Array.from({ length: 17 }, () => device.surface(2, 2));
      for (const surface of surfaces) device.release(surface);
      const entry = pool(device).get("2x2/false/false/false")!;
      const retained = byteLimit === 16 ? 1 : 16;
      expect(entry.surfaces).toHaveLength(retained);
      expect(entry.capacity).toBe(retained);
      expect(device.allocated).toBe(retained);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(17 - retained);
      expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(17 - retained);
      expect(memory.statistics.current.pixels).toBe(retained * 16);
      device.dispose();
      memory.dispose();
      expect(gl.deleteTexture).toHaveBeenCalledTimes(17);
      expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(17);
      expect(memory.statistics.reservations).toBe(0);
    });
  }
});
it("retains actual pool key/list across scratch and releases them after scope exit or allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    const { canvas, gl } = fakeWebglDevice();
    const { device, entry, list } = await withManagedMemory(
      memory,
      async () => {
        memory.beginScratch();
        const device = new WebglDevice(canvas);
        device.release(device.surface(2, 2));
        const entry = pool(device).get("2x2/false/false/false")!;
        const list = entry.surfaces!;
        memory.endScratch();
        expect(memory.owns(entry)).toBe(true);
        expect(list).toHaveLength(1);
        return { device, entry, list };
      },
    );
    if (allocatorFirst) memory.dispose();
    device.dispose();
    memory.dispose();
    expect(list).toHaveLength(0);
    expect(entry.key).toBeUndefined();
    expect(entry.surfaces).toBeUndefined();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  }
});
it("preserves null lookup failure and frees the attempted actual key controller before native production", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const lookup = vi.spyOn(pool(device), "get").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.surface(2, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(1024);
    lookup.mockRestore();
    device.release(device.surface(2, 2));
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
