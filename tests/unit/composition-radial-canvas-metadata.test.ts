import { afterEach, expect, it, vi } from "vitest";
import { radialDistortionKernel } from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
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
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "b4603e2029ca7a914bcdc553d134072fefd9ce89b8447ee855fc15df877d914c",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [
          24, 62, 173, 201, 130, 27, 157, 96, 33, 168, 41, 149, 36, 164, 43,
          112,
        ],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
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
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 0,
      wavelength: 32,
      phase: 0,
      decay: 0,
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.3, 0.7],
      amplitude: 4,
      wavelength: 32,
      phase: 90,
      decay: 0.3,
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
    id: "distort.ripple",
    params: {
      center: [0, 1],
      amplitude: -1000,
      wavelength: 0.0625,
      phase: -270,
      decay: 8,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "c5f14139f4a5da7b0e4a735c05dbbb3053377f778d833a39130073924b4130e7",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 185, 0, 11, 112, 33, 156, 100, 0, 0, 0, 0, 32, 191, 0, 8],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 1000,
      wavelength: 8192,
      phase: 180,
      decay: 0,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "b353b69b40ce71c5e4f20c0a5f383aefaece651c0349e9fb638a622a6c88824f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [
          50, 74, 142, 138, 71, 67, 142, 111, 47, 102, 112, 125, 62, 91, 114,
          98,
        ],
        0,
        0,
      ],
    ],
  },
] as const;
const limits = { pixels: 1048576, metadata: 2097152 };
const bulge = { center: [0.3, 0.7], radius: [2.5, 1.25], amount: 1 },
  ripple = {
    center: [0.3, 0.7],
    amplitude: 4,
    wavelength: 32,
    phase: 90,
    decay: 0.3,
  };
type Work = {
  factors?: Int32Array<ArrayBuffer>;
  center?: number[];
  radius?: number[];
  controls?: object;
  image?: ImageData;
  premultiplied?: Uint8Array<ArrayBuffer>;
  sample?: number[];
  point?: number[];
  sampling: { index?: unknown };
  input?: object;
  output?: object;
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
  params: object = bulge,
  id = "distort.bulge",
) {
  return radialDistortionKernel(id)!.renderCanvas!(
    h.context as never,
    h.input as never,
    params as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves all seven whole original radial Canvas transactions and full published pixels in active/inactive routes", async () => {
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
it("rejects header and exact factor growth before selected factories while original neutral return needs no admission", async () => {
  for (const [id, params, count] of [
    ["distort.bulge", bulge, 65537],
    ["distort.ripple", ripple, 47],
  ] as const)
    for (const metadata of [16383, 16384 + count * 4 - 1]) {
      const memory = new ManagedMemory({ ...limits, metadata }),
        h = shadowHarness();
      await withManagedMemory(memory, async () => {
        const round = vi.spyOn(Math, "round"),
          get = vi.spyOn(h.input.ctx, "getImageData");
        expect(() => run(h, params, id)).toThrow(/metadata/);
        expect(round).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
        expect(h.records).toHaveLength(0);
        empty(memory);
        const reserve = vi.spyOn(memory, "reserve");
        expect(run(h, { ...params, amount: 0, amplitude: 0 }, id)).toBe(
          h.input,
        );
        expect(reserve).not.toHaveBeenCalled();
        empty(memory);
      });
      vi.restoreAllMocks();
      memory.dispose();
    }
});
it("holds actual factors/vectors/controller/sample/pixel/native refs through publication then detaches three backings and clears actual containers", async () => {
  for (const [id, params] of [
    ["distort.bulge", bulge],
    ["distort.ripple", ripple],
  ] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      before = JSON.stringify(params);
    let actual: Work | undefined,
      factors: Int32Array | undefined,
      read: Uint8ClampedArray | undefined,
      premultiplied: Uint8Array | undefined,
      center: number[] | undefined,
      radius: number[] | undefined,
      controls: object | undefined,
      sample: number[] | undefined,
      sampling: { index?: unknown } | undefined;
    await withManagedMemory(memory, async () => {
      const create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
        const out = create(...args),
          put = out.ctx.putImageData;
        vi.spyOn(out.ctx, "putImageData").mockImplementation((...p) => {
          actual = owner(memory)!;
          expect(memory.owns(actual)).toBe(true);
          factors = actual.factors;
          expect(memory.statistics.current).toEqual({
            pixels: 32,
            metadata: 16384 + factors!.byteLength,
          });
          expect(actual.input).toBe(h.input);
          expect(actual.output).toBe(out);
          expect(actual.image).toBe(p[0]);
          expect(actual.point).toBeUndefined();
          read = actual.image!.data;
          premultiplied = actual.premultiplied;
          center = actual.center;
          radius = actual.radius;
          controls = actual.controls;
          sample = actual.sample;
          sampling = actual.sampling;
          expect(memory.owns(read.buffer)).toBe(true);
          expect(memory.owns(premultiplied!.buffer)).toBe(true);
          return put(...p);
        });
        return out;
      });
      run(h, params, id);
      empty(memory);
    });
    expect(factors!.byteLength).toBe(0);
    expect(read!.byteLength).toBe(0);
    expect(premultiplied!.byteLength).toBe(0);
    expect(center).toHaveLength(0);
    expect(radius).toHaveLength(0);
    expect(sample).toHaveLength(0);
    expect(controls).toEqual({});
    expect(sampling!.index).toBeUndefined();
    expect(actual).toEqual({});
    expect(JSON.stringify(params)).toBe(before);
    memory.dispose();
  }
});
it("keeps each of four actual point arrays/index closures through pixel consumers under one grown owner and two original pixel admissions", async () => {
  for (const [id, params] of [
    ["distort.bulge", bulge],
    ["distort.ripple", ripple],
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
            metadata: 16384 + work.factors!.byteLength,
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
it("keeps both original pixel quota cuts and retires actual earlier stores plus factor backing", async () => {
  for (const pixels of [15, 31]) {
    const memory = new ManagedMemory({ ...limits, pixels }),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let actual: Work | undefined, factors: Int32Array | undefined;
    const stores: ArrayBuffer[] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        if (args[0] === "pixels") {
          actual = owner(memory);
          factors = actual!.factors;
        }
        return reserve(...args);
      });
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        if (args[0] instanceof ArrayBuffer) stores.push(args[0]);
        return adopt(...args);
      });
      expect(() => run(h)).toThrow(/pixel/);
      expect(stores).toHaveLength(pixels === 15 ? 0 : 1);
      for (const b of stores) expect(b.byteLength).toBe(0);
      expect(factors!.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
    });
    memory.dispose();
  }
});
it("captures actual partial factors/premultiply/point/index and retires every produced backing after math null over secondary cleanup", async () => {
  for (const stage of ["factor", "premultiply", "point", "sampling"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      release = memory.release.bind(memory);
    let actual: Work | undefined,
      factors: Int32Array | undefined,
      point: number[] | undefined;
    const stores: ArrayBufferLike[] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        stores.push(v as ArrayBufferLike);
        release(v);
        if (stores.length === 1) throw Error("secondary backing retirement");
      });
      const round = Math.round,
        floor = Math.floor;
      let calls = 0;
      const fail = (work: Work) => {
        actual = work;
        factors = work.factors;
        point = work.point;
        throw null;
      };
      vi.spyOn(Math, "round").mockImplementation((v) => {
        const work = owner(memory);
        if (
          work &&
          ((stage === "factor" && work.factors && !work.controls) ||
            (stage === "premultiply" && work.premultiplied && !work.sample)) &&
          ++calls === 3
        )
          return fail(work);
        return round(v);
      });
      vi.spyOn(Math, "floor").mockImplementation((v) => {
        const work = owner(memory);
        if (
          work?.sample &&
          ((stage === "point" && !work.point) ||
            (stage === "sampling" && work.sampling.index))
        )
          return fail(work);
        return floor(v);
      });
      let failure: unknown = "unset";
      try {
        run(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(stores).toHaveLength(stage === "factor" ? 0 : 2);
      for (const b of stores) expect(b.byteLength).toBe(0);
      expect(factors!.byteLength).toBe(0);
      if (point) expect(point).toHaveLength(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual native/control/store refs after read/create/publication null and permits retry", async () => {
  for (const stage of ["read", "create", "put"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory);
    let actual: Work | undefined, factors: Int32Array | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        if (args[0] === "pixels") {
          actual = owner(memory);
          factors = actual!.factors;
        }
        return reserve(...args);
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
      expect(factors!.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual nested work on adoption/growth null before factor math/readback/native factories", async () => {
  for (const stage of ["adopt", "resize"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let actual: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        actual = args[0] as Work;
        if (stage === "adopt") throw null;
        return adopt(...args);
      });
      if (stage === "resize")
        vi.spyOn(memory, "reserve").mockImplementation((...args) => {
          const lease = reserve(...args);
          vi.spyOn(lease, "resize").mockImplementation(() => {
            throw null;
          });
          return lease;
        });
      const round = vi.spyOn(Math, "round");
      let failure: unknown = "unset";
      try {
        run(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("propagates successful-publication first cleanup null only after both pixel stores, factor backing and actual refs retire", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    release = memory.release.bind(memory);
  let actual: Work | undefined, factors: Int32Array | undefined;
  const stores: ArrayBufferLike[] = [];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "release").mockImplementation((v) => {
      stores.push(v as ArrayBufferLike);
      release(v);
      if (stores.length === 1) throw null;
    });
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      actual = owner(memory);
      factors = actual!.factors;
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
    for (const b of stores) expect(b.byteLength).toBe(0);
    expect(factors!.byteLength).toBe(0);
    expect(actual).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
