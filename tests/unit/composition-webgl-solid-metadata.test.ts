import { expect, it, vi } from "vitest";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
const limits = { pixels: 65536, metadata: 65536 };
const region = { left: 0, top: 0, right: 2, bottom: 2 };
it("admits original solid-color working arrays before slice and preserves prior cache on one-byte denial", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2, false, true, true);
    const before = memory.statistics.current;
    const prior = device.solidColor(surface, region)!;
    const color = [0.2, 0.4, 0.6, 1];
    const slice = vi.spyOn(color, "slice");
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - 767,
    );
    expect(() => device.clear(surface, color)).toThrow("metadata");
    expect(slice).not.toHaveBeenCalled();
    expect(gl.clear).toHaveBeenCalledTimes(2);
    expect(device.solidColor(surface, region)).toBe(prior);
    expect(prior).toEqual([0, 0, 0, 255]);
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    slice.mockRestore();
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("retains exact original cached opaque bytes while clearing actual working arrays and prior cache references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2, false, true, true);
    const prior = device.solidColor(surface, region)!;
    const before = memory.statistics.current.metadata;
    const color = [0.2, 0.4, 0.6, 1];
    const slice = vi.spyOn(color, "slice");
    device.clear(surface, color);
    expect(device.solidColor(surface, region)).toEqual([51, 102, 153, 255]);
    expect(slice).toHaveBeenCalledTimes(1);
    expect(slice.mock.results[0]!.value).toHaveLength(0);
    expect(prior).toHaveLength(0);
    expect(color).toEqual([0.2, 0.4, 0.6, 1]);
    expect(memory.statistics.current.metadata).toBe(before);
    slice.mockRestore();
    device.dispose();
    memory.dispose();
  });
});
it("preserves original fractional-byte predicate and drops only owned cached bytes for a nonexact clear", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2, false, true, true);
    const prior = device.solidColor(surface, region)!;
    const before = memory.statistics.current.metadata;
    const color = [1 / 255, 2 / 255, 3 / 255, 0.5];
    device.clear(surface, color);
    expect(device.solidColor(surface, region)).toBeUndefined();
    expect(prior).toHaveLength(0);
    expect(color).toEqual([1 / 255, 2 / 255, 3 / 255, 0.5]);
    expect(memory.statistics.current.metadata).toBe(before - 384);
    device.dispose();
    memory.dispose();
  });
});
it("preserves original null color producer failure and frees attempted working controls before exact retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2, false, true, true);
    const before = memory.statistics.current;
    const color = [0.2, 0.4, 0.6, 1];
    const slice = vi.spyOn(color, "slice").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.clear(surface, color);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current).toEqual(before);
    slice.mockRestore();
    device.clear(surface, color);
    expect(device.solidColor(surface, region)).toEqual([51, 102, 153, 255]);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("retains actual cached bytes across scratch and clears actual references after scope exit or allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    const { canvas } = fakeWebglDevice();
    const { device, color } = await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const device = new WebglDevice(canvas);
      const surface = device.surface(2, 2, false, true, true);
      const color = device.solidColor(surface, region)!;
      memory.endScratch();
      expect(color).toEqual([0, 0, 0, 255]);
      expect(memory.statistics.current.metadata).toBe(2512);
      return { device, color };
    });
    if (allocatorFirst) memory.dispose();
    device.dispose();
    memory.dispose();
    expect(color).toHaveLength(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  }
});
it("drops actual solid cache for an incomplete native screen when the original callback throws null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    device.onScreenChange = () => {
      throw null;
    };
    let caught: unknown = "missing";
    try {
      device.surface(2, 2, false, true, true);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(device.allocated).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1064 });
    device.onScreenChange = undefined;
    const surface = device.surface(2, 2, false, true, true);
    expect(device.solidColor(surface, region)).toEqual([0, 0, 0, 255]);
    device.dispose();
    memory.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(memory.statistics.reservations).toBe(0);
  });
});
