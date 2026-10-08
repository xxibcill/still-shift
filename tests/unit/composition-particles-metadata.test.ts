import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  risingParticles,
  paintRisingParticles,
} from "../../packages/renderer-core/src/pixel-generators.ts";
import { WebglEffects } from "../../packages/renderer-core/src/composition/render/webgl-effects.ts";
import type {
  WebglSurface,
  WebglDevice,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
const limits = { pixels: 1, metadata: 1024 * 1024 };
const effect = {
  seed: 27,
  progress: 0.37,
  count: 5,
  radius: 7,
  opacity: 0.61,
  color: "#abcdff",
};
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const original = [
  [
    0,
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "c4695fe63c15648bb5b974073f72dde5d8d1f8bed815adac574e7816ed8c2a0a",
  ],
  [
    1,
    "b5b71a679b5ef84ef2853d6f89020d0df0e714ed3b09b285cbf58e04c25f4f1a",
    "a5a6b58ffbb739687f604b52d3f67da687fc7515716e21fdfce6a727982d7b1c",
  ],
  [
    5,
    "77d77f3afbe24dcd8dbe28bc03ccb8931213f0f4cf51e661cf2977d397e24f8c",
    "494d61131512c189daee9222f8569a0a4a763e59d7a2179512b2602a374d2661",
  ],
  [
    17,
    "0b3924034a4128dca9143e9e38a35cba21bf63ebd6ea6f1d2334f6f3d3756ff4",
    "3fd35dc8238a7ed73a288d9b6568ce202256271e084a79e832c0cea5dd875fb2",
  ],
  [
    1000,
    "15ed13b8318438ca9a0862754f8a46a3df64e15e3b81397ef3786f0e6472937d",
    "1730a8fe331885b9db7f309f2ea9b564e255e92a763759a108913f1c85eed96f",
  ],
  [
    2.5,
    "0eb0daeb97a7d1722e9d0f5ab951f0c95c234f9fd22b65754dc6edca51781205",
    "3e76f326d17c4ee6ec822fd58b2d648a9dc86eebc25b604ad13dc13facbeebb1",
  ],
] as const;
afterEach(() => vi.restoreAllMocks());
function canvasHarness(records: unknown[] = []) {
  const ctx = {
    save: vi.fn(() => {
      records.push(["save"]);
    }),
    restore: vi.fn(() => {
      records.push(["restore"]);
    }),
    set fillStyle(value: string) {
      records.push(["style", value]);
    },
    set globalAlpha(value: number) {
      records.push(["alpha", value]);
    },
    beginPath: vi.fn(() => {
      records.push(["begin"]);
    }),
    arc: vi.fn((...values: number[]) => {
      records.push(["arc", ...values]);
    }),
    fill: vi.fn(() => {
      records.push(["fill"]);
    }),
  };
  return { ctx, canvas: ctx as unknown as CanvasRenderingContext2D, records };
}
function gpuHarness() {
  let id = 0;
  const records: unknown[] = [];
  const c = canvasHarness(records);
  const dst = {
    id: 0,
    width: 173,
    height: 107,
    screen: false,
    opaque: false,
  } as WebglSurface & { id: number };
  const raster = {
    createSurface: vi.fn((width: number, height: number) => {
      records.push(["canvas", width, height]);
      return { canvas: { id: "canvas" }, ctx: c.ctx };
    }),
    releaseSurface: vi.fn(() => {
      records.push(["releaseCanvas"]);
    }),
  };
  type Surface = WebglSurface & { id: number };
  const device = {
    surface: vi.fn(
      (width: number, height: number, float = false, opaque = false) => {
        records.push(["surface", width, height, float, opaque]);
        return { id: ++id, width, height } as Surface;
      },
    ),
    uploadRegion: vi.fn(
      (target: Surface, _canvas: unknown, x: number, y: number) => {
        records.push(["uploadRegion", target.id, x, y]);
      },
    ),
    drawRegion: vi.fn((_surface: unknown, rect: Record<string, number>) => {
      records.push(["drawRegion", { ...rect }]);
      return rect;
    }),
    pass: vi.fn(
      (
        body: string,
        target: Surface,
        inputs: Surface[],
        values: unknown,
        over?: boolean,
        clip?: unknown,
      ) => {
        records.push([
          "pass",
          sha(body),
          target.id,
          inputs.map((value) => value.id),
          JSON.parse(JSON.stringify(values)),
          over,
          clip ?? null,
        ]);
      },
    ),
    swap: vi.fn((a: Surface, b: Surface) => {
      records.push(["swap", a.id, b.id]);
    }),
    release: vi.fn((target: Surface) => {
      records.push(["release", target.id]);
    }),
  };
  const bounds = {
    snapshot: () => undefined,
    include: (_surface: unknown, rect: Record<string, number>) => {
      records.push(["include", { ...rect }]);
    },
  };
  const e = new WebglEffects(
    device as unknown as WebglDevice,
    raster as unknown as Canvas2dBackend,
    bounds as unknown as WebglBounds,
  );
  const run = (value = effect) =>
    (
      e as unknown as {
        particles(dst: WebglSurface, effect: typeof value): void;
      }
    ).particles(dst, value);
  return { records, device, raster, ctx: c.ctx, dst, run };
}
function expectEmpty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}

it("denies seed setup, original array and first particle one byte before their producers without reordered getters", async () => {
  for (const [quota, expected] of [
    [511, []],
    [1023, ["seed", "progress"]],
    [1151, ["seed", "progress", "count"]],
  ] as const) {
    const memory = new ManagedMemory({ ...limits, metadata: quota });
    await withManagedMemory(memory, async () => {
      const names: string[] = [];
      const input = {
        ...effect,
        get seed() {
          names.push("seed");
          return 27;
        },
        get progress() {
          names.push("progress");
          return 0.37;
        },
        get count() {
          names.push("count");
          return 5;
        },
        get radius() {
          names.push("radius");
          return 7;
        },
      };
      const sin = vi.spyOn(Math, "sin");
      expect(() => risingParticles(input, 173, 107)).toThrow("metadata");
      expect(names).toEqual(expected);
      expect(sin).not.toHaveBeenCalled();
      sin.mockRestore();
      expectEmpty(memory);
      memory.dispose();
    });
  }
});

it("preserves complete original geometry hashes, count semantics and four draws per particle while owning actual outputs", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    for (const [count, hash] of original) {
      const imul = vi.spyOn(Math, "imul");
      const values = risingParticles({ ...effect, count }, 173, 107);
      expect(sha(values)).toBe(hash);
      expect(memory.owns(values)).toBe(true);
      expect(imul).toHaveBeenCalledTimes(4 * Math.ceil(count));
      imul.mockRestore();
      expect(memory.statistics.current.metadata).toBe(
        512 + 128 * Math.ceil(count),
      );
      releaseRenderMetadata(values);
      expect(values).toHaveLength(0);
      expectEmpty(memory);
    }
    for (const count of [-2, NaN]) {
      const values = risingParticles({ ...effect, count }, 173, 107);
      expect(values).toEqual([]);
      releaseRenderMetadata(values);
    }
    memory.dispose();
    expectEmpty(memory);
  });
});

it("preserves complete original borrowed getter order and null getter failure with retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const names: string[] = [];
    const input = {
      ...effect,
      get seed() {
        names.push("seed");
        return 27;
      },
      get progress() {
        names.push("progress");
        return 0.37;
      },
      get count() {
        names.push("count");
        return 2;
      },
      get radius() {
        names.push("radius");
        return 7;
      },
      get opacity() {
        names.push("opacity");
        return 0.61;
      },
    };
    const values = risingParticles(input, 173, 107);
    expect(names).toEqual([
      "seed",
      "progress",
      "count",
      "radius",
      "opacity",
      "count",
      "radius",
      "opacity",
      "count",
    ]);
    releaseRenderMetadata(values);
    let caught: unknown = "missing";
    try {
      risingParticles(
        {
          ...effect,
          get radius(): number {
            throw null;
          },
        },
        173,
        107,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expectEmpty(memory);
    const retry = risingParticles(effect, 173, 107);
    expect(retry.length).toBe(5);
    releaseRenderMetadata(retry);
    memory.dispose();
    expectEmpty(memory);
  });
});

it("owns returned arrays until scratch/allocator release and leaves unmanaged output exact", async () => {
  const memory = new ManagedMemory(limits);
  let values: ReturnType<typeof risingParticles> | undefined;
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    values = risingParticles(effect, 173, 107);
    memory.endScratch();
    expect(values).toHaveLength(0);
    values = risingParticles(effect, 173, 107);
  });
  memory.dispose();
  expect(values).toHaveLength(0);
  releaseRenderMetadata(values!);
  expectEmpty(memory);
  expect(sha(risingParticles(effect, 173, 107))).toBe(original[2][1]);
});

it("preserves all original Canvas traces and holds actual particles through original draw then releases them", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    for (const [count, , paint] of original) {
      const h = canvasHarness(),
        arc = h.ctx.arc.getMockImplementation()!;
      h.ctx.arc.mockImplementation((...values) => {
        expect(memory.statistics.current.metadata).toBe(
          512 + 128 * Math.ceil(count),
        );
        arc(...values);
      });
      paintRisingParticles(h.canvas, { ...effect, count }, 173, 107);
      expect(sha(h.records)).toBe(paint);
      expectEmpty(memory);
    }
    memory.dispose();
  });
});

it("restores original Canvas save after protected generator quota and preserves null draw over secondary restore", async () => {
  const small = new ManagedMemory({ ...limits, metadata: 1023 });
  await withManagedMemory(small, async () => {
    const h = canvasHarness();
    expect(() => paintRisingParticles(h.canvas, effect, 173, 107)).toThrow(
      "metadata",
    );
    expect(h.ctx.restore).toHaveBeenCalledTimes(1);
    expectEmpty(small);
    small.dispose();
  });
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = canvasHarness();
    h.ctx.arc.mockImplementationOnce(() => {
      throw null;
    });
    h.ctx.restore.mockImplementationOnce(() => {
      throw Error("secondary restore");
    });
    let caught: unknown = "missing";
    try {
      paintRisingParticles(h.canvas, effect, 173, 107);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.ctx.restore).toHaveBeenCalledTimes(1);
    expectEmpty(memory);
    paintRisingParticles(h.canvas, effect, 173, 107);
    expectEmpty(memory);
    memory.dispose();
  });
});

it("releases actual arrays after first null Canvas restore and protects unbounded input with active quota", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 2048 });
  await withManagedMemory(memory, async () => {
    const h = canvasHarness();
    h.ctx.restore.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      paintRisingParticles(h.canvas, { ...effect, count: 1 }, 173, 107);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expectEmpty(memory);
    expect(() =>
      risingParticles({ ...effect, count: Infinity }, 173, 107),
    ).toThrow("metadata");
    expectEmpty(memory);
    memory.dispose();
  });
});

it("denies actual WebGL region holder and fresh box before raster/native production", async () => {
  for (const quota of [1023, 2303]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota });
    await withManagedMemory(memory, async () => {
      const h = gpuHarness(),
        floor = vi.spyOn(Math, "floor");
      expect(() => h.run()).toThrow("metadata");
      expect(floor).not.toHaveBeenCalled();
      expect(h.raster.createSurface).not.toHaveBeenCalled();
      expect(h.device.surface).not.toHaveBeenCalled();
      floor.mockRestore();
      expectEmpty(memory);
      memory.dispose();
    });
  }
});

it("denies the next union/splice one byte before original merge math and restores actual particle/region ownership", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 3071 });
  await withManagedMemory(memory, async () => {
    const h = gpuHarness(),
      min = vi.spyOn(Math, "min");
    expect(() => h.run({ ...effect, radius: 1000 })).toThrow("metadata");
    expect(min).toHaveBeenCalledTimes(8);
    expect(h.raster.createSurface).not.toHaveBeenCalled();
    min.mockRestore();
    expectEmpty(memory);
    memory.dispose();
  });
});

it("preserves complete original WebGL region/Canvas/upload/shader/uniform/paint/native traces and borrowed output boxes", async () => {
  for (const [count, hash, calls] of [
    [5, "cc1a97b31992ceb2b5e39b3145a58801d11b2f29b09791e00889a01b3f6011db", 70],
    [
      17,
      "85905038a4ebd60179dbe10728230c7f333e20ee91bc025658dae39fab7a9c98",
      190,
    ],
    [
      1000,
      "b1c509c89af16528863cc2be47710e7a452572813c0e4bf472c4607bc4abd955",
      4014,
    ],
  ] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = gpuHarness();
      h.run({ ...effect, count });
      expect(sha(h.records)).toBe(hash);
      expect(h.records.length).toBe(calls);
      for (const [, rect] of h.device.drawRegion.mock.calls)
        expect(rect.right!).toBeGreaterThan(rect.left!);
      expect(h.dst.width).toBe(173);
      expectEmpty(memory);
      memory.dispose();
    });
  }
});

it("preserves null raster creation and actual region cleanup with retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = gpuHarness();
    h.raster.createSurface.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      h.run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.surface).not.toHaveBeenCalled();
    expectEmpty(memory);
    h.run();
    expectEmpty(memory);
    memory.dispose();
  });
});

it("visits source and raster on original null upload over secondary cleanup and releases all region data", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = gpuHarness();
    h.device.uploadRegion.mockImplementationOnce(() => {
      throw null;
    });
    h.device.release.mockImplementationOnce(() => {
      throw Error("secondary source");
    });
    h.raster.releaseSurface.mockImplementationOnce(() => {
      throw Error("secondary canvas");
    });
    let caught: unknown = "missing";
    try {
      h.run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.device.release).toHaveBeenCalledTimes(1);
    expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
    expectEmpty(memory);
    h.run();
    expectEmpty(memory);
    memory.dispose();
  });
});

it("preserves first null source release, still visits raster and keeps unmanaged native traces", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = gpuHarness();
    const release = h.device.release.getMockImplementation()!;
    let failed = false;
    h.device.release.mockImplementation((target) => {
      if (!failed && target.id === 1) {
        failed = true;
        throw null;
      }
      release(target);
    });
    let caught: unknown = "missing";
    try {
      h.run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
    expectEmpty(memory);
    memory.dispose();
  });
  const h = gpuHarness();
  h.run();
  expect(sha(h.records)).toBe(
    "cc1a97b31992ceb2b5e39b3145a58801d11b2f29b09791e00889a01b3f6011db",
  );
});
