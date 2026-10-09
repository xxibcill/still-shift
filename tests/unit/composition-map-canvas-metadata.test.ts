import { afterEach, expect, it, vi } from "vitest";
import { mapEffectKernel } from "../../packages/renderer-core/src/composition/render/map-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function shadowHarness() {
  let id = 1;
  const records: unknown[] = [];
  const call = (name: string, ...v: unknown[]) => {
    records.push([name, ...v]);
  };
  const pixels = [
    23, 41, 199, 213, 201, 7, 143, 81, 33, 192, 9, 151, 241, 59, 73, 0,
  ];
  const surface = (value: number, w = 2, h = 2) => ({
    id: value,
    width: w,
    height: h,
    canvas: { id: value },
    ctx: {
      getImageData: () => {
        call("read", value);
        return { data: new Uint8ClampedArray(pixels) };
      },
      putImageData: (image: { data: Uint8ClampedArray }, ...v: unknown[]) =>
        call("put", value, [...image.data], ...v),
    },
  });
  const input = surface(1),
    context = {
      createSurface: (w: number, h: number) => {
        const v = surface(++id, w, h);
        call("create", v.id, w, h);
        return v;
      },
      uploadBytes: (v: { id: number }, data: Uint8Array) =>
        call("upload", v.id, [...data]),
      pass: (
        body: string,
        out: { id: number },
        inputs: readonly { id: number }[],
        uniforms: unknown,
      ) =>
        call(
          "pass",
          body.length,
          sha(body),
          out.id,
          inputs.map((v) => v.id),
          JSON.parse(JSON.stringify(uniforms)),
        ),
    };
  return { records, input, context };
}
export function mapHarness() {
  const h = shadowHarness(),
    field = {
      ...h.input,
      id: 77,
      canvas: { id: 77 },
      ctx: {
        getImageData: () => {
          h.records.push(["read", 77]);
          return {
            data: new Uint8ClampedArray([
              13, 247, 171, 64, 200, 7, 243, 255, 8, 119, 31, 128, 251, 16, 93,
              0,
            ]),
          };
        },
      },
    };
  const context = { ...h.context, layers: new Map([["map", field]]) };
  return { ...h, field, context };
}
const originals = [
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 0],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [8.3, -4.7],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 9],
      midpoint: 0.5,
      channelX: 2,
      channelY: 3,
    },
    gpu: false,
    calls: 4,
    sha256: "1cf69fca23c531ff6852ce6e35eb3cc63cb8b8008dffd33a53929067a7e1ea9b",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [22, 41, 198, 80, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [-1000, 1000],
      midpoint: 1,
      channelX: 3,
      channelY: 4,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [1.0625, -0.9375],
      midpoint: 0,
      channelX: 4,
      channelY: 2,
    },
    gpu: false,
    calls: 4,
    sha256: "4ee38fe4944658071374820c185ad047ce07061914efe4a141742a4bd5809c6d",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [37, 38, 193, 153, 191, 0, 128, 4, 34, 179, 26, 127, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 1,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "0f8c6006e40e44df96fb4c85cfa44d0f026c6ccc709fbaa954ee6ab68ea79ff6",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0.4,
      channel: 0,
      invert: 1,
    },
    gpu: false,
    calls: 4,
    sha256: "0f8c6006e40e44df96fb4c85cfa44d0f026c6ccc709fbaa954ee6ab68ea79ff6",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 1,
      channel: 3,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "bb6a449f00708be8e1d1ea88d467cffca1fee2ba48e6bd5275e91714f63bef6e",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [22, 41, 199, 173, 201, 6, 142, 81, 34, 192, 9, 113, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.0001,
      softness: 0.03,
      channel: 1,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "93b94aab763225b3a72f3e78217fc8c99cba36816f033b6a2ef92de3f729d0c3",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 201, 6, 142, 81, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
];
const limits = { pixels: 1048576, metadata: 1048576 },
  params = { amount: [8.3, -4.7], midpoint: 0.5, channelX: 0, channelY: 1 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
type Work = {
  sourceControl: { value?: Uint8Array };
  fieldControl: { value?: Uint8Array };
  sampling: { index?: unknown };
  channel: { straight?: unknown };
  image?: { data: Uint8ClampedArray };
  mapImage?: { data: Uint8ClampedArray };
  source?: Uint8Array;
  field?: Uint8Array;
  sample?: number[];
  amount?: number[];
  view?: Uint8Array;
  input?: object;
  map?: object;
  output?: object;
  every?: unknown;
};
function owner(memory: ManagedMemory): Work | undefined {
  const resources = (
    memory as unknown as { resources: Map<object, { value: object }> }
  ).resources;
  return [...resources.values()]
    .map((x) => x.value)
    .find(
      (x) =>
        Object.hasOwn(x, "sourceControl") && Object.hasOwn(x, "fieldControl"),
    ) as Work | undefined;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 11 complete original map Canvas native/pixel traces in active/inactive routes with no residual owners", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      run = async () => {
        for (const x of originals) {
          const h = mapHarness(),
            plugin = mapEffectKernel(x.id)!;
          plugin.renderCanvas!(
            h.context as never,
            h.input as never,
            x.params as never,
          );
          expect(h.records).toHaveLength(x.calls);
          expect(sha(h.records)).toBe(x.sha256);
          empty(memory);
        }
      };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
});
it("rejects actual work before original neutral/layer/readback/native/pixel/math factories", async () => {
  for (const amount of [
    [0, 0],
    [8.3, -4.7],
  ]) {
    const memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!;
    await withManagedMemory(memory, async () => {
      const every = vi.spyOn(Array.prototype, "every"),
        get = vi.spyOn(h.context.layers, "get"),
        round = vi.spyOn(Math, "round");
      expect(() =>
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          { ...params, amount } as never,
        ),
      ).toThrow(/metadata/);
      expect(every).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("keeps original neutral early return with actual callback ownership and no native/layer/pixel allocations", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: Work | undefined;
  await withManagedMemory(memory, async () => {
    const every = Array.prototype.every;
    vi.spyOn(Array.prototype, "every").mockImplementation(function (
      this: number[],
      callback,
      ...args
    ) {
      work = owner(memory)!;
      expect(memory.owns(work)).toBe(true);
      expect(work.every).toBe(callback);
      return every.call(this, callback, ...args);
    });
    expect(
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        { ...params, amount: [0, 0] } as never,
      ),
    ).toBe(h.input);
    expect(h.records).toHaveLength(0);
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
it("holds all four actual backing/view/native/vector refs through publication then detaches stores and clears arrays/control refs without mutating borrowed source/map/params", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: Work | undefined;
  const views: (Uint8Array | Uint8ClampedArray)[] = [],
    arrays: number[][] = [];
  await withManagedMemory(memory, async () => {
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      const output = create(...args),
        put = output.ctx.putImageData;
      vi.spyOn(output.ctx, "putImageData").mockImplementation((...parts) => {
        work = owner(memory)!;
        expect(memory.owns(work)).toBe(true);
        expect(memory.statistics.current).toEqual({
          pixels: 64,
          metadata: 16384,
        });
        expect(work.input).toBe(h.input);
        expect(work.map).toBe(h.field);
        expect(work.output).toBe(output);
        expect(parts[0]).toBe(work.image);
        views.push(
          work.image!.data,
          work.source!,
          work.mapImage!.data,
          work.field!,
        );
        arrays.push(work.amount!, work.sample!);
        for (const value of views) expect(memory.owns(value.buffer)).toBe(true);
        expect(work.view).toBeUndefined();
        expect(work.sampling.index).toBeUndefined();
        expect(work.channel.straight).toBeUndefined();
        return put(...parts);
      });
      return output;
    });
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    empty(memory);
  });
  for (const view of views) expect(view.byteLength).toBe(0);
  for (const array of arrays) expect(array).toHaveLength(0);
  expect(work).toEqual({});
  expect(params.amount).toEqual([8.3, -4.7]);
  expect(h.input.width).toBe(2);
  expect(h.field.width).toBe(2);
  memory.dispose();
});
it("reuses actual channel/sampling/field subview controls under one work and four original pixel admissions with no per-pixel lease", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  const views: Uint8Array[] = [];
  let channels = 0,
    sampling = 0;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      round = Math.round,
      floor = Math.floor;
    vi.spyOn(Math, "round").mockImplementation((value) => {
      const work = owner(memory);
      if (work?.channel.straight) {
        channels++;
        expect(typeof work.channel.straight).toBe("function");
        if (work.view && !views.includes(work.view)) views.push(work.view);
      }
      return round(value);
    });
    vi.spyOn(Math, "floor").mockImplementation((value) => {
      const work = owner(memory);
      if (work?.sampling.index) {
        sampling++;
        expect(typeof work.sampling.index).toBe("function");
        if (work.view && !views.includes(work.view)) views.push(work.view);
      }
      return floor(value);
    });
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    expect(channels).toBeGreaterThan(0);
    expect(sampling).toBeGreaterThan(0);
    expect(views).toHaveLength(4);
    for (const view of views) expect(view.byteLength).toBe(0);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 16384],
      ["pixels", 16],
      ["pixels", 16],
      ["pixels", 16],
      ["pixels", 16],
    ]);
    empty(memory);
  });
  memory.dispose();
});
it("preserves all four original pixel quota cuts before factories and retires every earlier actual backing", async () => {
  for (const pixels of [15, 31, 47, 63]) {
    const memory = new ManagedMemory({ ...limits, pixels }),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!,
      stores: ArrayBufferLike[] = [];
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        return release(value);
      });
      expect(() =>
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        ),
      ).toThrow(/pixels/);
      expect(stores).toHaveLength(Math.floor(pixels / 16));
      for (const store of stores) expect(store.byteLength).toBe(0);
      expect(h.records).toHaveLength(pixels < 16 ? 0 : pixels < 48 ? 1 : 2);
      empty(memory);
    });
    memory.dispose();
  }
});
it("captures actual unreturned source and field premultiply views before loops and detaches every produced store after math null", async () => {
  for (const field of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!,
      stores: ArrayBufferLike[] = [];
    let partial: Uint8Array | undefined, work: Work | undefined;
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        return release(value);
      });
      const round = Math.round;
      vi.spyOn(Math, "round").mockImplementation((value) => {
        const current = owner(memory),
          target = field
            ? current?.fieldControl.value
            : current?.sourceControl.value;
        if (target) {
          partial = target;
          work = current;
          throw null;
        }
        return round(value);
      });
      let failure: unknown = "unset";
      try {
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(partial!.byteLength).toBe(0);
      expect(stores).toHaveLength(field ? 4 : 2);
      for (const store of stores) expect(store.byteLength).toBe(0);
      expect(work).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        params as never,
      );
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual channel/sampling refs after their math null while preserving primary null over first backing retirement failure and visiting all four stores", async () => {
  for (const sample of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!,
      stores: ArrayBufferLike[] = [];
    let work: Work | undefined;
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        release(value);
        if (stores.length === 1)
          throw Error("secondary first backing retirement");
      });
      const round = Math.round,
        floor = Math.floor;
      if (sample)
        vi.spyOn(Math, "floor").mockImplementation((value) => {
          const current = owner(memory);
          if (current?.sampling.index) {
            work = current;
            throw null;
          }
          return floor(value);
        });
      else
        vi.spyOn(Math, "round").mockImplementation((value) => {
          const current = owner(memory);
          if (current?.channel.straight) {
            work = current;
            throw null;
          }
          return round(value);
        });
      let failure: unknown = "unset";
      try {
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(4);
      for (const store of stores) expect(store.byteLength).toBe(0);
      expect(work).toEqual({});
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires all earlier stores after either original readback throws null and permits retry", async () => {
  for (const field of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!,
      stores: ArrayBufferLike[] = [];
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        return release(value);
      });
      vi.spyOn(
        field ? h.field.ctx : h.input.ctx,
        "getImageData",
      ).mockImplementationOnce(() => {
        throw null;
      });
      let failure: unknown = "unset";
      try {
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(field ? 2 : 0);
      for (const store of stores) expect(store.byteLength).toBe(0);
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        params as never,
      );
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual work/stores after create/publication native null and permits retry", async () => {
  for (const publish of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!,
      stores: ArrayBufferLike[] = [];
    let work: Work | undefined;
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        return release(value);
      });
      const fail = () => {
        work = owner(memory);
        throw null;
      };
      if (!publish)
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(fail);
      else {
        const create = h.context.createSurface;
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(
          (...args) => {
            const output = create(...args);
            vi.spyOn(output.ctx, "putImageData").mockImplementationOnce(fail);
            return output;
          },
        );
      }
      let failure: unknown = "unset";
      try {
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(4);
      for (const store of stores) expect(store.byteLength).toBe(0);
      expect(work).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        params as never,
      );
      empty(memory);
    });
    memory.dispose();
  }
});
it("visits all four actual backing retirements and clears metadata after first successful-publication cleanup null", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!,
    stores: ArrayBufferLike[] = [];
  let work: Work | undefined;
  await withManagedMemory(memory, async () => {
    const release = memory.release.bind(memory);
    vi.spyOn(memory, "release").mockImplementation((value) => {
      if (value instanceof ArrayBuffer) stores.push(value);
      release(value);
      if (stores.length === 1) throw null;
    });
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      work = owner(memory);
      return create(...args);
    });
    let failure: unknown = "unset";
    try {
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        params as never,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(stores).toHaveLength(4);
    for (const store of stores) expect(store.byteLength).toBe(0);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(4);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual nested controls on phase adoption null before neutral/native factories", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      work = value;
      throw null;
    });
    const every = vi.spyOn(Array.prototype, "every");
    let failure: unknown = "unset";
    try {
      plugin.renderCanvas!(
        h.context as never,
        h.input as never,
        params as never,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(work).toEqual({});
    expect(every).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
