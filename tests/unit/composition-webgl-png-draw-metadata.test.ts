import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
import { WebglDevice as NativeDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { createHash } from "node:crypto";
export const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function pngDrawHarness() {
  let id = 0;
  const records: unknown[] = [];
  class Image {
    id = "image";
  }
  const images = new Map([["sprite", new Image()]]),
    sizes = new Map([["sprite", [64, 48]]]),
    pngImages = new Set(["sprite"]);
  const ctx = {
    drawImage: (...args: unknown[]) => {
      records.push(["drawImage", ...args]);
    },
    getImageData: (x: number, y: number, w: number, h: number) => {
      records.push(["edge", x, y, w, h]);
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
  };
  const raster = {
    createSurface: (w: number, h: number) => {
      records.push(["canvas", w, h]);
      return { canvas: { id: "canvas" }, ctx };
    },
    releaseSurface: () => {
      records.push(["releaseCanvas"]);
    },
  };
  const gl = {
    MAX_TEXTURE_SIZE: 1,
    BLEND: 2,
    FUNC_ADD: 3,
    ONE: 4,
    ONE_MINUS_SRC_ALPHA: 5,
    getParameter: () => 8192,
    enable: (x: number) => {
      records.push(["enable", x]);
    },
    disable: (x: number) => {
      records.push(["disable", x]);
    },
    blendEquation: (x: number) => {
      records.push(["equation", x]);
    },
    blendFunc: (...args: number[]) => {
      records.push(["blend", ...args]);
    },
  };
  const device = {
    gl,
    surface: (w: number, h: number, float = false) => {
      records.push(["surface", w, h, float]);
      return { id: ++id, width: w, height: h };
    },
    upload: (s: { id: number }) => {
      records.push(["upload", s.id]);
    },
    uploadFloats: (s: { id: number }, values: Float32Array) => {
      records.push(["floats", s.id, values.length, sha(Array.from(values))]);
    },
    release: (s: { id: number }) => {
      records.push(["release", s.id]);
    },
    drawRegion: (_dst: unknown, rect: unknown) => {
      records.push(["region", rect]);
      return rect;
    },
    pass: (
      body: string,
      dst: { id: number },
      inputs: { id: number }[],
      uniforms: unknown,
      over?: boolean,
      rect?: unknown,
    ) => {
      records.push([
        "pass",
        sha(body),
        body.length,
        dst.id,
        inputs.map((s) => s.id),
        JSON.parse(JSON.stringify(uniforms)),
        over,
        rect,
      ]);
    },
  };
  const content = {
    type: "image",
    sources: [{ asset: "sprite" }],
    state: 0,
    stateMix: 1,
    rasterize: "draw",
    width: 64,
    height: 48,
    fit: "contain",
  };
  const dst = { id: 0, width: 173, height: 107 };
  return {
    records,
    Image,
    images,
    sizes,
    pngImages,
    ctx,
    raster,
    device,
    content,
    dst,
  };
}

import { afterEach, expect, it, vi } from "vitest";
import { WebglPngImages } from "../../packages/renderer-core/src/composition/render/webgl-png-images.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type {
  Canvas2dBackend,
  CanvasImageResources,
} from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { ImageContent } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { Matrix } from "../../packages/renderer-core/src/node-transform.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 2 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
const matrix: Matrix = [0.3, 0, 0, 0.3, 3.4, 5.6];
type PrivatePng = {
  coordinates(
    dst: WebglSurface,
    sx: number,
    sy: number,
    ix: number,
    iy: number,
    left: number,
  ): WebglSurface;
  control?: {
    surface: WebglSurface;
    values: Float32Array;
    memory?: ManagedMemory;
  };
  sourceState: { sources: Map<string, WebglSurface> };
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const h = pngDrawHarness();
  vi.stubGlobal("HTMLImageElement", h.Image);
  const p = new WebglPngImages(
    h.device as unknown as WebglDevice,
    h.raster as unknown as Canvas2dBackend,
    h as unknown as CanvasImageResources,
  );
  return {
    ...h,
    p,
    private: p as unknown as PrivatePng,
    run: (value: Matrix = matrix, transforms?: Matrix[]) =>
      p.draw(
        h.dst as unknown as WebglSurface,
        h.content as unknown as ImageContent,
        value,
        0.61,
        [],
        transforms,
      ),
    coords: (dst = h.dst) =>
      (p as unknown as PrivatePng).coordinates(
        dst as unknown as WebglSurface,
        3.1,
        2.9,
        -11.3,
        -17.1,
        3.4,
      ),
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
const original = [
  {
    matrix: [0.3, 0, 0, 0.3, 3.4, 5.6],
    ok: true,
    calls: 26,
    sha256: "61a88e3a764072858baf62b2c1e470457e5368f347a060212d587b5f3f2fe043",
  },
  {
    matrix: [0.17, 0, 0, 0.17, -3.37, 21.19],
    ok: true,
    calls: 26,
    sha256: "1224378c0dcca31f589c804dd85fc5b9edfb0f7af36d270abf64bb41569d618d",
  },
  {
    matrix: [0.43, 0, 0, 0.43, 91.61, 67.23],
    ok: true,
    calls: 26,
    sha256: "ec3f68e969698b2adac4572bb4778acf00612565ae3519fa737dac2178a14d06",
  },
] as const;
it("preserves complete original draw, repeat-cache, float-upload and native-disposal traces for three placements", async () => {
  for (const row of original) {
    const memory = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    await withManagedMemory(memory, async () => {
      h = setup();
      expect(h.run([...row.matrix])).toBe(row.ok);
      h.run([...row.matrix]);
      h.p.dispose();
      empty(memory);
    });
    expect(h!.records).toHaveLength(row.calls);
    expect(sha(h!.records)).toBe(row.sha256);
    const inactive = setup();
    inactive.run([...row.matrix]);
    inactive.run([...row.matrix]);
    inactive.p.dispose();
    expect(sha(inactive.records)).toBe(row.sha256);
  }
});
it("denies actual draw data before transform and placement getters or source/native producers", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1536 + 4096 - 1 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    let reads = 0;
    const input = new Proxy(matrix, {
      get(target, name) {
        if (name === "0") reads++;
        return Reflect.get(target, name);
      },
    });
    expect(() => h.run(input)).toThrow(/metadata/);
    expect(reads).toBe(0);
    expect(h.records).toEqual([]);
    h.p.dispose();
    empty(memory);
  });
});
it("keeps actual pass input/uniform/vector data through native pass then clears it and leaves borrowed content/transforms unchanged", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      before = JSON.stringify(h.content),
      transforms: Matrix[] = [matrix];
    let inputs: { id: number }[] | undefined,
      uniforms: Record<string, unknown> | undefined,
      vectors: number[][] = [];
    const pass = h.device.pass;
    vi.spyOn(h.device, "pass").mockImplementation(
      (body, dst, sources, values, over, rect) => {
        inputs = sources;
        uniforms = values as Record<string, unknown>;
        vectors = Object.values(uniforms).filter(Array.isArray) as number[][];
        expect(sources).toHaveLength(2);
        expect(uniforms.opacity).toBe(0.61);
        expect(memory.statistics.current.metadata).toBeGreaterThanOrEqual(4096);
        pass(body, dst, sources, values, over, rect);
      },
    );
    h.run(matrix, transforms);
    expect(inputs).toEqual([]);
    expect(uniforms).toEqual({});
    for (const value of vectors) expect(value).toEqual([]);
    expect(JSON.stringify(h.content)).toBe(before);
    expect(transforms).toEqual([matrix]);
    expect(matrix).toEqual([0.3, 0, 0, 0.3, 3.4, 5.6]);
    h.p.dispose();
    empty(memory);
  });
});
it("denies coordinate record and pixel producers at their original pre-production boundaries", async () => {
  for (const quota of [
    { pixels: limits.pixels, metadata: 1536 + 1024 - 1 },
    { pixels: 173 * 16 - 1, metadata: limits.metadata },
  ]) {
    const memory = new ManagedMemory(quota);
    await withManagedMemory(memory, async () => {
      const h = setup(),
        native = vi.spyOn(h.device, "surface"),
        release = vi.spyOn(h.device, "release");
      expect(h.coords).toThrow(/quota/);
      expect(native).toHaveBeenCalledTimes(
        quota.metadata < limits.metadata ? 0 : 1,
      );
      expect(release).toHaveBeenCalledTimes(
        quota.metadata < limits.metadata ? 0 : 1,
      );
      expect(h.private.control).toBeUndefined();
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
      h.p.dispose();
      empty(memory);
    });
  }
});
it("retains actual control record and view across repeated uploads and drops record/native/backing after scope exit", async () => {
  const memory = new ManagedMemory(limits);
  let owner: PrivatePng["control"], buffer: ArrayBufferLike | undefined;
  const h = await withManagedMemory(memory, async () => {
    const h = setup();
    const surface = h.coords();
    owner = h.private.control;
    buffer = owner!.values.buffer;
    expect(memory.owns(owner!)).toBe(true);
    expect(memory.statistics.current).toEqual({
      pixels: 173 * 16,
      metadata: 1536 + 1024,
    });
    expect(h.coords()).toBe(surface);
    expect(h.private.control).toBe(owner);
    return h;
  });
  h.p.dispose();
  expect(buffer?.byteLength).toBe(0);
  expect(owner?.surface).toBeUndefined();
  expect(owner?.values).toBeUndefined();
  expect(owner?.memory).toBeUndefined();
  expect(h.private.control).toBeUndefined();
  empty(memory);
});
it("releases old control and backing before resize, and retries after null release with no orphaned references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.coords();
    const old = h.private.control!,
      buffer = old.values.buffer;
    const release = vi.spyOn(h.device, "release").mockImplementationOnce(() => {
      throw null;
    });
    try {
      h.coords({ ...h.dst, width: 211 });
      expect.fail("release");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(buffer.byteLength).toBe(0);
    expect(old.surface).toBeUndefined();
    expect(h.private.control).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    expect(release).toHaveBeenCalledTimes(1);
    h.coords({ ...h.dst, width: 211 });
    expect(h.private.control!.values.byteLength).toBe(211 * 16);
    h.p.dispose();
    empty(memory);
  });
});
it("preserves original null pass and setup failures over secondary disable while clearing temporary data and allowing retry", async () => {
  for (const stage of [
    "pass",
    "enable",
    "blendEquation",
    "blendFunc",
  ] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = setup(),
        disable = vi
          .spyOn(h.device.gl, "disable")
          .mockImplementationOnce(() => {
            throw Error("secondary");
          });
      const failing =
        stage === "pass"
          ? vi.spyOn(h.device, "pass")
          : vi.spyOn(h.device.gl, stage);
      failing.mockImplementationOnce(() => {
        throw null;
      });
      try {
        h.run();
        expect.fail(stage);
      } catch (error) {
        expect(error).toBe(null);
      }
      expect(disable).toHaveBeenCalledTimes(1);
      expect(memory.statistics.current.metadata).toBeLessThan(4096);
      failing.mockRestore();
      h.run();
      h.p.dispose();
      empty(memory);
    });
  }
});
it("visits cached sources, control native and actual control backing after first-null disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.run();
    const control = h.private.control!,
      buffer = control.values.buffer;
    const native = vi.spyOn(h.device, "release").mockImplementationOnce(() => {
      throw null;
    });
    try {
      h.p.dispose();
      expect.fail("source release");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(native).toHaveBeenCalledTimes(2);
    expect(buffer.byteLength).toBe(0);
    expect(h.private.control).toBeUndefined();
    empty(memory);
  });
});
it("keeps control through original scratch retirement and cleans actual refs on allocator-first release", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    memory.beginScratch();
    h.run();
    memory.endScratch();
    const control = h.private.control!,
      buffer = control.values.buffer;
    expect(buffer.byteLength).toBe(173 * 16);
    expect(memory.owns(control)).toBe(true);
    memory.dispose();
    expect(buffer.byteLength).toBe(0);
    expect(h.private.control).toBeUndefined();
    h.p.dispose();
    empty(memory);
  });
});
it("preserves no-work draw routes and rejects foreign active coordinate control before native factories", async () => {
  const h = setup(),
    memory = new ManagedMemory(limits),
    native = vi.spyOn(h.device, "surface");
  await withManagedMemory(memory, async () => {
    expect(h.coords).toThrow("another allocator");
    expect(native).not.toHaveBeenCalled();
    empty(memory);
  });
  h.p.dispose();
  const active = new ManagedMemory(limits);
  await withManagedMemory(active, async () => {
    const h = setup();
    expect(h.run([0.3, 0.1, 0, 0.3, 3, 5])).toBe(false);
    expect(h.run([1, 0, 0, 1, 0, 0])).toBe(false);
    expect(h.records).toEqual([]);
    expect(active.statistics.current.metadata).toBe(1536);
    h.p.dispose();
    empty(active);
  });
});
it("releases actual coordinate native float texture and backing once in cache-first and allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = fakeWebglDevice(),
      h = pngDrawHarness();
    Object.assign(fixture.gl, { texSubImage2D: vi.fn() });
    let device: NativeDevice | undefined,
      p: WebglPngImages | undefined,
      control: PrivatePng["control"],
      buffer: ArrayBufferLike | undefined;
    await withManagedMemory(memory, async () => {
      device = new NativeDevice(fixture.canvas);
      p = new WebglPngImages(
        device,
        h.raster as unknown as Canvas2dBackend,
        h as unknown as CanvasImageResources,
      );
      const source = (p as unknown as PrivatePng).coordinates(
        h.dst as unknown as WebglSurface,
        3.1,
        2.9,
        -11.3,
        -17.1,
        3.4,
      );
      control = (p as unknown as PrivatePng).control;
      buffer = control!.values.buffer;
      expect(memory.owns(source)).toBe(true);
      expect(memory.owns(control!)).toBe(true);
      expect(memory.statistics.current.pixels).toBe(173 * 16 * 2);
    });
    if (allocatorFirst) memory.dispose();
    p!.dispose();
    device!.dispose();
    memory.dispose();
    expect(buffer?.byteLength).toBe(0);
    expect(control?.surface).toBeUndefined();
    expect(control?.values).toBeUndefined();
    expect(fixture.gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(fixture.gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    empty(memory);
  }
});
