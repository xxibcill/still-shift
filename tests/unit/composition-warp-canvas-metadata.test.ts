import { afterEach, expect, it, vi } from "vitest";
import { warpEffectKernel } from "../../packages/renderer-core/src/composition/render/warp-effects.ts";
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
const originals = [
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ac145ba3de203f2c1040eeff15d756ebbdbc43423173065403c1997cbec24ba7",
    records: [
      ["read", 1],
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
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f5d5e6f45319307596fb1e467e4d222db6ae8a2212c0466ba323ee917231412d",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [29, 135, 84, 106, 27, 53, 180, 197, 32, 190, 7, 71, 35, 177, 26, 108],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ac145ba3de203f2c1040eeff15d756ebbdbc43423173065403c1997cbec24ba7",
    records: [
      ["read", 1],
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
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "bc28269734f13983ce5225089c93607557812754625cea218891f51b07921685",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [24, 43, 202, 53, 204, 13, 140, 20, 34, 195, 7, 38, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "45884a149395dcc5bf1a2338ba4aa9c890481c12a3bff5ccd6eeaf6f590565e9",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [119, 22, 169, 71, 204, 7, 138, 35, 40, 97, 121, 147, 201, 5, 142, 52],
        0,
        0,
      ],
    ],
  },
] as const;
const limits = { pixels: 1048576, metadata: 1048576 };
const affine = {
  anchor: [0.5, 0.5],
  offset: [0, 0],
  scale: [1, 1],
  rotation: 0,
};
const corner = {
  topLeft: [0, 0],
  topRight: [1, 0],
  bottomRight: [1, 1],
  bottomLeft: [0, 1],
};
type Work = {
  arrays: number[][];
  point?: number[];
  keys?: string[];
  points?: (readonly number[])[];
  sourcePoint?: unknown;
  uniforms?: Record<string, readonly number[]>;
  mapping?: object;
  input?: object;
  output?: object;
  image?: ImageData;
  premultiplied?: Uint8Array<ArrayBuffer>;
  sample?: number[];
  sampling: { index?: unknown };
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function owner(memory: ManagedMemory): Work | undefined {
  const resources = (
    memory as unknown as { resources: Map<object, { value: object }> }
  ).resources;
  for (const r of resources.values())
    if (Object.hasOwn(r.value, "sampling")) return r.value as Work;
}
function run(
  h: ReturnType<typeof shadowHarness>,
  params: object = affine,
  id = "distort.transform",
) {
  return warpEffectKernel(id)!.renderCanvas!(
    h.context as never,
    h.input as never,
    params as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves all seven whole original Canvas warp native transactions and complete published pixels in active/inactive routes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      check = async () => {
        for (const x of originals) {
          const h = shadowHarness();
          run(h, x.params, x.id);
          expect(h.records).toHaveLength(x.calls);
          expect(sha(h.records)).toBe(x.sha256);
          empty(memory);
        }
      };
    if (active) await withManagedMemory(memory, check);
    else await check();
    memory.dispose();
  }
});
it("rejects 16383-byte work before original mapping/validation/math/readback/view/native factories", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = shadowHarness();
    await withManagedMemory(memory, async () => {
      const cos = vi.spyOn(Math, "cos"),
        round = vi.spyOn(Math, "round"),
        get = vi.spyOn(h.input.ctx, "getImageData");
      expect(() => run(h, params, id)).toThrow(/metadata/);
      expect(cos).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("holds actual mapping/sample/readback/premultiplied/native refs through publication then detaches both backings and clears actual containers", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      before = JSON.stringify(params);
    let actual: Work | undefined,
      arrays: number[][] = [],
      sample: number[] | undefined,
      mapping: object | undefined,
      uniforms: object | undefined,
      read: Uint8ClampedArray | undefined,
      premultiplied: Uint8Array | undefined,
      sampling: { index?: unknown } | undefined;
    await withManagedMemory(memory, async () => {
      const create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
        const out = create(...args),
          put = out.ctx.putImageData;
        vi.spyOn(out.ctx, "putImageData").mockImplementation((...putArgs) => {
          actual = owner(memory)!;
          expect(memory.owns(actual)).toBe(true);
          expect(memory.statistics.current).toEqual({
            pixels: 32,
            metadata: 16384,
          });
          expect(actual.input).toBe(h.input);
          expect(actual.output).toBe(out);
          expect(actual.image).toBe(putArgs[0]);
          expect(actual.sourcePoint).toBeTypeOf("function");
          expect(actual.point).toBeUndefined();
          arrays = actual.arrays.slice();
          expect(arrays).toHaveLength(id === "distort.transform" ? 4 : 7);
          sample = actual.sample;
          mapping = actual.mapping;
          uniforms = actual.uniforms;
          read = actual.image!.data;
          premultiplied = actual.premultiplied;
          sampling = actual.sampling;
          expect(memory.owns(read.buffer)).toBe(true);
          expect(memory.owns(premultiplied!.buffer)).toBe(true);
          return put(...putArgs);
        });
        return out;
      });
      run(h, params, id);
      empty(memory);
    });
    for (const a of arrays) expect(a).toHaveLength(0);
    expect(sample).toHaveLength(0);
    expect(mapping).toEqual({});
    expect(uniforms).toEqual({});
    expect(sampling!.index).toBeUndefined();
    expect(read!.byteLength).toBe(0);
    expect(premultiplied!.byteLength).toBe(0);
    expect(actual).toEqual({});
    expect(JSON.stringify(params)).toBe(before);
    expect(h.input.width).toBe(2);
    memory.dispose();
  }
});
it("reuses one admitted point/index control through all four pixel consumers and retires actual point arrays without per-pixel leases", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness();
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        floor = Math.floor,
        points = new Set<number[]>();
      vi.spyOn(Math, "floor").mockImplementation((v) => {
        const work = owner(memory);
        if (work?.sampling.index) {
          expect(memory.owns(work)).toBe(true);
          expect(memory.statistics.current).toEqual({
            pixels: 32,
            metadata: 16384,
          });
          expect(work.point).toHaveLength(2);
          points.add(work.point!);
        }
        return floor(v);
      });
      run(h, params, id);
      expect(points.size).toBe(4);
      for (const p of points) expect(p).toHaveLength(0);
      expect(
        reserve.mock.calls.filter((c) => c[0] === "metadata").map((c) => c[1]),
      ).toEqual([16384]);
      expect(
        reserve.mock.calls.filter((c) => c[0] === "pixels").map((c) => c[1]),
      ).toEqual([16, 16]);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("keeps both original pixel quota cuts and retires every actual earlier backing and mapping control", async () => {
  for (const pixels of [15, 31]) {
    const memory = new ManagedMemory({ ...limits, pixels }),
      h = shadowHarness(),
      adopt = memory.adopt.bind(memory);
    const stores: ArrayBuffer[] = [];
    let actual: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        if (args[0] instanceof ArrayBuffer) stores.push(args[0]);
        else if (Object.hasOwn(args[0], "sampling")) actual = args[0] as Work;
        return adopt(...args);
      });
      expect(() => run(h)).toThrow(/pixel/);
      expect(stores).toHaveLength(pixels === 15 ? 0 : 1);
      for (const s of stores) expect(s.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
    });
    memory.dispose();
  }
});
it("captures the actual unreturned premultiply view before loops and retires both stores after mid-loop null even if first retirement fails", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    release = memory.release.bind(memory);
  let actual: Work | undefined, premultiplied: Uint8Array | undefined;
  const stores: ArrayBufferLike[] = [];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "release").mockImplementation((value) => {
      stores.push(value as ArrayBufferLike);
      release(value);
      if (stores.length === 1) throw Error("secondary backing retirement");
    });
    const round = Math.round;
    let n = 0;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      const work = owner(memory);
      if (work?.premultiplied && !work.sample && ++n === 4) {
        actual = work;
        premultiplied = work.premultiplied;
        throw null;
      }
      return round(v);
    });
    let failure: unknown = "unset";
    try {
      run(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(stores).toHaveLength(2);
    for (const s of stores) expect(s.byteLength).toBe(0);
    expect(premultiplied!.byteLength).toBe(0);
    expect(actual).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    run(h);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual source-point/index/sample/mapping refs after source-point or sampling null and visits both backings despite secondary cleanup failure", async () => {
  for (const stage of ["source-point", "sampling"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      release = memory.release.bind(memory);
    let actual: Work | undefined,
      point: number[] | undefined,
      sampling: { index?: unknown } | undefined;
    const stores: ArrayBufferLike[] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((value) => {
        stores.push(value as ArrayBufferLike);
        release(value);
        if (stores.length === 1) throw Error("secondary backing retirement");
      });
      const abs = Math.abs,
        floor = Math.floor;
      const fail = (work: Work) => {
        actual = work;
        point = work.point;
        sampling = work.sampling;
        throw null;
      };
      if (stage === "source-point")
        vi.spyOn(Math, "abs").mockImplementation((v) => {
          const work = owner(memory);
          if (work?.sample) return fail(work);
          return abs(v);
        });
      else
        vi.spyOn(Math, "floor").mockImplementation((v) => {
          const work = owner(memory);
          if (work?.sampling.index) return fail(work);
          return floor(v);
        });
      let failure: unknown = "unset";
      try {
        run(h, corner, "distort.corner-pin");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(2);
      for (const s of stores) expect(s.byteLength).toBe(0);
      if (point) expect(point).toHaveLength(0);
      expect(sampling!.index).toBeUndefined();
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h, corner, "distort.corner-pin");
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires actual earlier stores on native read/create/publication null and permits retry", async () => {
  for (const stage of ["read", "create", "put"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      adopt = memory.adopt.bind(memory);
    const stores: ArrayBuffer[] = [];
    let actual: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        if (args[0] instanceof ArrayBuffer) stores.push(args[0]);
        else if (Object.hasOwn(args[0], "sampling")) actual = args[0] as Work;
        return adopt(...args);
      });
      const fail = () => {
        throw null;
      };
      if (stage === "read")
        vi.spyOn(h.input.ctx, "getImageData").mockImplementationOnce(fail);
      if (stage === "create")
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(fail);
      if (stage === "put") {
        const create = h.context.createSurface;
        vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
          const out = create(...args);
          vi.spyOn(out.ctx, "putImageData").mockImplementationOnce(fail);
          return out;
        });
      }
      let failure: unknown = "unset";
      try {
        run(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(stage === "read" ? 0 : 2);
      for (const s of stores) expect(s.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual nested controller on adoption null before mapping/readback/native factories", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness();
  let actual: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value;
      throw null;
    });
    const cos = vi.spyOn(Math, "cos");
    let failure: unknown = "unset";
    try {
      run(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual({});
    expect(cos).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    empty(memory);
    vi.restoreAllMocks();
    run(h);
    empty(memory);
  });
  memory.dispose();
});
it("propagates successful-publication cleanup null after both actual backings and metadata retire", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    release = memory.release.bind(memory);
  let actual: Work | undefined;
  const stores: ArrayBufferLike[] = [];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "release").mockImplementation((value) => {
      actual ??= owner(memory);
      stores.push(value as ArrayBufferLike);
      release(value);
      if (stores.length === 1) throw null;
    });
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      actual = owner(memory);
      return create(...args);
    });
    let failure: unknown = "unset";
    try {
      run(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toHaveLength(3);
    expect(stores).toHaveLength(2);
    for (const s of stores) expect(s.byteLength).toBe(0);
    expect(actual).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
