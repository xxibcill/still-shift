import { expect, it } from "vitest";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 65536, metadata: 65536 };
const setup = fakeWebglDevice;

it("admits actual device maps/sets/options and native control before context/VAO production", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 1023 });
  await withManagedMemory(memory, async () => {
    const { canvas, getContext, gl } = setup();
    expect(() => new WebglDevice(canvas)).toThrow("metadata");
    expect(getContext).not.toHaveBeenCalled();
    expect(gl.createVertexArray).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("releases constructor state on unavailable context and original null native setup failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, getContext, gl } = setup();
    getContext.mockReturnValueOnce(null as unknown as typeof gl);
    expect(() => new WebglDevice(canvas)).toThrow("WebGL2 is unavailable");
    expect(memory.statistics.current.metadata).toBe(0);
    gl.bindVertexArray.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      new WebglDevice(canvas);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies actual surface/control capacity before native texture/framebuffer creation and restores prior Set capacity", async () => {
  const memory = new ManagedMemory({ pixels: 65536, metadata: 2599 });
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    expect(() => device.surface(2, 2)).toThrow("metadata");
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(device.allocated).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("keeps the original pixel admission before native texture creation while restoring actual metadata owners", async () => {
  const memory = new ManagedMemory({ pixels: 15, metadata: 65536 });
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    expect(() => device.surface(2, 2)).toThrow("pixels");
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.dispose();
    memory.dispose();
  });
});
it("retains actual surface/native framebuffer control through original pool reuse and destroys it once at discard", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2);
    expect(memory.owns(surface)).toBe(true);
    expect(memory.statistics.current).toEqual({ pixels: 16, metadata: 2088 });
    device.release(surface);
    const cached = device.surface(2, 2);
    expect(cached).toBe(surface);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(1);
    expect(gl.clear).toHaveBeenCalledTimes(2);
    device.discard(cached);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(memory.owns(surface)).toBe(false);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1410 });
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("cleans native null surface failure and metadata while leaving the device reusable", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    gl.clear.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.surface(2, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(device.allocated).toBe(0);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    const surface = device.surface(2, 2);
    expect(memory.owns(surface)).toBe(true);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});
it("uses captured actual native/metadata cleanup after scope exit and allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    const { canvas, gl } = setup();
    const device = await withManagedMemory(memory, async () => {
      const device = new WebglDevice(canvas);
      device.release(device.surface(2, 2));
      return device;
    });
    if (allocatorFirst) memory.dispose();
    device.dispose();
    memory.dispose();
    expect(device.allocated).toBe(0);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  }
});
it("visits every actual surface owner on disposal and preserves first native null failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    device.surface(2, 2);
    device.surface(3, 2);
    gl.deleteFramebuffer.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.dispose();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(device.allocated).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("preserves unmanaged native pool/discard behavior without requiring a metadata scope", () => {
  const { canvas, gl } = setup();
  const device = new WebglDevice(canvas);
  const surface = device.surface(2, 2);
  device.release(surface);
  expect(device.surface(2, 2)).toBe(surface);
  device.discard(surface);
  device.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
  expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
});
it("releases incomplete actual framebuffer despite a secondary texture destructor failure while preserving original null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    const device = new WebglDevice(canvas);
    gl.clear.mockImplementationOnce(() => {
      throw null;
    });
    gl.deleteTexture.mockImplementationOnce(() => {
      throw Error("texture cleanup");
    });
    let caught: unknown = "missing";
    try {
      device.surface(2, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(device.allocated).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("retains actual device/surface/native owners across scratch cleanup and original frame pool reuse", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { canvas, gl } = setup();
    memory.beginScratch();
    const device = new WebglDevice(canvas);
    const surface = device.surface(2, 2);
    device.release(surface);
    memory.endScratch();
    expect(memory.owns(surface)).toBe(true);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.statistics.current.metadata).toBeGreaterThan(2088);
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();
    memory.beginScratch();
    expect(device.surface(2, 2)).toBe(surface);
    memory.endScratch();
    expect(memory.owns(surface)).toBe(true);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  });
});
