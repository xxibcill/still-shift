import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  WebglPaint,
  type PreparedPaint,
} from "../../packages/renderer-core/src/composition/render/webgl-paint.ts";
import type { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 65536, metadata: 1024 * 1024 };
function surface(screen = false): WebglSurface {
  return {
    width: 64,
    height: 64,
    floating: false,
    opaque: false,
    screen,
    texture: {} as WebGLTexture,
    framebuffer: {} as WebGLFramebuffer,
  };
}
function harness(screen = false) {
  const dst = surface(screen),
    output = surface(),
    backdrop = surface();
  const gl = {
    BLEND: 1,
    FUNC_ADD: 2,
    ONE: 3,
    ONE_MINUS_SRC_ALPHA: 4,
    enable: vi.fn(),
    disable: vi.fn(),
    blendEquation: vi.fn(),
    blendFunc: vi.fn(),
  };
  const device = {
    gl,
    drawRegion: vi.fn(
      (_dst: WebglSurface, rect: Bounds): Bounds | null => rect,
    ),
    surface: vi.fn(() => output),
    copyRegion: vi.fn(() => backdrop),
    pass: vi.fn(),
    swap: vi.fn(),
    release: vi.fn(),
  };
  const bounds = {
    snapshot: vi.fn((): Bounds | null => null),
    include: vi.fn(),
  };
  const paint = new WebglPaint(
    device as unknown as WebglDevice,
    bounds as unknown as WebglBounds,
  );
  return { paint, device, bounds, gl, dst, output, backdrop };
}
function parts(count: number): PreparedPaint[] {
  return Array.from({ length: count }, (_, i) => ({
    surface: surface(),
    rect: { left: i * 2 + 0.25, top: 1.5, right: i * 2 + 1.25, bottom: 3.5 },
    primitive: true,
  }));
}
afterEach(() => vi.restoreAllMocks());

it("denies visible pointer/control capacity before original filter or native geometry consumer", async () => {
  const input = parts(2);
  const memory = new ManagedMemory({ pixels: 65536, metadata: 1039 });
  await withManagedMemory(memory, async () => {
    const { paint, device, dst } = harness();
    const filter = vi.spyOn(input, "filter");
    expect(() => paint.drawMany(input, dst)).toThrow("metadata");
    expect(filter).not.toHaveBeenCalled();
    expect(device.drawRegion).not.toHaveBeenCalled();
    expect(device.surface).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("denies one byte before original batch slice and releases the actual original filtered array", async () => {
  const input = parts(2);
  const memory = new ManagedMemory({
    pixels: 65536,
    metadata: 1040 + 10240 - 1,
  });
  await withManagedMemory(memory, async () => {
    const { paint, device, dst } = harness();
    const original = input.filter;
    let filtered: PreparedPaint[] | undefined;
    vi.spyOn(input, "filter").mockImplementation(function (callback) {
      filtered = original.call(input, callback);
      return filtered;
    });
    const slice = vi.spyOn(Array.prototype, "slice");
    expect(() => paint.drawMany(input, dst)).toThrow("metadata");
    expect(slice.mock.contexts.includes(filtered)).toBe(false);
    expect(device.drawRegion).toHaveBeenCalledTimes(2);
    expect(device.surface).not.toHaveBeenCalled();
    expect(filtered).toHaveLength(0);
    expect(input).toHaveLength(2);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("preserves original complete two/15-part shader bytes from pushed 201449e and clears actual input/uniform arrays after GPU consumption", async () => {
  // SHA256 of complete shader text captured by the original public drawMany path.
  const hashes = new Map([
    [2, "86721ebf772780e17b12d8124fc68c6f954172f69d0133faaf906cb95d1b9f58"],
    [15, "04f47a4e246db264713b1c674c02a1ae3c3d25aef854b4580ae67b4d1b75a8f8"],
  ]);
  for (const count of [2, 15]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const { paint, device, bounds, dst, output } = harness();
      const input = parts(count);
      let actualInputs: WebglSurface[] | undefined;
      let actualUniforms: Record<string, number | number[]> | undefined;
      let regionArray: number[] | undefined;
      device.pass.mockImplementation(
        (
          shader: string,
          target: WebglSurface,
          inputs: WebglSurface[],
          uniforms: Record<string, number | number[]>,
        ) => {
          expect(createHash("sha256").update(shader).digest("hex")).toBe(
            hashes.get(count),
          );
          expect(target).toBe(output);
          expect(inputs).toEqual([dst, ...input.map((part) => part.surface)]);
          expect(uniforms.region0).toEqual([0.25, 1.5, 1.25, 3.5]);
          expect(uniforms["primitive" + (count - 1)]).toBe(1);
          expect(memory.statistics.current.metadata).toBe(
            1024 + 8 * count + 2048 + 4096 * count,
          );
          actualInputs = inputs;
          actualUniforms = uniforms;
          regionArray = uniforms.region0 as number[];
        },
      );
      paint.drawMany(input, dst);
      expect(actualInputs).toHaveLength(0);
      expect(Object.keys(actualUniforms!)).toHaveLength(0);
      expect(regionArray).toHaveLength(0);
      expect(input).toHaveLength(count);
      expect(input[0]!.rect).toEqual({
        left: 0.25,
        top: 1.5,
        right: 1.25,
        bottom: 3.5,
      });
      expect(device.swap).toHaveBeenCalledWith(dst, output);
      expect(bounds.include.mock.invocationCallOrder[0]).toBeGreaterThan(
        device.swap.mock.invocationCallOrder[0]!,
      );
      expect(device.release).toHaveBeenCalledTimes(1);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  }
});

it("keeps original 15-sampler batch partition/order and single remainder values while clearing each arena before next batch", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { paint, device, dst } = harness();
    const input = parts(16);
    const counts: number[] = [];
    const shapes: number[][] = [];
    let firstInputs: WebglSurface[] | undefined;
    device.pass.mockImplementation(
      (
        _shader: string,
        _target: WebglSurface,
        inputs: WebglSurface[],
        uniforms: Record<string, number | number[]>,
      ) => {
        counts.push(inputs.length);
        shapes.push([...((uniforms.region0 ?? uniforms.region) as number[])]);
        if (counts.length === 1) firstInputs = inputs;
        else expect(firstInputs).toHaveLength(0);
      },
    );
    paint.drawMany(input, dst);
    expect(counts).toEqual([16, 2]);
    expect(shapes).toEqual([
      [0.25, 1.5, 1.25, 3.5],
      [30.25, 1.5, 31.25, 3.5],
    ]);
    expect(device.release).toHaveBeenCalledTimes(2);
    expect(input).toHaveLength(16);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("denies single-draw controls before original array getters, native blend setup or framebuffer production", async () => {
  const memory = new ManagedMemory({ pixels: 65536, metadata: 1535 });
  await withManagedMemory(memory, async () => {
    const { paint, device, gl, dst } = harness();
    const left = vi.fn(() => 0.25);
    const rect = {
      get left() {
        return left();
      },
      top: 1.5,
      right: 1.25,
      bottom: 3.5,
    };
    expect(() => paint.draw(surface(), dst, rect, false)).toThrow("metadata");
    expect(left).not.toHaveBeenCalled();
    expect(gl.enable).not.toHaveBeenCalled();
    expect(device.surface).not.toHaveBeenCalled();
    expect(device.pass).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("holds exact single-draw/blend uniforms through native consumption and clears owned arrays while preserving borrowed bounds", async () => {
  for (const blended of [false, true]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const { paint, device, gl, bounds, dst, output } = harness();
      const source = surface(),
        rect = parts(1)[0]!.rect;
      let inputs: WebglSurface[] | undefined;
      let uniforms: Record<string, number | number[]> | undefined;
      let origin: number[] | undefined;
      device.pass.mockImplementation(
        (
          _shader: string,
          target: WebglSurface,
          actual: WebglSurface[],
          values: Record<string, number | number[]>,
          blend: boolean,
        ) => {
          expect(target).toBe(blended ? dst : output);
          expect(actual).toEqual(blended ? [source] : [source, dst]);
          expect(blend).toBe(blended);
          expect(values.origin).toEqual([0.25, 1.5]);
          expect(memory.statistics.current.metadata).toBe(1536);
          inputs = actual;
          uniforms = values;
          origin = values.origin as number[];
        },
      );
      paint.draw(source, dst, rect, !blended);
      expect(inputs).toHaveLength(0);
      expect(Object.keys(uniforms!)).toHaveLength(0);
      expect(origin).toHaveLength(0);
      expect(rect).toEqual({ left: 0.25, top: 1.5, right: 1.25, bottom: 3.5 });
      expect(bounds.include).toHaveBeenCalledWith(dst, rect);
      if (blended) {
        expect(gl.blendFunc).toHaveBeenCalledWith(
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );
        expect(gl.disable).toHaveBeenCalledWith(gl.BLEND);
        expect(device.release).not.toHaveBeenCalled();
      } else expect(device.release).toHaveBeenCalledWith(output);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  }
});

it("preserves original null draw over secondary release failure, clears actual owners and permits retry", async () => {
  for (const many of [false, true]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const { paint, device, dst } = harness();
      const input = parts(2);
      let actualInputs: WebglSurface[] | undefined;
      device.pass.mockImplementationOnce(
        (_shader: string, _dst: WebglSurface, inputs: WebglSurface[]) => {
          actualInputs = inputs;
          throw null;
        },
      );
      device.release.mockImplementationOnce(() => {
        throw Error("secondary release");
      });
      let caught: unknown = "missing";
      try {
        if (many) paint.drawMany(input, dst);
        else paint.draw(input[0]!.surface, dst, input[0]!.rect);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeNull();
      expect(actualInputs).toHaveLength(0);
      expect(device.release).toHaveBeenCalledTimes(1);
      expect(memory.statistics.current.metadata).toBe(0);
      paint.drawMany(input, dst);
      expect(device.pass).toHaveBeenCalledTimes(2);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  }
});

it("cleans the original native output after a null uniform getter and keeps original geometry getter order", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { paint, device, dst, output } = harness();
    const input = parts(2);
    let reads = 0;
    input[0]!.rect = {
      get left() {
        if (++reads === 2) throw null;
        return 0.25;
      },
      top: 1.5,
      right: 1.25,
      bottom: 3.5,
    };
    let caught: unknown = "missing";
    try {
      paint.drawMany(input, dst);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(reads).toBe(2);
    expect(device.pass).not.toHaveBeenCalled();
    expect(device.release).toHaveBeenCalledWith(output);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("preserves screen/backdrop and early-empty behavior and clears actual unmanaged arrays after their consumers", () => {
  const { paint, device, dst, backdrop } = harness(true);
  const input = parts(2);
  let actual: WebglSurface[] | undefined;
  device.pass.mockImplementation(
    (_shader: string, target: WebglSurface, inputs: WebglSurface[]) => {
      expect(target).toBe(dst);
      expect(inputs[0]).toBe(backdrop);
      actual = inputs;
    },
  );
  paint.drawMany(input, dst);
  expect(actual).toHaveLength(0);
  expect(device.release).toHaveBeenCalledWith(backdrop);
  expect(device.swap).not.toHaveBeenCalled();
  device.drawRegion.mockReturnValue(null);
  paint.draw(input[0]!.surface, dst, input[0]!.rect);
  paint.drawMany([], dst);
  expect(device.pass).toHaveBeenCalledTimes(1);
  expect(input).toHaveLength(2);
});
