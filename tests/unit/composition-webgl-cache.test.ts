import { describe, expect, it, vi } from "vitest";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import { WebglIsolates } from "../../packages/renderer-core/src/composition/render/webgl-isolates.ts";
import type {
  IsolateOp,
  ProviderContent,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { WebglSurface } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const op = (layer: string): IsolateOp => ({
  kind: "isolate",
  layer,
  ops: [],
  effects: [],
  masks: [],
  matte: null,
  opacity: 1,
  blend: "normal",
  clips: [],
});

it("owns exact native visual key output and persistent definition identities across scratch", async () => {
  const layer = { id: "layer", params: { value: "ไทย" } },
    sources = [{ asset: "image" }];
  const values = [
    { layer, sources, position: [1, 2] },
    { layer, sources, position: [3, 4] },
  ];
  const original = new WebglVisualKey();
  const expected = values.map((value) => original.of(value));
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey();
    for (let i = 0; i < values.length; i++) {
      memory.beginScratch();
      const key = keys.metadata(values[i]);
      expect(key.value).toBe(expected[i]);
      key.retain();
      memory.endScratch();
      expect(key.value).toBe(expected[i]);
      key.release();
      expect(memory.statistics.current.metadata).toBe(336);
      expect(memory.statistics.reservations).toBe(1);
    }
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("denies a new definition before consuming its original identity number", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 512 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey(),
      layer = {};
    const blocker = memory.reserve("metadata", 217);
    expect(() => keys.of({ layer })).toThrow("metadata");
    blocker.release();
    expect(keys.of({ layer })).toBe('{"layer":0}');
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("retains isolate key owners across frames and supports reusable flush before final close", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey(),
      removed: WebglSurface[] = [],
      cache = new WebglIsolates(keys, (value) => removed.push(value));
    const like = surface(),
      first = surface(),
      second = surface();
    const layer = op("box");
    memory.beginScratch();
    expect(cache.render(layer, like, () => first)).toBe(first);
    cache.release(first);
    memory.endScratch();
    const retained = memory.statistics.current.metadata;
    expect(memory.statistics.reservations).toBe(5);
    for (let n = 0; n < 3; n++) {
      memory.beginScratch();
      expect(
        cache.render(layer, like, () => {
          throw Error("Unchanged isolate repainted");
        }),
      ).toBe(first);
      cache.release(first);
      memory.endScratch();
      expect(memory.statistics.current.metadata).toBe(retained);
    }
    cache.dispose();
    expect(removed).toEqual([first]);
    expect(memory.statistics.current.metadata).toBe(768);
    memory.beginScratch();
    expect(cache.render(layer, like, () => second)).toBe(second);
    cache.release(second);
    memory.endScratch();
    cache.close();
    expect(removed).toEqual([first, second]);
    expect(memory.statistics.current.metadata).toBe(256);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("denies isolate entry metadata before its producer and restores empty Map capacity", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 1536 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey(),
      cache = new WebglIsolates(keys, () => {
        throw Error("No surface was produced");
      });
    let draws = 0;
    expect(() =>
      cache.render(op("box"), surface(), () => {
        draws++;
        return surface();
      }),
    ).toThrow("metadata");
    expect(draws).toBe(0);
    expect(memory.statistics.current.metadata).toBe(768);
    expect(memory.statistics.reservations).toBe(2);
    cache.close();
    keys.dispose();
    memory.dispose();
  });
});
it("closes every isolate text/control owner while preserving a null discard failure", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey();
    let discards = 0;
    const cache = new WebglIsolates(keys, () => {
      discards++;
      if (discards === 1) throw null;
    });
    const like = surface();
    for (const id of ["first", "second"]) {
      const value = cache.render(op(id), like, surface);
      cache.release(value);
    }
    let reason: unknown = "not rejected";
    try {
      cache.close();
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(discards).toBe(2);
    expect(memory.statistics.current.metadata).toBe(256);
    expect(memory.statistics.reservations).toBe(1);
    keys.dispose();
    memory.dispose();
  });
});

it("owns the original LRU tuple copy through its actual eviction consumer and drops its references afterward", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey();
    let lookup: unknown[] | undefined;
    const captureLookup = (value: unknown[]) => {
      lookup = value;
    };
    const originalFind = Array.prototype.find;
    const find = vi.spyOn(Array.prototype, "find").mockImplementation(function (
      this: unknown[],
      ...args: Parameters<typeof originalFind>
    ) {
      if (memory.owns(this)) captureLookup(this);
      return originalFind.apply(this, args);
    });
    let evictions = 0;
    const cache = new WebglIsolates(
      keys,
      () => {
        evictions++;
        if (evictions === 1) {
          expect(lookup).toBeDefined();
          expect(memory.owns(lookup!)).toBe(true);
          expect(lookup!.length).toBe(1);
        }
      },
      256,
    );
    try {
      const like = surface();
      const first = cache.render(op("first"), like, surface);
      cache.release(first);
      const second = cache.render(op("second"), like, surface);
      cache.release(second);
      expect(lookup).toEqual([]);
      expect(memory.owns(lookup!)).toBe(false);
    } finally {
      find.mockRestore();
      cache.close();
      keys.dispose();
      memory.dispose();
    }
  });
});
const surface = (): WebglSurface => ({
  width: 8,
  height: 8,
  opaque: false,
  floating: false,
  screen: false,
  texture: {} as WebGLTexture,
  framebuffer: {} as WebGLFramebuffer,
});

describe("GPU surface reuse", () => {
  it("retains pixel content while outer compositing changes", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(new WebglVisualKey(), (s) =>
      removed.push(s),
    );
    const layer = op("box"),
      like = surface(),
      first = surface();
    expect(cache.render(layer, like, () => first)).toBe(first);
    expect(cache.release(first)).toBe(true);
    expect(
      cache.render(
        {
          ...layer,
          opacity: 0.3,
          blend: "screen",
          clips: [{ matrix: [1, 0, 0, 1, 2, 2], width: 4, height: 4 }],
        },
        like,
        () => {
          throw new Error("Unexpected repaint");
        },
      ),
    ).toBe(first);
    cache.release(first);
    cache.dispose();
    expect(removed).toEqual([first]);
  });

  it("does not evict a borrowed surface or exceed its budget for nested renders", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(
      new WebglVisualKey(),
      (s) => removed.push(s),
      256,
    );
    const like = surface(),
      parent = surface(),
      child = surface();
    expect(
      cache.render(op("parent"), like, () => {
        expect(cache.render(op("child"), like, () => child)).toBe(child);
        cache.release(child);
        return parent;
      }),
    ).toBe(parent);
    expect(removed).toEqual([child]);
    const uncached = surface();
    expect(cache.render(op("other"), like, () => uncached)).toBe(uncached);
    expect(cache.release(uncached)).toBe(false);
    expect(removed).toEqual([child]);
    cache.release(parent);
    cache.dispose();
    expect(removed).toEqual([child, parent]);
  });

  it("repaints changed content and releases each retained surface once", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(new WebglVisualKey(), (s) =>
      removed.push(s),
    );
    const like = surface(),
      first = surface(),
      second = surface(),
      layer = op("box");
    cache.render(layer, like, () => first);
    cache.release(first);
    const changed = {
      ...layer,
      effects: [
        {
          id: "blur",
          effect: "blur.gaussian",
          enabled: true,
          params: { radius: 4 },
        },
      ],
    };
    expect(cache.render(changed, like, () => second)).toBe(second);
    expect(removed).toEqual([first]);
    cache.release(second);
    cache.dispose();
    expect(removed).toEqual([first, second]);
  });
});

describe("GPU visual keys", () => {
  it("only ignores a provider clock with an explicit visual key", () => {
    const layer: ProviderContent["layer"] = {
      id: "rect",
      type: "provider",
      provider: "test.rect@1.0.0",
      params: {},
    };
    const first: ProviderContent = {
      type: "provider",
      key: "rect",
      layer,
      time: 0,
      state: 0,
    };
    const later = { ...first, time: 10, sourceTime: 2 };
    const unknown = new WebglVisualKey();
    expect(unknown.of(first)).not.toBe(unknown.of(later));
    const prepared = new WebglVisualKey(() => "same-pixels");
    expect(prepared.of(first)).toBe(prepared.of(later));
    expect(prepared.of({ ...later, state: 1 })).not.toBe(prepared.of(first));
    expect(
      prepared.of({
        ...later,
        layer: { ...layer, params: { fill: "#ffffff" } },
      }),
    ).not.toBe(prepared.of(first));
  });

  it("shares only Gaussian radii with the same integer kernel", () => {
    const key = new WebglVisualKey();
    const blur = (radius: number) => ({
      effect: "blur.gaussian",
      params: { radius },
    });
    expect(key.of(blur(4))).toBe(key.of(blur(4.1)));
    expect(key.of(blur(4))).not.toBe(key.of(blur(4.6)));
    expect(key.of(blur(0))).toBe(key.of(blur(0.1)));
    expect(key.of({ effect: "light.glow", params: { radius: 0 } })).not.toBe(
      key.of({ effect: "light.glow", params: { radius: 0.1 } }),
    );
  });
});

it("invalidates a retained isolate when scoped light controls change", () => {
  const removed: WebglSurface[] = [],
    cache = new WebglIsolates(new WebglVisualKey(), (s) => removed.push(s)),
    like = surface(),
    first = surface(),
    second = surface();
  const layer: IsolateOp = {
    ...op("lit"),
    lighting: {
      version: "flat-lighting-1",
      x: [1, 0, 0],
      y: [0, 1, 0],
      normal: [0, 0, 1],
      lights: [
        {
          positionKind: [0, 0, 0, 0],
          colorWeight: [1, 1, 1, 0.5],
          directionOuter: [0, 0, 1, 0.5],
          falloffInner: [0, 1000, 0.8, 0],
        },
      ],
    },
  };
  expect(cache.render(layer, like, () => first)).toBe(first);
  cache.release(first);
  expect(
    cache.render(structuredClone(layer), like, () => {
      throw Error("Unchanged lighting repainted");
    }),
  ).toBe(first);
  cache.release(first);
  const changed = structuredClone(layer);
  changed.lighting!.lights[0]!.colorWeight[3] = 0.75;
  expect(cache.render(changed, like, () => second)).toBe(second);
  cache.release(second);
  cache.dispose();
  expect(removed).toEqual([first, second]);
});
