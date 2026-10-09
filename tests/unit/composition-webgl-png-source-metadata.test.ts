import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
import { WebglDevice as NativeDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { createHash } from "node:crypto";
export const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function pngSourceHarness(unsupported = false) {
  let id = 0;
  const records: unknown[] = [];
  const images = new Map([['sprite"\\😀', { id: "image" }]]),
    sizes = new Map([['sprite"\\😀', [64, 48]]]);
  const ctx = {
    drawImage: (...args: unknown[]) => {
      records.push(["draw", ...args]);
    },
    getImageData: (x: number, y: number, w: number, h: number) => {
      records.push(["edge", x, y, w, h]);
      const data = new Uint8ClampedArray(w * h * 4);
      if (unsupported) data[3] = 1;
      return { data, width: w, height: h };
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
  const device = {
    gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 8192 },
    surface: (w: number, h: number) => {
      records.push(["surface", w, h]);
      return { id: ++id, width: w, height: h };
    },
    upload: (s: { id: number }) => {
      records.push(["upload", s.id]);
    },
    release: (s: { id: number }) => {
      records.push(["release", s.id]);
    },
  };
  return { records, images, sizes, ctx, raster, device };
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
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const asset = 'sprite"\\😀';
const limits = { pixels: 2 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
type PrivatePng = {
  source(asset: string, level: number): WebglSurface | undefined;
  sourceState: {
    closed: boolean;
    sources: Map<string, WebglSurface>;
    unsupported: Set<string>;
    entries: Map<
      string,
      {
        key: string;
        tuple: unknown[];
        edges: ImageData[];
        surface?: WebglSurface;
      }
    >;
  };
};
afterEach(() => vi.restoreAllMocks());
function setup(unsupported = false) {
  const h = pngSourceHarness(unsupported);
  const p = new WebglPngImages(
    h.device as unknown as WebglDevice,
    h.raster as unknown as Canvas2dBackend,
    h as unknown as CanvasImageResources,
  );
  return {
    ...h,
    p,
    private: p as unknown as PrivatePng,
    run: () => (p as unknown as PrivatePng).source(asset, 1),
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
it("admits actual source cache containers before constructor device queries", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1535 });
  const h = pngSourceHarness(),
    query = vi.spyOn(h.device.gl, "getParameter");
  await withManagedMemory(memory, async () => {
    expect(
      () =>
        new WebglPngImages(
          h.device as unknown as WebglDevice,
          h.raster as unknown as Canvas2dBackend,
          h as unknown as CanvasImageResources,
        ),
    ).toThrow(/metadata/);
    expect(query).not.toHaveBeenCalled();
    empty(memory);
  });
});
it("denies key JSON and source native factories one byte before key lifetime admission", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 1536 + 2048 + 12 * asset.length - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = setup(),
      json = vi.spyOn(JSON, "stringify");
    expect(h.run).toThrow(/metadata/);
    expect(json).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    expect(memory.statistics.current.metadata).toBe(1536);
    h.p.dispose();
    empty(memory);
  });
});
it("preserves complete original success/cache-hit and rejection/native-disposal traces in active and inactive scopes", async () => {
  for (const unsupported of [false, true]) {
    const memory = new ManagedMemory(limits);
    let active: ReturnType<typeof setup> | undefined;
    await withManagedMemory(memory, async () => {
      active = setup(unsupported);
      const first = active.run(),
        second = active.run();
      expect(first).toBe(second);
      expect(memory.owns(active.private.sourceState)).toBe(true);
      active.p.dispose();
      empty(memory);
    });
    const inactive = setup(unsupported);
    expect(inactive.run()).toBe(inactive.run());
    inactive.p.dispose();
    const hash = unsupported
      ? "348a627a21e22ca36bc623707da5e0f6120bda18e47296b06cf2cc36e7c638a3"
      : "433784839ba71b59f90b6781280aab1ad3505b060a32e3d593b07d64f1e1d145";
    expect(sha(active!.records)).toBe(hash);
    expect(sha(inactive.records)).toBe(hash);
  }
});
it("retains actual key text/entry owner and drops original tuple/edge/native references at release", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.run();
    const key = JSON.stringify([asset, 1]),
      owner = h.private.sourceState.entries.get(key)!;
    expect(memory.owns(owner)).toBe(true);
    expect(owner.key).toBe(key);
    expect(owner.tuple).toEqual([]);
    expect(owner.edges).toEqual([]);
    expect(owner.surface).toBe(h.private.sourceState.sources.get(key));
    expect(memory.statistics.current).toEqual({
      pixels: 0,
      metadata: 1536 + 592 + key.length * 2,
    });
    h.run();
    expect(h.private.sourceState.entries.get(key)).toBe(owner);
    h.p.dispose();
    expect(owner.key).toBe("");
    expect(owner.surface).toBeUndefined();
    empty(memory);
  });
});
it("releases every previously read border backing on a later null read while preserving null over raster cleanup and allowing retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      read = h.ctx.getImageData;
    const buffers: ArrayBufferLike[] = [];
    let calls = 0;
    const image = vi
      .spyOn(h.ctx, "getImageData")
      .mockImplementation((...args) => {
        if (++calls === 3) throw null;
        const result = read(...args);
        buffers.push(result.data.buffer);
        return result;
      });
    vi.spyOn(h.raster, "releaseSurface").mockImplementationOnce(() => {
      throw Error("secondary");
    });
    try {
      h.run();
      expect.fail("border");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(buffers).toHaveLength(2);
    for (const buffer of buffers) expect(buffer.byteLength).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    expect(h.private.sourceState.entries.size).toBe(0);
    image.mockRestore();
    h.run();
    h.p.dispose();
    empty(memory);
  });
});
it("keeps original edge and native consumers owned, then releases all exact edge backings before source production", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      read = h.ctx.getImageData,
      originalSurface = h.device.surface;
    const buffers: ArrayBufferLike[] = [];
    vi.spyOn(h.ctx, "getImageData").mockImplementation((...args) => {
      const image = read(...args);
      buffers.push(image.data.buffer);
      expect(memory.statistics.current.metadata).toBe(
        1536 + 2048 + 12 * asset.length,
      );
      return image;
    });
    vi.spyOn(h.device, "surface").mockImplementation((...args) => {
      expect(buffers).toHaveLength(4);
      for (const buffer of buffers) expect(buffer.byteLength).toBe(0);
      return originalSurface(...args);
    });
    h.run();
    h.p.dispose();
    empty(memory);
  });
});
it("clears actual key data after original JSON/null and partial native producer failures, then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      json = vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
        throw null;
      });
    try {
      h.run();
      expect.fail("JSON");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    json.mockRestore();
    const native = vi.spyOn(h.device, "surface").mockImplementationOnce(() => {
      throw null;
    });
    try {
      h.run();
      expect.fail("surface");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    native.mockRestore();
    h.run();
    h.p.dispose();
    empty(memory);
  });
});
it("releases pending source and raster despite secondary errors after null upload, then allows retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      upload = vi.spyOn(h.device, "upload").mockImplementationOnce(() => {
        throw null;
      }),
      native = vi.spyOn(h.device, "release").mockImplementationOnce(() => {
        throw Error("secondary source");
      }),
      raster = vi
        .spyOn(h.raster, "releaseSurface")
        .mockImplementationOnce(() => {
          throw Error("secondary raster");
        });
    try {
      h.run();
      expect.fail("upload");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(native).toHaveBeenCalledTimes(1);
    expect(raster).toHaveBeenCalledTimes(1);
    expect(h.private.sourceState.sources.size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    upload.mockRestore();
    h.run();
    h.p.dispose();
    empty(memory);
  });
});
it("evicts the original oldest rejected key at 1024 without retaining orphaned owner text or changing borrowed assets", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(true),
      image = h.images.get(asset)!,
      dimensions = h.sizes.get(asset)!;
    const first = h.run();
    expect(first).toBeUndefined();
    const firstOwner = h.private.sourceState.entries.get(
      JSON.stringify([asset, 1]),
    )!;
    for (let i = 0; i < 1024; i++) {
      const id = "sprite-" + i;
      h.images.set(id, image);
      h.sizes.set(id, dimensions);
      h.private.source(id, 1);
    }
    expect(h.private.sourceState.unsupported.size).toBe(1024);
    expect(h.private.sourceState.entries.size).toBe(1024);
    expect(firstOwner.key).toBe("");
    expect(memory.owns(firstOwner)).toBe(false);
    expect(dimensions).toEqual([64, 48]);
    h.p.dispose();
    empty(memory);
  });
});
it("preserves source byte-budget and LRU eviction ordering while clearing evicted key owners", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      image = h.images.get(asset)!;
    const native = vi.spyOn(h.device, "release");
    for (const id of ["one", "two", "three"]) {
      h.images.set(id, image);
      h.sizes.set(id, [8192, 8192]);
    }
    h.private.source("one", 1);
    h.private.source("two", 1);
    const first = h.private.sourceState.entries.get(
      JSON.stringify(["one", 1]),
    )!;
    h.private.source("two", 1);
    h.private.source("three", 1);
    expect(first.key).toBe("");
    expect(native.mock.calls.map(([s]) => s.id)).toEqual([1]);
    expect(h.private.sourceState.sources.size).toBe(2);
    h.p.dispose();
    expect(native.mock.calls.map(([s]) => s.id)).toEqual([1, 2, 3]);
    empty(memory);
  });
});
it("visits all source owners after first-null disposal and preserves null while clearing cache metadata", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.run();
    h.images.set("second", h.images.get(asset)!);
    h.sizes.set("second", h.sizes.get(asset)!);
    h.private.source("second", 1);
    const native = vi.spyOn(h.device, "release").mockImplementationOnce(() => {
      throw null;
    });
    try {
      h.p.dispose();
      expect.fail("dispose");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(native).toHaveBeenCalledTimes(2);
    expect(h.private.sourceState.sources.size).toBe(0);
    expect(h.private.sourceState.entries.size).toBe(0);
    empty(memory);
  });
});
it("uses original source destruction after scope exit or allocator-first cleanup without orphaned cache references", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    const h = await withManagedMemory(memory, async () => {
      const h = setup();
      h.run();
      return h;
    });
    const native = vi.spyOn(h.device, "release");
    if (allocatorFirst) memory.dispose();
    h.p.dispose();
    memory.dispose();
    expect(native).toHaveBeenCalledTimes(1);
    expect(h.private.sourceState.sources.size).toBe(0);
    expect(h.private.sourceState.entries.size).toBe(0);
    expect(h.private.sourceState.closed).toBe(true);
    empty(memory);
  }
});
it("releases actual source-state header on original null constructor query then permits retry", async () => {
  const memory = new ManagedMemory(limits),
    h = pngSourceHarness(),
    query = vi.spyOn(h.device.gl, "getParameter").mockImplementationOnce(() => {
      throw null;
    });
  await withManagedMemory(memory, async () => {
    try {
      new WebglPngImages(
        h.device as unknown as WebglDevice,
        h.raster as unknown as Canvas2dBackend,
        h as unknown as CanvasImageResources,
      );
      expect.fail("query");
    } catch (error) {
      expect(error).toBe(null);
    }
    empty(memory);
    query.mockRestore();
    const p = new WebglPngImages(
      h.device as unknown as WebglDevice,
      h.raster as unknown as Canvas2dBackend,
      h as unknown as CanvasImageResources,
    );
    p.dispose();
    empty(memory);
  });
});
it("retains an original successfully uploaded cache entry after first-null raster release, then retries the cache and disposes once", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(),
      raster = vi
        .spyOn(h.raster, "releaseSurface")
        .mockImplementationOnce(() => {
          throw null;
        }),
      native = vi.spyOn(h.device, "surface"),
      release = vi.spyOn(h.device, "release");
    try {
      h.run();
      expect.fail("raster release");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(h.private.sourceState.sources.size).toBe(1);
    expect(h.private.sourceState.entries.size).toBe(1);
    expect(raster).toHaveBeenCalledTimes(1);
    h.run();
    expect(native).toHaveBeenCalledTimes(1);
    h.p.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    empty(memory);
  });
});
it("releases actual device-owned cached native storage once under cache-first and allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = fakeWebglDevice(),
      h = pngSourceHarness();
    Object.assign(fixture.gl, { texSubImage2D: vi.fn() });
    let device: NativeDevice | undefined, p: WebglPngImages | undefined;
    await withManagedMemory(memory, async () => {
      device = new NativeDevice(fixture.canvas);
      p = new WebglPngImages(
        device,
        h.raster as unknown as Canvas2dBackend,
        h as unknown as CanvasImageResources,
      );
      const surface = (p as unknown as PrivatePng).source(asset, 1)!;
      expect(memory.owns(surface)).toBe(true);
      expect(memory.statistics.current.pixels).toBe(32 * 24 * 4);
    });
    if (allocatorFirst) memory.dispose();
    p!.dispose();
    device!.dispose();
    memory.dispose();
    expect(fixture.gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(fixture.gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect((p as unknown as PrivatePng).sourceState.entries.size).toBe(0);
    empty(memory);
  }
});
it("rejects unmanaged or foreign source cache containers before JSON production in an active allocator", async () => {
  const unmanaged = setup(),
    memory = new ManagedMemory(limits),
    other = new ManagedMemory(limits);
  const managed = await withManagedMemory(memory, async () => setup());
  await withManagedMemory(other, async () => {
    const json = vi.spyOn(JSON, "stringify");
    expect(unmanaged.run).toThrow("another allocator");
    expect(managed.run).toThrow("another allocator");
    expect(json).not.toHaveBeenCalled();
    expect(unmanaged.records).toEqual([]);
    expect(managed.records).toEqual([]);
    empty(other);
    json.mockRestore();
  });
  unmanaged.p.dispose();
  managed.p.dispose();
  memory.dispose();
  other.dispose();
  empty(memory);
  empty(other);
});
