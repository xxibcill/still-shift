import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { WebglEffects } from "../../packages/renderer-core/src/composition/render/webgl-effects.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type {
  WebglBounds,
  WebglRect,
} from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 65536, metadata: 1024 * 1024 };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
afterEach(() => vi.restoreAllMocks());
function harness() {
  type Surface = WebglSurface & { id: number };
  let index = 0,
    region: WebglRect | null = { left: 7, top: 11, right: 125, bottom: 81 };
  const dst = { width: 173, height: 107, id: 0 } as Surface;
  const records: unknown[] = [],
    uploads: Float32Array[] = [],
    inputs: Surface[][] = [],
    arrays: number[][] = [];
  const uniforms: Record<string, number | number[]>[] = [];
  const device = {
    gl: {
      MAX_TEXTURE_SIZE: 3379,
      getParameter: vi.fn((value: number) => {
        records.push(["parameter", value]);
        return 1;
      }),
    },
    surface: vi.fn((width: number, height: number, float = false): Surface => {
      records.push(["surface", width, height, float]);
      return { id: ++index, width, height } as Surface;
    }),
    uploadFloats: vi.fn((target: Surface, values: Float32Array) => {
      uploads.push(values);
      records.push([
        "upload",
        target.id,
        values.length,
        createHash("sha256")
          .update(new Uint8Array(values.buffer))
          .digest("hex"),
      ]);
    }),
    pass: vi.fn(
      (
        body: string,
        target: Surface,
        input: Surface[],
        values: Record<string, number | number[]>,
        over?: boolean,
        clip?: WebglRect,
      ) => {
        records.push([
          "pass",
          sha(body),
          target.id,
          input.map((value) => value.id),
          JSON.parse(JSON.stringify(values)),
          over,
          clip ?? null,
        ]);
        inputs.push(input);
        uniforms.push(values);
        for (const value of Object.values(values))
          if (Array.isArray(value)) arrays.push(value);
      },
    ),
    clear: vi.fn(),
    release: vi.fn((target: Surface) => {
      records.push(["release", target.id]);
    }),
  };
  const bounds = {
    region: vi.fn(() => {
      records.push(["region"]);
      return region;
    }),
    blur: vi.fn((_surface: WebglSurface, radius: number) => {
      records.push(["boundsBlur", radius]);
      if (!region) throw Error("missing test region");
      region = {
        left: region.left - radius,
        top: region.top - radius,
        right: region.right + radius,
        bottom: region.bottom + radius,
      };
    }),
  };
  const effects = new WebglEffects(
    device as unknown as WebglDevice,
    {} as Canvas2dBackend,
    bounds as unknown as WebglBounds,
  );
  return {
    device,
    bounds,
    effects,
    dst,
    records,
    uploads,
    inputs,
    arrays,
    uniforms,
  };
}
function expectCleared(h: ReturnType<typeof harness>, memory: ManagedMemory) {
  for (const values of h.uploads) expect(values.byteLength).toBe(0);
  for (const inputs of h.inputs) expect(inputs).toHaveLength(0);
  for (const array of h.arrays) expect(array).toHaveLength(0);
  for (const uniforms of h.uniforms)
    expect(Object.keys(uniforms)).toHaveLength(0);
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}

it("denies the actual fallback phase one byte before native intermediate and flat-map production", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 600 + 16384 + 160 * 11 - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = harness(),
      flatMap = vi.spyOn(Array.prototype, "flatMap");
    expect(() => h.effects.blur(h.dst, 2)).toThrow("metadata");
    expect(h.device.gl.getParameter).toHaveBeenCalledTimes(1);
    expect(h.device.surface).not.toHaveBeenCalled();
    expect(flatMap).not.toHaveBeenCalled();
    expectCleared(h, memory);
    flatMap.mockRestore();
    memory.dispose();
  });
});

it("preserves original pixel admission before flat-map/Float32 production and releases both native owners", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 175 });
  await withManagedMemory(memory, async () => {
    const h = harness(),
      flatMap = vi.spyOn(Array.prototype, "flatMap");
    expect(() => h.effects.blur(h.dst, 2)).toThrow("pixels");
    expect(flatMap).not.toHaveBeenCalled();
    expect(h.device.surface).toHaveBeenCalledTimes(2);
    expect(h.device.release.mock.calls.map(([surface]) => surface.id)).toEqual([
      1, 2,
    ]);
    expectCleared(h, memory);
    flatMap.mockRestore();
    memory.dispose();
  });
});

it("preserves complete original shader/upload/numeric/bounds/native traces and actual consumer lifetimes", async () => {
  // Full original native-call traces captured from pushed 6a9e0ce.
  for (const [sigma, hash] of [
    [2, "8ab3a6034a81b8f278995b017d0ec9146fae5d0765c2c83525cde04851338c6d"],
    [16, "40bfb1c0534500d174ea15ae7028f0f69b633a2f74b90535a6679337701cf917"],
  ] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = harness(),
        original = h.device.uploadFloats.getMockImplementation()!;
      h.device.uploadFloats.mockImplementation((target, values) => {
        expect(memory.owns(values.buffer)).toBe(true);
        expect(memory.statistics.current.metadata).toBeGreaterThan(16384);
        original(target, values);
      });
      h.effects.blur(h.dst, sigma);
      expect(sha(h.records)).toBe(hash);
      expect(h.device.pass).toHaveBeenCalledTimes(2);
      expectCleared(h, memory);
      expect(h.dst.width).toBe(173);
      memory.dispose();
    });
  }
});

it("clears actual per-weight and flattened arrays after constructor consumption without changing Float32 values", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      parts: unknown[][] = [];
    let output: unknown[] | undefined;
    const native = Array.prototype.flatMap;
    const spy = vi
      .spyOn(Array.prototype, "flatMap")
      .mockImplementationOnce(function (this: unknown[], callback, thisArg) {
        output = native.call(this, (value, index, array) => {
          const part = callback.call(thisArg, value, index, array);
          if (Array.isArray(part)) parts.push(part);
          return part;
        });
        return output;
      });
    const upload = h.device.uploadFloats.getMockImplementation()!;
    h.device.uploadFloats.mockImplementation((target, values) => {
      expect(output).toHaveLength(44);
      expect(parts).toHaveLength(11);
      for (const part of parts) expect(part).toHaveLength(4);
      upload(target, values);
    });
    h.effects.blur(h.dst, 2);
    expect(output).toHaveLength(0);
    for (const part of parts) expect(part).toHaveLength(0);
    expect(sha(h.records)).toBe(
      "8ab3a6034a81b8f278995b017d0ec9146fae5d0765c2c83525cde04851338c6d",
    );
    spy.mockRestore();
    expectCleared(h, memory);
    memory.dispose();
  });
});

it("preserves original null flat-map production and clears native/metadata owners for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      spy = vi.spyOn(Array.prototype, "flatMap").mockImplementationOnce(() => {
        throw null;
      });
    let caught: unknown = "missing";
    try {
      h.effects.blur(h.dst, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.uploadFloats).not.toHaveBeenCalled();
    expect(h.device.release).toHaveBeenCalledTimes(2);
    expectCleared(h, memory);
    spy.mockRestore();
    h.effects.blur(h.dst, 2);
    expectCleared(h, memory);
    memory.dispose();
  });
});

it("preserves null Float32 construction after original flat-map production and supports retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      flatMap = vi.spyOn(Array.prototype, "flatMap");
    const constructor = vi
      .spyOn(globalThis, "Float32Array")
      .mockImplementationOnce(() => {
        throw null;
      });
    let caught: unknown = "missing";
    try {
      h.effects.blur(h.dst, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(flatMap).toHaveBeenCalledTimes(1);
    expect(h.device.release).toHaveBeenCalledTimes(2);
    expectCleared(h, memory);
    constructor.mockRestore();
    flatMap.mockRestore();
    h.effects.blur(h.dst, 2);
    expectCleared(h, memory);
    memory.dispose();
  });
});

it("preserves null partial scratch creation over secondary release failure and visits the produced source", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      original = h.device.surface.getMockImplementation()!;
    h.device.surface
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw null;
      });
    h.device.release.mockImplementationOnce(() => {
      throw Error("secondary release");
    });
    let caught: unknown = "missing";
    try {
      h.effects.blur(h.dst, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release.mock.calls.map(([surface]) => surface.id)).toEqual([
      1,
    ]);
    expectCleared(h, memory);
    h.effects.blur(h.dst, 2);
    expectCleared(h, memory);
    memory.dispose();
  });
});

it("preserves null pass over secondary cleanup, visits both surfaces and clears actual uniform/input data", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      original = h.device.pass.getMockImplementation()!;
    h.device.pass.mockImplementationOnce((...args) => {
      original(...args);
      throw null;
    });
    h.device.release.mockImplementationOnce(() => {
      throw Error("secondary release");
    });
    let caught: unknown = "missing";
    try {
      h.effects.blur(h.dst, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(2);
    expectCleared(h, memory);
    h.effects.blur(h.dst, 2);
    expectCleared(h, memory);
    memory.dispose();
  });
});

it("visits both intermediates despite first null release and keeps original early/unmanaged behavior", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness();
    h.effects.blur(h.dst, 0.02);
    h.bounds.region.mockReturnValueOnce(null);
    h.effects.blur(h.dst, 2);
    h.effects.blur(h.dst, 0.04);
    expect(h.device.surface).not.toHaveBeenCalled();
    h.device.release.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      h.effects.blur(h.dst, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(2);
    expectCleared(h, memory);
    memory.dispose();
  });
  const h = harness();
  h.effects.blur(h.dst, 2);
  expect(sha(h.records)).toBe(
    "8ab3a6034a81b8f278995b017d0ec9146fae5d0765c2c83525cde04851338c6d",
  );
  for (const input of h.inputs) expect(input).toHaveLength(0);
});
