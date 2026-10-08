import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { WebglEffects } from "../../packages/renderer-core/src/composition/render/webgl-effects.ts";
import * as blend from "../../packages/renderer-core/src/composition/render/webgl-blend.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 1, metadata: 1024 * 1024 };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const region = { left: 1, top: 2, right: 91, bottom: 71 };
const painted = { left: -7, top: 11, right: 125, bottom: 151 };
const original = [
  [
    false,
    false,
    "ded3e5a2ead1d039694e7223a2fae3dd0ba73d2feb8361e9feb1181ec9e1cc14",
  ],
  [
    false,
    true,
    "edbed6f49b93e04acdab302a662cdfb1c957801e69a7071b209e9bccb64822a3",
  ],
  [
    true,
    false,
    "df2b6088b8e6ea49a2e8698b8e299050fe168e59c8d5a24e29366881bb38956a",
  ],
  [
    true,
    true,
    "9e92b60d8f0e6b68e04ba89a9cb58cff4617cadce14750e016f00098d79f8b23",
  ],
] as const;
type Surface = WebglSurface & { id: number };
type Uniforms = NonNullable<Parameters<WebglDevice["pass"]>[3]>;
type PrivateEffects = {
  paint(
    dst: WebglSurface,
    draw: (ctx: CanvasRenderingContext2D) => void,
    shader?: string,
    opacity?: number,
    region?: Bounds | null,
    painted?: Bounds,
  ): void;
  replace(
    dst: WebglSurface,
    shader: string,
    inputs: WebglSurface[],
    uniforms?: Uniforms,
    region?: Bounds | null,
  ): void;
};
afterEach(() => vi.restoreAllMocks());
function harness(screen = false) {
  let id = 0;
  const records: unknown[] = [];
  const dst = {
    id: 0,
    width: 173,
    height: 107,
    screen,
    opaque: false,
  } as Surface;
  const ctx = {
    save: vi.fn(() => {
      records.push(["save"]);
    }),
    restore: vi.fn(() => {
      records.push(["restore"]);
    }),
  };
  const raster = {
    createSurface: vi.fn((w: number, h: number) => {
      records.push(["canvas", w, h]);
      return { canvas: { id: "canvas" }, ctx };
    }),
    releaseSurface: vi.fn(() => {
      records.push(["releaseCanvas"]);
    }),
  };
  const device = {
    surface: vi.fn((w: number, h: number, float = false, opaque = false) => {
      records.push(["surface", w, h, float, opaque]);
      return { id: ++id, width: w, height: h } as Surface;
    }),
    upload: vi.fn((s: Surface) => {
      records.push(["upload", s.id]);
    }),
    uploadArea: vi.fn((s: Surface, _c: unknown, area: Bounds) => {
      records.push(["uploadArea", s.id, { ...area }]);
    }),
    pass: vi.fn(
      (
        body: string,
        target: Surface,
        inputs: WebglSurface[],
        uniforms: Uniforms,
        over?: boolean,
        clip?: Bounds | null,
      ) => {
        records.push([
          "pass",
          sha(body),
          body.length,
          target.id,
          inputs.map((s) => (s as Surface).id),
          JSON.parse(JSON.stringify(uniforms)),
          over,
          clip ?? null,
        ]);
      },
    ),
    swap: vi.fn((a: Surface, b: Surface) => {
      records.push(["swap", a.id, b.id]);
    }),
    release: vi.fn((s: Surface) => {
      records.push(["release", s.id]);
    }),
  };
  const e = new WebglEffects(
    device as unknown as WebglDevice,
    raster as unknown as Canvas2dBackend,
    {} as WebglBounds,
  ) as unknown as PrivateEffects;
  const draw = vi.fn(() => {
    records.push(["draw"]);
  });
  const run = (box?: Bounds) =>
    e.paint(dst, draw, undefined, 0.61, region, box);
  return { records, dst, ctx, raster, device, e, draw, run };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
it("denies the default shader and native paint producers one byte before admission", async () => {
  const body = vi.spyOn(blend, "blendShader");
  const h = harness(),
    memory = new ManagedMemory({ ...limits, metadata: 16383 });
  await withManagedMemory(memory, async () => {
    expect(h.run).toThrow(/metadata/);
    expect(body).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    empty(memory);
  });
});
it("preserves four complete original native traces and shader bodies in active and inactive scopes", async () => {
  for (const [screen, area, hash] of original) {
    const memory = new ManagedMemory(limits),
      active = harness(screen),
      inactive = harness(screen);
    await withManagedMemory(memory, async () => {
      active.run(area ? painted : undefined);
      empty(memory);
    });
    inactive.run(area ? painted : undefined);
    expect(sha(active.records)).toBe(hash);
    expect(sha(inactive.records)).toBe(hash);
  }
  expect(harness().e.paint.length).toBe(2);
  expect(harness().e.replace.length).toBe(3);
});
it("holds actual paint inputs and uniforms through pass, swap and native release, then clears fresh data", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits);
  let inputs: WebglSurface[] = [],
    uniforms: Uniforms = {},
    area: Bounds | undefined;
  const upload = h.device.uploadArea.getMockImplementation()!;
  h.device.uploadArea.mockImplementation((s, c, value) => {
    area = value;
    expect(memory.statistics.current.metadata).toBe(16384);
    upload(s, c, value);
  });
  const pass = h.device.pass.getMockImplementation()!;
  h.device.pass.mockImplementation(
    (body, target, sources, values, over, clip) => {
      inputs = sources;
      uniforms = values;
      expect(sources.map((s) => (s as Surface).id)).toEqual([1, 0]);
      expect(values).toEqual({ opacity: 0.61 });
      expect(memory.statistics.current.metadata).toBe(17408);
      expect(sha(body)).toBe(
        "c1333a8da2d423070f0dc0fce0185d60edec6b6caaeecc3cea47b0f8a296b42a",
      );
      pass(body, target, sources, values, over, clip);
    },
  );
  h.device.swap.mockImplementation(() => {
    expect(inputs).toHaveLength(2);
    expect(uniforms).toEqual({ opacity: 0.61 });
  });
  h.raster.releaseSurface.mockImplementation(() => {
    expect(inputs).toHaveLength(2);
    expect(uniforms).toEqual({ opacity: 0.61 });
    expect(memory.statistics.current.metadata).toBe(16384);
  });
  await withManagedMemory(memory, async () => {
    h.run(painted);
    empty(memory);
  });
  expect(inputs).toEqual([]);
  expect(uniforms).toEqual({});
  expect(area).toEqual({ left: 0, top: 11, right: 125, bottom: 107 });
  expect(region).toEqual({ left: 1, top: 2, right: 91, bottom: 71 });
  expect(painted).toEqual({ left: -7, top: 11, right: 125, bottom: 151 });
});
it("denies replace default controls and output before their native consumers", async () => {
  for (const screen of [false, true]) {
    const memory = new ManagedMemory({ ...limits, metadata: 1023 }),
      h = harness(screen);
    await withManagedMemory(memory, async () => {
      expect(() => h.e.replace(h.dst, "body", [])).toThrow(/metadata/);
      expect(h.records).toEqual([]);
      empty(memory);
    });
  }
  const h = harness(),
    memory = new ManagedMemory({ ...limits, metadata: 17407 });
  await withManagedMemory(memory, async () => {
    expect(h.run).toThrow(/metadata/);
    expect(h.device.surface).toHaveBeenCalledTimes(1);
    expect(h.device.pass).not.toHaveBeenCalled();
    expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
    expect(h.device.release).toHaveBeenCalledTimes(1);
    empty(memory);
  });
});
it("preserves borrowed replace arrays, vectors, records and region while dropping owned default fields", async () => {
  for (const screen of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = harness(screen);
    const inputs = [h.dst],
      vector = Object.freeze([2, 3]) as unknown as number[],
      values = Object.freeze({ vector }),
      clip = Object.freeze({ ...region });
    h.device.pass.mockImplementation(
      (_body, _target, sources, uniforms, _over, bounds) => {
        expect(sources).toBe(inputs);
        expect(uniforms).toBe(values);
        expect(bounds).toBe(clip);
        expect(memory.statistics.current.metadata).toBe(1024);
      },
    );
    await withManagedMemory(memory, async () => {
      h.e.replace(h.dst, "borrowed", inputs, values, clip);
      empty(memory);
    });
    expect(inputs).toEqual([h.dst]);
    expect(values).toEqual({ vector: [2, 3] });
    let fresh: Uniforms | undefined;
    h.device.pass.mockImplementation((_b, _t, _i, uniforms) => {
      fresh = uniforms;
      uniforms.test = 1;
    });
    await withManagedMemory(memory, async () => {
      h.e.replace(h.dst, "body", inputs);
      empty(memory);
    });
    expect(fresh).toEqual({});
  }
});
it("releases the first native owner when the second producer throws null and allows retry", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits);
  h.device.surface.mockImplementationOnce(() => {
    throw null;
  });
  await withManagedMemory(memory, async () => {
    try {
      h.run();
      expect.fail("source must fail");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
    expect(h.device.release).not.toHaveBeenCalled();
    empty(memory);
    h.run();
    empty(memory);
  });
});
it("restores once after a null draw, preserves that failure over restore and both release failures", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits);
  h.draw.mockImplementationOnce(() => {
    throw null;
  });
  h.ctx.restore.mockImplementationOnce(() => {
    throw Error("restore secondary");
  });
  h.raster.releaseSurface.mockImplementationOnce(() => {
    throw Error("raster secondary");
  });
  h.device.release.mockImplementationOnce(() => {
    throw Error("source secondary");
  });
  await withManagedMemory(memory, async () => {
    try {
      h.run();
      expect.fail("draw must fail");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(h.ctx.restore).toHaveBeenCalledTimes(1);
    expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
    expect(h.device.release).toHaveBeenCalledTimes(1);
    empty(memory);
    h.run();
    empty(memory);
  });
});
it("visits source release after first-null raster release and clears actual pass data", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits);
  let inputs: WebglSurface[] = [],
    values: Uniforms = {};
  h.device.pass.mockImplementation((_b, _t, i, u) => {
    inputs = i;
    values = u;
  });
  h.raster.releaseSurface.mockImplementationOnce(() => {
    throw null;
  });
  await withManagedMemory(memory, async () => {
    try {
      h.run();
      expect.fail("release must fail");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(h.device.release.mock.calls.map(([s]) => s.id)).toEqual([2, 1]);
    empty(memory);
    expect(inputs).toEqual([]);
    expect(values).toEqual({});
    h.run();
    empty(memory);
  });
});
it("preserves original null failures across save, restore, upload, pass and swap with complete cleanup", async () => {
  for (const stage of [
    "save",
    "restore",
    "upload",
    "uploadArea",
    "pass",
    "swap",
  ] as const) {
    const h = harness(),
      memory = new ManagedMemory(limits);
    const failing =
      stage === "save" || stage === "restore" ? h.ctx[stage] : h.device[stage];
    failing.mockImplementationOnce(() => {
      throw null;
    });
    h.raster.releaseSurface.mockImplementationOnce(() => {
      throw Error("secondary raster");
    });
    h.device.release.mockImplementation(() => {
      throw Error("secondary device");
    });
    await withManagedMemory(memory, async () => {
      try {
        h.run(stage === "uploadArea" ? painted : undefined);
        expect.fail(stage);
      } catch (error) {
        expect(error).toBe(null);
      }
      expect(h.raster.releaseSurface).toHaveBeenCalledTimes(1);
      expect(h.device.release).toHaveBeenCalledTimes(
        stage === "pass" || stage === "swap" ? 2 : 1,
      );
      empty(memory);
    });
  }
});
it("clears replace output and fresh default data when native pass or swap fails before retry", async () => {
  for (const stage of ["pass", "swap"] as const) {
    const h = harness(),
      memory = new ManagedMemory(limits);
    let fresh: Uniforms | undefined;
    h.device.pass.mockImplementation((_b, _t, _i, uniforms) => {
      fresh = uniforms;
      uniforms.test = 9;
      if (stage === "pass") throw null;
    });
    if (stage === "swap")
      h.device.swap.mockImplementationOnce(() => {
        throw null;
      });
    h.device.release.mockImplementationOnce(() => {
      throw Error("secondary");
    });
    await withManagedMemory(memory, async () => {
      try {
        h.e.replace(h.dst, "body", [h.dst]);
        expect.fail(stage);
      } catch (error) {
        expect(error).toBe(null);
      }
      expect(fresh).toEqual({});
      expect(h.device.release).toHaveBeenCalledTimes(1);
      empty(memory);
      h.device.pass.mockImplementation(() => {});
      h.e.replace(h.dst, "body", [h.dst]);
      empty(memory);
    });
  }
});
it("keeps empty painted upload omission and original borrowed shader behavior", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits),
    shader = "custom";
  await withManagedMemory(memory, async () => {
    h.e.paint(h.dst, h.draw, shader, 0.25, null, {
      left: 99,
      top: 80,
      right: 5,
      bottom: 3,
    });
    expect(h.device.upload).not.toHaveBeenCalled();
    expect(h.device.uploadArea).not.toHaveBeenCalled();
    expect(h.device.pass.mock.calls[0]![0]).toBe(shader);
    expect(h.device.pass.mock.calls[0]![5]).toBe(null);
    empty(memory);
  });
});
