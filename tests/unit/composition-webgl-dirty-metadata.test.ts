import { expect, it, vi } from "vitest";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
const limits = { pixels: 65536, metadata: 65536 };
function dirty(device: WebglDevice) {
  return (device as unknown as { dirtyScreens: Set<WebglSurface> })
    .dirtyScreens;
}
function resolve(device: WebglDevice, surface: WebglSurface) {
  (
    device as unknown as { resolveScreen(surface: WebglSurface): void }
  ).resolveScreen(surface);
}
it("admits original dirty Set entry before add and cleans incomplete actual native screen on one-byte denial", async () => {
  const memory = new ManagedMemory({ pixels: 65536, metadata: 3407 });
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const add = vi.spyOn(dirty(device), "add");
    expect(() => device.surface(2, 2, false, false, true)).toThrow("metadata");
    expect(add).not.toHaveBeenCalled();
    expect(gl.clear).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(device.allocated).toBe(0);
    expect(dirty(device).size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    add.mockRestore();
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("reuses admitted original dirty slots across duplicate adds and original native resolve/delete cycles", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2, false, false, true);
    const before = memory.statistics.current.metadata;
    expect(before).toBe(2128);
    for (let i = 0; i < 4; i++) {
      device.clear(surface);
      expect(dirty(device).size).toBe(1);
      resolve(device, surface);
      expect(dirty(device).size).toBe(0);
      expect(memory.statistics.current.metadata).toBe(before);
    }
    expect(gl.blitFramebuffer).toHaveBeenCalledTimes(4);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("charges maximum actual simultaneous dirty entries and reuses that capacity after native resolution", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const first = device.surface(2, 2, false, false, true);
    const second = device.surface(2, 2, false, false, true);
    expect(dirty(device).size).toBe(2);
    expect(memory.statistics.current.metadata).toBe(3232);
    resolve(device, first);
    resolve(device, second);
    device.clear(second);
    device.clear(first);
    expect(dirty(device).size).toBe(2);
    expect(memory.statistics.current.metadata).toBe(3232);
    memory.dispose();
    device.dispose();
    expect(dirty(device).size).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves original null Set producer failure, rolls back entry capacity and permits native screen retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const add = vi.spyOn(dirty(device), "add").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.surface(2, 2, false, false, true);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(dirty(device).size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    add.mockRestore();
    device.surface(2, 2, false, false, true);
    expect(dirty(device).size).toBe(1);
    expect(memory.statistics.current.metadata).toBe(2128);
    device.dispose();
    memory.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("removes a failed native screen's actual dirty reference while preserving independently admitted dirty peak capacity", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = fakeWebglDevice();
    const device = new WebglDevice(canvas);
    const surfaces = (device as unknown as { surfaces: Set<WebglSurface> })
      .surfaces;
    const add = vi.spyOn(surfaces, "add").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.surface(2, 2, false, false, true);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(dirty(device).size).toBe(0);
    expect(device.allocated).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1064 });
    add.mockRestore();
    device.surface(2, 2, false, false, true);
    expect(dirty(device).size).toBe(1);
    expect(memory.statistics.current.metadata).toBe(2128);
    device.dispose();
    memory.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  });
});
