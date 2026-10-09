import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  boxBlur,
  boxSteps,
} from "../../packages/renderer-core/src/composition/render/webgl-box-blur.ts";
import { WebglDevice as NativeDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
const limits = { pixels: 65536, metadata: 64 * 1024 * 1024 };
afterEach(() => vi.restoreAllMocks());
function harness() {
  const dst = { width: 173, height: 107 } as WebglSurface;
  const bodies: string[] = [];
  const device = {
    gl: { MAX_TEXTURE_SIZE: 3379, getParameter: () => 8192 },
    surface: vi.fn(
      (width: number, height: number) => ({ width, height }) as WebglSurface,
    ),
    pass: vi.fn((body: string) => {
      bodies.push(body);
    }),
    clear: vi.fn(),
    release: vi.fn(),
  };
  const kernel = { radius: 44, divisor: 900, lengths: [30] };
  return { device, gpu: device as unknown as WebglDevice, dst, kernel, bodies };
}
function expectDisposed(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}

it("denies actual cache Maps one byte before construction", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 767 });
  await withManagedMemory(memory, async () => {
    const map = vi.spyOn(globalThis, "Map");
    expect(() => boxSteps(30)).toThrow("metadata");
    expect(map).not.toHaveBeenCalled();
    map.mockRestore();
    memory.dispose();
    expectDisposed(memory);
  });
});

it("denies predecessor/view production before Float64Array despite an unmanaged warm cache", async () => {
  const borrowed = boxSteps(33);
  const memory = new ManagedMemory({
    ...limits,
    metadata: 768 + 512 + 256 * 34 - 1,
  });
  await withManagedMemory(memory, async () => {
    const array = vi.spyOn(globalThis, "Float64Array");
    expect(() => boxSteps(33)).toThrow("metadata");
    expect(array).not.toHaveBeenCalled();
    array.mockRestore();
    expect(borrowed.length).toBeGreaterThan(0);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("preserves all 5768 original steps for lengths 2–1500 and owns each actual cached array", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const values = Array.from({ length: 1499 }, (_, index) =>
      boxSteps(index + 2),
    );
    expect(
      createHash("sha256").update(JSON.stringify(values)).digest("hex"),
    ).toBe("da3048ebeaa77c7fada428b9ec09ff682f8e3ec02ade5bc26a28f215abc8a42c");
    expect(values.reduce((count, value) => count + value.length, 0)).toBe(5768);
    for (const [index, value] of values.entries()) {
      expect(memory.owns(value)).toBe(true);
      expect(boxSteps(index + 2)).toBe(value);
    }
    expect(memory.statistics.current.pixels).toBe(0);
    memory.dispose();
    for (const value of values) expect(value).toHaveLength(0);
    expectDisposed(memory);
  });
});

it("retains cached actual steps through scratch and releases/rebuilds only the selected entry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    const first = boxSteps(30),
      second = boxSteps(31);
    memory.endScratch();
    expect(first).toEqual([
      { multiple: 3, extra: 2 },
      { multiple: 6, extra: 0 },
    ]);
    expect(memory.owns(first)).toBe(true);
    const before = memory.statistics.current.metadata;
    releaseRenderMetadata(first);
    expect(first).toHaveLength(0);
    expect(memory.statistics.current.metadata).toBe(before - 624 - 40);
    expect(boxSteps(31)).toBe(second);
    const rebuilt = boxSteps(30);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.length).toBe(2);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("keeps actual cache ownership distinct across allocator scopes and preserves unmanaged identity", async () => {
  const original = boxSteps(30),
    a = new ManagedMemory(limits),
    b = new ManagedMemory(limits);
  let first: ReturnType<typeof boxSteps> | undefined;
  await withManagedMemory(a, async () => {
    first = boxSteps(30);
    expect(first).not.toBe(original);
  });
  await withManagedMemory(b, async () => {
    const second = boxSteps(30);
    expect(second).not.toBe(first);
    expect(b.owns(second)).toBe(true);
    a.dispose();
    expect(first).toHaveLength(0);
    expect(second.length).toBe(2);
    b.dispose();
    expect(second).toHaveLength(0);
  });
  expect(boxSteps(30)).toBe(original);
  expect(original.length).toBe(2);
  expectDisposed(a);
  expectDisposed(b);
});

it("preserves null cost fill failure, detaches its actual backing and supports cache retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    let backing: ArrayBufferLike | undefined;
    const fill = vi
      .spyOn(Float64Array.prototype, "fill")
      .mockImplementationOnce(function (this: Float64Array) {
        backing = this.buffer;
        throw null;
      });
    let caught: unknown = "missing";
    try {
      boxSteps(30);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(backing!.byteLength).toBe(0);
    expectDisposed(memory);
    fill.mockRestore();
    expect(boxSteps(30).length).toBe(2);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("rolls back a late null plan insertion and actual array without contaminating the cache", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const set = Map.prototype.set;
    let failed = false,
      actual: unknown[] | undefined;
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) {
      const result = set.call(this, key, value);
      if (!failed && key === 30 && Array.isArray(value)) {
        failed = true;
        actual = value;
        throw null;
      }
      return result;
    });
    let caught: unknown = "missing";
    try {
      boxSteps(30);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(actual).toHaveLength(0);
    expectDisposed(memory);
    spy.mockRestore();
    expect(boxSteps(30).length).toBe(2);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("denies the complete shader working owner before original Array.from text production", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 1432 + 1872 + 16384 - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = harness();
    boxSteps(30, h.gpu);
    const retained = memory.statistics.current.metadata;
    expect(retained).toBe(1432);
    const from = vi.spyOn(Array, "from");
    expect(() => boxBlur(h.gpu, h.dst, h.kernel)).toThrow("metadata");
    expect(from).not.toHaveBeenCalled();
    expect(h.device.pass).not.toHaveBeenCalled();
    expect(h.device.release).toHaveBeenCalledTimes(4);
    expect(memory.statistics.current.metadata).toBe(retained);
    from.mockRestore();
    memory.dispose();
    expectDisposed(memory);
  });
});

it("preserves null shader term production and releases working text while retaining valid plans for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness();
    boxSteps(30, h.gpu);
    const retained = memory.statistics.current.metadata;
    const from = vi.spyOn(Array, "from").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      boxBlur(h.gpu, h.dst, h.kernel);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(4);
    expect(memory.statistics.current.metadata).toBe(retained);
    from.mockRestore();
    expect(boxBlur(h.gpu, h.dst, h.kernel)).toBe(true);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("reuses original retained shader bodies and plans across scratch without regenerating terms", async () => {
  const memory = new ManagedMemory(limits);
  const h = harness();
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    expect(boxBlur(h.gpu, h.dst, h.kernel)).toBe(true);
    memory.endScratch();
    const first = [...h.bodies],
      retained = memory.statistics.current.metadata,
      reservations = memory.statistics.reservations;
    const from = vi.spyOn(Array, "from"),
      fill = vi.spyOn(Float64Array.prototype, "fill");
    memory.beginScratch();
    expect(boxBlur(h.gpu, h.dst, h.kernel)).toBe(true);
    memory.endScratch();
    expect(h.bodies.slice(first.length)).toEqual(first);
    expect(from).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(retained);
    expect(memory.statistics.reservations).toBe(reservations);
    from.mockRestore();
    fill.mockRestore();
    memory.dispose();
    expectDisposed(memory);
  });
});

it("rolls back late null shader insertion and clears its actual generated text before retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness();
    boxSteps(30, h.gpu);
    const retained = memory.statistics.current.metadata;
    const set = Map.prototype.set;
    let actual: { body: string; key: string } | undefined;
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) {
      const result = set.call(this, key, value);
      if (
        !actual &&
        typeof key === "string" &&
        value &&
        typeof value === "object" &&
        "body" in value &&
        "key" in value
      ) {
        actual = value as { body: string; key: string };
        throw null;
      }
      return result;
    });
    let caught: unknown = "missing";
    try {
      boxBlur(h.gpu, h.dst, h.kernel);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(actual).toEqual(expect.objectContaining({ key: "", body: "" }));
    expect(memory.statistics.current.metadata).toBe(retained);
    spy.mockRestore();
    expect(boxBlur(h.gpu, h.dst, h.kernel)).toBe(true);
    memory.dispose();
    expectDisposed(memory);
  });
});

it("preserves all 27 complete original shader bodies across supported lengths 4–1500 within admitted text capacity", async () => {
  const memory = new ManagedMemory(limits),
    h = harness();
  h.kernel.lengths = Array.from({ length: 1497 }, (_, index) => index + 4);
  await withManagedMemory(memory, async () => {
    expect(boxBlur(h.gpu, h.dst, h.kernel)).toBe(true);
    const bodies = [...new Set(h.bodies)].sort();
    expect(bodies.length).toBe(27);
    expect(Math.max(...bodies.map((body) => body.length))).toBe(1013);
    expect(
      createHash("sha256").update(JSON.stringify(bodies)).digest("hex"),
    ).toBe("7a2385d4058be7351b9931a54687de52660e31a387c8c33cc542b6bf14d0e4a0");
    memory.dispose();
    expectDisposed(memory);
  });
});

it("preserves original empty/NaN/native invalid-length behavior with managed empty owners", async () => {
  expect(boxSteps(NaN)).toEqual([]);
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    for (const length of [0, 1]) {
      const steps = boxSteps(length);
      expect(steps).toEqual([]);
      expect(memory.owns(steps)).toBe(true);
      expect(boxSteps(length)).toBe(steps);
    }
    const retained = memory.statistics.current.metadata;
    expect(() => boxSteps(NaN)).toThrow("reservation size");
    expect(() => boxSteps(2.5)).toThrow(TypeError);
    expect(memory.statistics.current.metadata).toBe(retained);
    expect(memory.statistics.current.pixels).toBe(0);
    memory.dispose();
    expectDisposed(memory);
  });
  expect(() => boxSteps(-2)).toThrow(RangeError);
});

it("releases actual native-device cache plans/text before allocator cleanup, including disposal after scope exit", async () => {
  for (const outsideScope of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 64 * 1024 * 1024 });
    let device: NativeDevice | undefined,
      steps: ReturnType<typeof boxSteps> | undefined;
    await withManagedMemory(memory, async () => {
      device = new NativeDevice(fakeWebglDevice().canvas);
      const dst = device.surface(4, 3);
      expect(
        boxBlur(device, dst, { radius: 4, divisor: 64, lengths: [4, 4, 4] }),
      ).toBe(true);
      steps = boxSteps(4, device);
      expect(memory.owns(steps)).toBe(true);
      if (!outsideScope) {
        device.dispose();
        expectDisposed(memory);
      }
    });
    if (outsideScope) {
      device!.dispose();
      expectDisposed(memory);
    }
    expect(steps).toHaveLength(0);
    memory.dispose();
    expectDisposed(memory);
  }
});

it("cleans actual cache arrays/text in allocator-first native disposal without duplicate owners", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 64 * 1024 * 1024 });
  await withManagedMemory(memory, async () => {
    const device = new NativeDevice(fakeWebglDevice().canvas),
      dst = device.surface(4, 3);
    expect(
      boxBlur(device, dst, { radius: 4, divisor: 64, lengths: [4, 4, 4] }),
    ).toBe(true);
    const steps = boxSteps(4, device);
    memory.dispose();
    expect(steps).toHaveLength(0);
    device.dispose();
    expectDisposed(memory);
  });
});

it("preserves original null native disposal while releasing the actual device cache", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 64 * 1024 * 1024 });
  await withManagedMemory(memory, async () => {
    const fake = fakeWebglDevice(),
      device = new NativeDevice(fake.canvas),
      dst = device.surface(4, 3);
    expect(
      boxBlur(device, dst, { radius: 4, divisor: 64, lengths: [4, 4, 4] }),
    ).toBe(true);
    const steps = boxSteps(4, device);
    fake.gl.deleteVertexArray.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.dispose();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(steps).toHaveLength(0);
    expectDisposed(memory);
    memory.dispose();
    expectDisposed(memory);
  });
});
