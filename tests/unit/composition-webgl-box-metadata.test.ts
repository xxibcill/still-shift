import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  boxBlur,
  boxSteps,
} from "../../packages/renderer-core/src/composition/render/webgl-box-blur.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { WebglRect } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const limits = { pixels: 65536, metadata: 1024 * 1024 };
const kernel = { radius: 44, divisor: 27900, lengths: [30, 30, 31] };
const painted = { left: 7, top: 11, right: 125, bottom: 81 };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
afterEach(() => vi.restoreAllMocks());
function harness() {
  type Surface = WebglSurface & { id: number };
  let index = 0;
  const dst = { id: 0, width: 173, height: 107 } as Surface;
  const records: unknown[] = [],
    inputs: Surface[][] = [],
    arrays: number[][] = [];
  const uniforms: Record<string, number | number[]>[] = [];
  const device = {
    gl: {
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: vi.fn((value: number) => {
        records.push(["parameter", value]);
        return 8192;
      }),
    },
    surface: vi.fn((width: number, height: number, float = false): Surface => {
      records.push(["surface", width, height, float]);
      return { id: ++index, width, height } as Surface;
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
          input.map((x) => x.id),
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
    clear: vi.fn((surface: Surface) => records.push(["clear", surface.id])),
    release: vi.fn((surface: Surface) => {
      records.push(["release", surface.id]);
    }),
  };
  return {
    device,
    gpu: device as unknown as WebglDevice,
    dst,
    records,
    inputs,
    arrays,
    uniforms,
  };
}
function expectCleared(value: ReturnType<typeof harness>) {
  for (const input of value.inputs) expect(input).toHaveLength(0);
  for (const array of value.arrays) expect(array).toHaveLength(0);
  for (const uniforms of value.uniforms)
    expect(Object.keys(uniforms)).toHaveLength(0);
}

it("denies the holder and fresh clip one byte before original geometry getters and native allocations", async () => {
  for (const quota of [1023, 1151]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota });
    await withManagedMemory(memory, async () => {
      const h = harness(),
        getter = vi.fn(() => 7);
      const clip = {
        ...painted,
        get left() {
          return getter();
        },
      };
      expect(() => boxBlur(h.gpu, h.dst, kernel, clip)).toThrow("metadata");
      expect(getter).not.toHaveBeenCalled();
      expect(h.device.gl.getParameter).not.toHaveBeenCalled();
      expect(h.device.surface).not.toHaveBeenCalled();
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  }
});

it("denies fresh direction/input arrays before their original pass consumer and visits all four native surfaces", async () => {
  for (const length of kernel.lengths) boxSteps(length);
  for (const quota of [1296, 2015]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota });
    await withManagedMemory(memory, async () => {
      const h = harness();
      expect(() => boxBlur(h.gpu, h.dst, kernel)).toThrow("metadata");
      expect(h.device.pass).not.toHaveBeenCalled();
      expect(h.device.surface).toHaveBeenCalledTimes(4);
      expect(
        h.device.release.mock.calls.map(([surface]) => surface.id),
      ).toEqual([2, 3, 4, 1]);
      expect(memory.statistics.current.metadata).toBe(0);
      expect(memory.statistics.current.pixels).toBe(0);
      memory.dispose();
    });
  }
});

it("preserves whole original shader/math/uniform/clip/native traces and holds generated arrays until their consumers", async () => {
  // Complete original traces captured from pushed c744384 before this slice.
  for (const [clip, hash] of [
    [
      undefined,
      "a47d1cad09f73cb40e6baa91bce2732de15a0a2bb43f5ee6b01724a9da6a6a06",
    ],
    [
      painted,
      "63dc088b5164f51e765f6dfbc16ebaa58e88added0a0bfba3993dd1c80710704",
    ],
  ] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = harness();
      const original = h.device.pass.getMockImplementation()!;
      h.device.pass.mockImplementation((...args) => {
        expect(memory.statistics.current.metadata).toBeGreaterThan(1024);
        expect(args[2].length).toBeGreaterThan(0);
        expect(Object.keys(args[3]).length).toBeGreaterThan(0);
        original(...args);
      });
      expect(boxBlur(h.gpu, h.dst, kernel, clip)).toBe(true);
      expect(sha(h.records)).toBe(hash);
      expect(h.device.pass).toHaveBeenCalledTimes(14);
      expectCleared(h);
      expect(h.dst.width).toBe(173);
      expect(kernel.lengths).toEqual([30, 30, 31]);
      expect(clip).toEqual(clip ? painted : undefined);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  }
});

it("preserves original painted getter order and null geometry failure while restoring ownership for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      names: string[] = [];
    const clip = Object.fromEntries(
      Object.entries(painted).map(([name, value]) => [name, value]),
    ) as WebglRect;
    for (const name of ["left", "top", "right", "bottom"] as const)
      Object.defineProperty(clip, name, {
        get() {
          names.push(name);
          return painted[name];
        },
      });
    expect(boxBlur(h.gpu, h.dst, kernel, clip)).toBe(true);
    expect(names).toEqual(["left", "top", "right", "bottom"]);
    const failed = {
      ...painted,
      get left(): number {
        throw null;
      },
    };
    let caught: unknown = "missing";
    try {
      boxBlur(h.gpu, h.dst, kernel, failed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(boxBlur(h.gpu, h.dst, kernel)).toBe(true);
    memory.dispose();
  });
});

it("preserves null partial native creation and releases every previously returned surface", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness(),
      original = h.device.surface.getMockImplementation()!;
    h.device.surface
      .mockImplementationOnce(original)
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw null;
      });
    h.device.release.mockImplementationOnce(() => {
      throw Error("secondary release");
    });
    let caught: unknown = "missing";
    try {
      boxBlur(h.gpu, h.dst, kernel);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release.mock.calls.map(([surface]) => surface.id)).toEqual([
      2, 1,
    ]);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(boxBlur(h.gpu, h.dst, kernel)).toBe(true);
    memory.dispose();
  });
});

it("preserves original null pass over secondary cleanup, clears actual inputs and supports retry", async () => {
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
      boxBlur(h.gpu, h.dst, kernel);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(4);
    expectCleared(h);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(boxBlur(h.gpu, h.dst, kernel)).toBe(true);
    memory.dispose();
  });
});

it("visits all native intermediates on first null release and clears their actual metadata", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness();
    h.device.release.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      boxBlur(h.gpu, h.dst, kernel);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(4);
    expectCleared(h);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("retains original unsupported/texture/memory rejection and unmanaged native values", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = harness();
    expect(boxBlur(h.gpu, h.dst, { ...kernel, lengths: [3] })).toBe(false);
    expect(boxBlur(h.gpu, h.dst, { ...kernel, divisor: 65794 })).toBe(false);
    expect(h.device.gl.getParameter).not.toHaveBeenCalled();
    h.device.gl.getParameter.mockReturnValueOnce(128);
    expect(boxBlur(h.gpu, h.dst, kernel)).toBe(false);
    const huge = { ...h.dst, width: 2048, height: 2048 };
    expect(boxBlur(h.gpu, huge, kernel)).toBe(false);
    expect(h.device.surface).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
  const h = harness();
  expect(boxBlur(h.gpu, h.dst, kernel)).toBe(true);
  expect(sha(h.records)).toBe(
    "a47d1cad09f73cb40e6baa91bce2732de15a0a2bb43f5ee6b01724a9da6a6a06",
  );
  expectCleared(h);
});
