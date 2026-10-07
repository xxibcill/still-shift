import { expect, it, vi } from "vitest";
import { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  releaseRenderPixels,
  allocateRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
const surface = (width = 32, height = 24, opaque = false) =>
  ({ width, height, opaque }) as WebglSurface;
const limits = { pixels: 65536, metadata: 65536 };
it("owns only live framebuffer entries across scratch, preserving original transforms and blur bounds", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const root = surface(),
      bounds = new WebglBounds(root),
      target = surface();
    let retained = 0;
    for (let n = 0; n < 4; n++) {
      memory.beginScratch();
      bounds.clear(target, null);
      bounds.draw(target, [1, 0, 0, 1, 5.5, 7.25], 3, 2);
      memory.endScratch();
      expect(bounds.snapshot(target)).toEqual({
        left: 3,
        top: 5,
        right: 11,
        bottom: 12,
      });
      if (!n) retained = memory.statistics.current.metadata;
      expect(memory.statistics.current.metadata).toBe(retained);
      expect(memory.statistics.reservations).toBe(2);
    }
    bounds.blur(target, 1.5);
    expect(bounds.snapshot(target)).toEqual({
      left: 1,
      top: 3,
      right: 13,
      bottom: 14,
    });
    bounds.release(target);
    expect(bounds.region(target)).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(512);
    bounds.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("reserves framebuffer entry capacity before its original native rectangle getters", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 600 });
  await withManagedMemory(memory, async () => {
    const target = surface(),
      width = vi.fn(() => 32);
    Object.defineProperty(target, "width", { get: width });
    const bounds = new WebglBounds(target);
    expect(() => bounds.full(target)).toThrow("metadata");
    expect(width).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(512);
    expect(bounds.snapshot(target)).toBeNull();
    bounds.dispose();
    memory.dispose();
  });
});
it("preserves null rectangle/transform failures and releases incomplete controllers and arrays", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const target = surface(),
      bounds = new WebglBounds(target);
    bounds.include(target, { left: 1, top: 2, right: 5, bottom: 7 });
    const before = memory.statistics.current.metadata,
      rect = bounds.snapshot(target);
    const bad = { left: 0, top: 0, right: 4, bottom: 4 };
    Object.defineProperty(bad, "left", {
      get: () => {
        throw null;
      },
    });
    let caught: unknown = "missing";
    try {
      bounds.transform(target, bad, [1, 0, 0, 1, 0, 0]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(bounds.snapshot(target)).toBe(rect);
    expect(memory.statistics.current.metadata).toBe(before);
    const other = surface();
    Object.defineProperty(other, "width", {
      get: () => {
        throw null;
      },
    });
    try {
      bounds.full(other);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(before);
    bounds.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("keeps exact original native color rounding and full readback with temporary view ownership", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const target = surface(32, 24, true),
      bounds = new WebglBounds(target);
    bounds.clear(target, [0.1, 0.2, 0.3, 0.5]);
    const metadata = memory.statistics.current.metadata,
      readRegion = vi.fn();
    const pixels = bounds.read(
      { readRegion } as unknown as WebglDevice,
      target,
    )!;
    expect(pixels).toHaveLength(32 * 24 * 4);
    expect(readRegion).not.toHaveBeenCalled();
    for (let i = 0; i < pixels.length; i += 4)
      expect([...pixels.subarray(i, i + 4)]).toEqual([13, 26, 38, 255]);
    expect(memory.statistics.current.metadata).toBe(metadata);
    releaseRenderPixels(pixels);
    expect(memory.statistics.current.pixels).toBe(0);
    bounds.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("denies color temporaries before original pixel/array production while retaining its prior color", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const target = surface(32, 24, true),
      bounds = new WebglBounds(target);
    bounds.clear(target, [1, 0, 0, 1]);
    const previous = bounds.clearColor(target),
      current = memory.statistics.current.metadata;
    const blocker = memory.reserve("metadata", limits.metadata - current - 160);
    const color: [number, number, number, number] = [0, 1, 0, 1],
      map = vi.spyOn(color, "slice");
    expect(() => bounds.clear(target, color)).toThrow("metadata");
    expect(map).not.toHaveBeenCalled();
    expect(bounds.clearColor(target)).toBe(previous);
    expect(memory.statistics.current.pixels).toBe(0);
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(current);
    bounds.dispose();
    memory.dispose();
  });
});
it("releases partial read pixels/views after null native region failure and supports allocator-first disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const target = surface(32, 24, true),
      bounds = new WebglBounds(target);
    bounds.clear(target, [0, 0, 0, 1]);
    bounds.include(target, { left: 1, top: 1, right: 3, bottom: 3 });
    const metadata = memory.statistics.current.metadata;
    const readRegion = vi.fn(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      bounds.read({ readRegion } as unknown as WebglDevice, target);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(readRegion).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.pixels).toBe(0);
    expect(memory.statistics.current.metadata).toBe(metadata);
    // Actual region rows preserve native placement and release their borrowed backing after copying.
    const device = {
      readRegion: () =>
        allocateRenderPixels(
          16,
          () =>
            new Uint8Array([
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            ]),
        ),
    } as unknown as WebglDevice;
    const result = bounds.read(device, target)!;
    expect([...result.subarray((32 + 1) * 4, (32 + 3) * 4)]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect([...result.subarray((64 + 1) * 4, (64 + 3) * 4)]).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    releaseRenderPixels(result);
    expect(memory.statistics.current.pixels).toBe(0);
    expect(memory.statistics.current.metadata).toBe(metadata);
    memory.dispose();
    bounds.dispose();
    expect(memory.statistics.reservations).toBe(0);
    expect(bounds.snapshot(target)).toBeNull();
    expect(bounds.clearColor(target)).toBeUndefined();
  });
});
