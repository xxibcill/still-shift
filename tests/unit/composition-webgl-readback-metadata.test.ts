import { expect, it, vi } from "vitest";
import { WebglReadback } from "../../packages/renderer-core/src/composition/render/webgl-readback.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateRenderPixels,
  releaseRenderPixels,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 65536, metadata: 4096 };
const full = () =>
  allocateRenderPixels(48, () => new Uint8ClampedArray(48).fill(7));
it("admits readback state before either original pixel producer", async () => {
  const memory = new ManagedMemory({ pixels: 64, metadata: 191 });
  await withManagedMemory(memory, async () => {
    const producer = vi.fn(full);
    expect(() => new WebglReadback(4, 3, producer, producer)).toThrow(
      "metadata",
    );
    expect(producer).not.toHaveBeenCalled();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("keeps only the current union across scratch and releases bounds after actual bottom-up consumption", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const seen: Bounds[] = [];
    const cache = new WebglReadback(
      4,
      3,
      full,
      (rect) => {
        expect(memory.statistics.current.metadata).toBe(320);
        seen.push({ ...rect });
        return allocateRenderPixels(
          16,
          () =>
            new Uint8Array([
              20, 21, 22, 255, 30, 31, 32, 255, 40, 41, 42, 255, 50, 51, 52,
              255,
            ]),
        );
      },
      undefined,
      "bottom-up",
    );
    memory.beginScratch();
    const first = cache.read();
    memory.endScratch();
    expect(first.byteLength).toBe(0);
    expect(memory.statistics.current.metadata).toBe(192);
    for (let frame = 0; frame < 4; frame++) {
      memory.beginScratch();
      cache.changed({ left: 1.25, top: 1.25, right: 2, bottom: 2 });
      cache.changed({ left: 2, top: 2, right: 3, bottom: 3 });
      memory.endScratch();
      expect(memory.statistics.current.metadata).toBe(320);
      expect(memory.statistics.reservations).toBe(3);
    }
    memory.beginScratch();
    const patched = cache.read();
    expect([...patched.slice(20, 28)]).toEqual([
      40, 41, 42, 255, 50, 51, 52, 255,
    ]);
    expect([...patched.slice(36, 44)]).toEqual([
      20, 21, 22, 255, 30, 31, 32, 255,
    ]);
    expect(memory.statistics.current.metadata).toBe(192);
    memory.endScratch();
    expect(seen).toEqual([{ left: 1, top: 1, right: 3, bottom: 3 }]);
    cache.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies original bounds getters before allocation and preserves the completed framebuffer", async () => {
  const memory = new ManagedMemory({ pixels: 256, metadata: 192 });
  await withManagedMemory(memory, async () => {
    const patch = vi.fn(() => new Uint8Array(4));
    const cache = new WebglReadback(4, 3, full, patch);
    releaseRenderPixels(cache.read());
    const region = { left: 1, top: 1, right: 2, bottom: 2 },
      getter = vi.fn(() => 1);
    Object.defineProperty(region, "left", { get: getter });
    expect(() => cache.changed(region)).toThrow("metadata");
    expect(getter).not.toHaveBeenCalled();
    expect(cache.read()).toEqual(new Uint8ClampedArray(48).fill(7));
    expect(patch).not.toHaveBeenCalled();
    cache.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("preserves null rectangle failures and original unknown-update precedence without retaining stale bounds", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const producer = vi.fn(full),
      patch = vi.fn(() => new Uint8Array(4));
    const cache = new WebglReadback(4, 3, producer, patch);
    releaseRenderPixels(cache.read());
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    const bad = { left: 0, top: 0, right: 3, bottom: 3 };
    Object.defineProperty(bad, "left", {
      get: () => {
        throw null;
      },
    });
    let caught: unknown = "missing";
    try {
      cache.changed(bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(320);
    cache.changed({ left: 3, top: 2, right: 2, bottom: 1 });
    cache.changed(null);
    expect(memory.statistics.current.metadata).toBe(320);
    cache.changed();
    expect(memory.statistics.current.metadata).toBe(192);
    cache.changed(bad);
    releaseRenderPixels(cache.read());
    expect(producer).toHaveBeenCalledTimes(2);
    expect(patch).not.toHaveBeenCalled();
    cache.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("admits borrowed row views before subarray and releases failed native patches while preserving pending bounds", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    let pixels: Uint8Array | undefined;
    const subarray = vi.fn();
    const cache = new WebglReadback(4, 3, full, () => {
      pixels = allocateRenderPixels(4, () => new Uint8Array([20, 21, 22, 255]));
      subarray.mockImplementation(pixels.subarray.bind(pixels));
      pixels.subarray = subarray;
      return pixels;
    });
    releaseRenderPixels(cache.read());
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    const blocker = memory.reserve("metadata", limits.metadata - 320 - 127);
    expect(() => cache.read()).toThrow("metadata");
    expect(subarray).not.toHaveBeenCalled();
    expect(pixels!.byteLength).toBe(0);
    expect(memory.statistics.current.pixels).toBe(48);
    blocker.release();
    const result = cache.read();
    expect([...result.slice(20, 24)]).toEqual([20, 21, 22, 255]);
    expect(subarray).toHaveBeenCalledTimes(1);
    expect(pixels!.byteLength).toBe(0);
    releaseRenderPixels(result);
    cache.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("preserves null native patch failures and destroys actual retained pixels after scope exit or allocator-first disposal", async () => {
  const memory = new ManagedMemory(limits);
  let cache: WebglReadback | undefined, pixels: Uint8ClampedArray | undefined;
  await withManagedMemory(memory, async () => {
    cache = new WebglReadback(
      4,
      3,
      () => (pixels = full()),
      () => {
        throw null;
      },
    );
    releaseRenderPixels(cache.read());
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    let caught: unknown = "missing";
    try {
      cache.read();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current).toEqual({ pixels: 48, metadata: 320 });
  });
  cache!.dispose();
  expect(pixels!.byteLength).toBe(0);
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  cache!.dispose();
  memory.dispose();
  const second = new ManagedMemory(limits);
  await withManagedMemory(second, async () => {
    const cache = new WebglReadback(
      4,
      3,
      () => (pixels = full()),
      () => new Uint8Array(4),
    );
    releaseRenderPixels(cache.read());
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    second.dispose();
    expect(pixels!.byteLength).toBe(0);
    cache.dispose();
    expect(second.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(second.statistics.reservations).toBe(0);
  });
});
