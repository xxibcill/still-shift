import { afterEach, expect, it, vi } from "vitest";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  releaseRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
const limits = { pixels: 65536, metadata: 65536 };
afterEach(() => vi.restoreAllMocks());
it("denies actual row-view capacity before subarray and releases failed actual readback/row storage", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 4, false, false, true);
    const before = memory.statistics.current;
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - 127,
    );
    const view = vi.spyOn(Uint8Array.prototype, "subarray");
    expect(() => device.readRegion(surface, 0, 0, 2, 4)).toThrow("metadata");
    expect(view).not.toHaveBeenCalled();
    expect(gl.readPixels).toHaveBeenCalledTimes(1);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    view.mockRestore();
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves original top-down screen bytes and native-row mode with unchanged native read count and pixel peak", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 4, false, false, true);
    const before = memory.statistics.current.metadata;
    const pixels = device.readRegion(surface, 0, 0, 2, 4);
    const expected = [
      ...Array.from({ length: 8 }, (_, i) => i + 24),
      ...Array.from({ length: 8 }, (_, i) => i + 16),
      ...Array.from({ length: 8 }, (_, i) => i + 8),
      ...Array.from({ length: 8 }, (_, i) => i),
    ];
    expect([...pixels]).toEqual(expected);
    expect(memory.statistics.peak.pixels).toBe(72);
    expect(memory.statistics.current.metadata).toBe(before);
    releaseRenderPixels(pixels);
    const native = device.readRegion(surface, 0, 0, 2, 4, "native");
    expect([...native]).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect(gl.readPixels).toHaveBeenCalledTimes(2);
    releaseRenderPixels(native);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("preserves original null row-view producer failure, clears attempted owner/storage and permits exact retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 4, false, false, true);
    const before = memory.statistics.current;
    const view = vi
      .spyOn(Uint8Array.prototype, "subarray")
      .mockImplementationOnce(() => {
        throw null;
      });
    let caught: unknown = "missing";
    try {
      device.readRegion(surface, 0, 0, 2, 4);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current).toEqual(before);
    view.mockRestore();
    const pixels = device.readRegion(surface, 0, 0, 2, 4);
    expect(pixels[0]).toBe(24);
    releaseRenderPixels(pixels);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("denies original swap tuple capacity before native handle getters or mutations", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const first = device.surface(2, 2),
      second = device.surface(2, 2);
    const original = first.texture;
    const getter = vi.fn(() => original),
      setter = vi.fn();
    Object.defineProperty(first, "texture", {
      configurable: true,
      get: getter,
      set: setter,
    });
    const before = memory.statistics.current;
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - 255,
    );
    expect(() => device.swap(first, second)).toThrow("metadata");
    expect(getter).not.toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    Object.defineProperty(first, "texture", {
      value: original,
      writable: true,
    });
    device.dispose();
    memory.dispose();
  });
});
it("preserves original exchanged native handle identities/cleanup and clears temporary swap capacity", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const first = device.surface(2, 2),
      second = device.surface(2, 2);
    const firstTexture = first.texture,
      firstFramebuffer = first.framebuffer;
    const secondTexture = second.texture,
      secondFramebuffer = second.framebuffer;
    const before = memory.statistics.current;
    device.swap(first, second);
    expect(first.texture).toBe(secondTexture);
    expect(first.framebuffer).toBe(secondFramebuffer);
    expect(second.texture).toBe(firstTexture);
    expect(second.framebuffer).toBe(firstFramebuffer);
    expect(memory.statistics.current).toEqual(before);
    device.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledWith(firstTexture);
    expect(gl.deleteTexture).toHaveBeenCalledWith(secondTexture);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves original null swap getter failure before mutation and releases temporary controls", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const first = device.surface(2, 2),
      second = device.surface(2, 2);
    const original = second.texture;
    const getter = vi.fn(() => {
      throw null;
    });
    Object.defineProperty(second, "texture", {
      configurable: true,
      get: getter,
    });
    const before = memory.statistics.current;
    let caught: unknown = "missing";
    try {
      device.swap(first, second);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(getter).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual(before);
    Object.defineProperty(second, "texture", {
      value: original,
      writable: true,
    });
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
