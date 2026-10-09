import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { stylizeEffectKernel } from "../../packages/renderer-core/src/composition/render/stylize-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
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
    id: "stylize.vignette",
    params: {
      amount: 0,
      center: [0.5, 0.5],
      radius: [1, 1],
      softness: 0.5,
      color: [0, 0, 0, 1],
    },
    kind: "native",
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.vignette",
    params: {
      amount: 0,
      center: [0.5, 0.5],
      radius: [1, 1],
      softness: 0.5,
      color: [0, 0, 0, 1],
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.vignette",
    params: {
      amount: 1,
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      softness: 0.3,
      color: [0.9, 0.2, 0.7, 0.6],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "06edd3ab0bf0023bff8875dbc38f3906c24e5bc90cd52923a2b98fab7d6607bb",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        706,
        "f188e5f657e1ad27c811179d4db7e1b0b05caaf89230332b961642029055dd1e",
        2,
        [1],
        {
          amount: 1,
          dimensions: [2, 2],
          center: [0.3, 0.7],
          radius: [2.5, 1.25],
          softness: 0.3,
          color: [0.9, 0.2, 0.7, 0.6],
        },
      ],
    ],
  },
  {
    id: "stylize.vignette",
    params: {
      amount: 1,
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      softness: 0.3,
      color: [0.9, 0.2, 0.7, 0.6],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "047db44135a509e22e1abcb59ad1b8cbee32469d913f224e5ff9119efddc6b80",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [32, 41, 198, 213, 207, 15, 150, 81, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "stylize.vignette",
    params: {
      amount: 0.5,
      center: [0, 1],
      radius: [0.0625, 8192],
      softness: 0.0625,
      color: [0.2, 0.8, 0.4, 0.25],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "41a85dd214fccc7657c7e29c137c1aedce57d5bfe8531853ea514cb7699bff8c",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        706,
        "f188e5f657e1ad27c811179d4db7e1b0b05caaf89230332b961642029055dd1e",
        2,
        [1],
        {
          amount: 0.5,
          dimensions: [2, 2],
          center: [0, 1],
          radius: [0.0625, 8192],
          softness: 0.0625,
          color: [0.2, 0.8, 0.4, 0.25],
        },
      ],
    ],
  },
  {
    id: "stylize.vignette",
    params: {
      amount: 0.5,
      center: [0, 1],
      radius: [0.0625, 8192],
      softness: 0.0625,
      color: [0.2, 0.8, 0.4, 0.25],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "158f7d63fc1019a4c2c82ecf7dfbf5fa0e7b33278fdb9a8af837d693b1cb4686",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [27, 61, 187, 213, 182, 31, 137, 81, 36, 194, 20, 151, 6, 26, 13, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0,
      offset: [2.5, -1.25],
    },
    kind: "native",
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0,
      offset: [2.5, -1.25],
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.5,
      offset: [0, 0],
    },
    kind: "native",
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.5,
      offset: [0, 0],
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [0.03125, -0.03125],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "da3a304cd7b468214197d223a82ffa05c0d1a0ecb7cf0e458066c63a03f161e4",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "1f621beb452e9edfe416ee8f280da8fd4651dbb21b3dd4ae0bb1237580524c33",
        2,
        [1],
        {
          amount: 1,
          offset: [0.0625, 0],
        },
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [0.03125, -0.03125],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ef1d9a0045b63ab06ccbef3f93cece1bc2e9de3048b4020e98d9f31b609256a0",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [27, 41, 199, 213, 201, 6, 152, 81, 34, 193, 9, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.7,
      offset: [2.5, -1.25],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "32b1ad3d44d2d9f47b7985fb88756de19a0044f4251f70279d6f9e19bdc92e91",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "1f621beb452e9edfe416ee8f280da8fd4651dbb21b3dd4ae0bb1237580524c33",
        2,
        [1],
        {
          amount: 0.7,
          offset: [2.5, -1.25],
        },
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.7,
      offset: [2.5, -1.25],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f8aff1f63890addf4eed531888a27848a1e1636d8e4b18d35be230dcd30cc4b8",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [7, 41, 60, 213, 60, 6, 43, 81, 10, 193, 2, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [-1000, 1000],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "fed9cdcb6dd9a3f97e213a64eef318d44c8051429cd8282d19a19d1ac76ae25f",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "1f621beb452e9edfe416ee8f280da8fd4651dbb21b3dd4ae0bb1237580524c33",
        2,
        [1],
        {
          amount: 1,
          offset: [-1000, 1000],
        },
      ],
    ],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [-1000, 1000],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "9f176123f1ca07d0c4f851588306f1390cb77f52096796d6a293892d5947ff61",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [0, 41, 0, 213, 0, 6, 0, 81, 0, 193, 0, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
] as const;
const limits = { pixels: 1048576, metadata: 2097152 };
const vignette = {
    amount: 1,
    center: [0.3, 0.7],
    radius: [2.5, 1.25],
    softness: 0.3,
    color: [0.9, 0.2, 0.7, 0.6],
  },
  chromatic = { amount: 0.7, offset: [2.5, -1.25] };
type Work = {
  offset?: number[];
  dimensions?: number[];
  neutral?: (value: number) => boolean;
  input?: object;
  output?: object;
  inputs?: object[];
  uniforms?: Record<string, number | readonly number[]>;
  shader?: string;
  managed?: boolean;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function run(
  h: ReturnType<typeof shadowHarness>,
  params: typeof vignette | typeof chromatic,
  id = "stylize.chromatic-aberration",
) {
  return stylizeEffectKernel(id)!.renderGpu(
    h.context as never,
    h.input as never,
    params as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 16 complete original stylize GPU/Canvas native traces and full published pixels in active/inactive routes", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        h = shadowHarness(),
        p = structuredClone(row.params),
        produce = async () => {
          const plugin = stylizeEffectKernel(row.id)!;
          if (row.gpu)
            plugin.renderGpu(h.context as never, h.input as never, p as never);
          else
            plugin.renderCanvas!(
              h.context as never,
              h.input as never,
              p as never,
            );
        };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(h.records).toEqual(row.records);
      expect(sha(h.records)).toBe(row.sha256);
      expect(p).toEqual(row.params);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
      empty(memory);
    }
});
it("rejects 16383-byte GPU header before offset/math/predicate/native factories while preserving original amount getter and neutral allocation behavior", async () => {
  for (const id of ["stylize.vignette", "stylize.chromatic-aberration"]) {
    const raw = id === "stylize.vignette" ? vignette : chromatic,
      memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = shadowHarness(),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      const round = vi.spyOn(Math, "round");
      expect(() => run(h, new Proxy(raw, { get }) as never, id)).toThrow(
        /metadata/,
      );
      expect(get.mock.calls.map((x) => x[1])).toEqual(["amount"]);
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toEqual([]);
      empty(memory);
    });
    memory.dispose();
  }
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve");
    run(shadowHarness(), { ...vignette, amount: 0 }, "stylize.vignette");
    expect(reserve).not.toHaveBeenCalled();
    run(shadowHarness(), { amount: 0, offset: [2.5, -1.25] });
    run(shadowHarness(), { amount: 0.5, offset: [0, 0] });
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 16384],
      ["metadata", 16384],
    ]);
    empty(memory);
  });
  memory.dispose();
});
it("holds actual offset/dimension/uniform/shader/input/native refs through original pass then clears actual owned arrays/records/refs with borrowed vectors intact", async () => {
  for (const id of ["stylize.vignette", "stylize.chromatic-aberration"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      raw = structuredClone(id === "stylize.vignette" ? vignette : chromatic),
      adopt = memory.adopt.bind(memory);
    let work: Work | undefined,
      vectors: number[][] = [],
      uniforms: object | undefined,
      inputs: object[] | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      const pass = h.context.pass;
      vi.spyOn(h.context, "pass").mockImplementation((...args) => {
        expect(memory.owns(work!)).toBe(true);
        expect(memory.statistics.current.metadata).toBe(16384);
        expect(work!.input).toBe(h.input);
        expect(work!.output).toBe(args[1]);
        expect(work!.inputs).toBe(args[2]);
        expect(work!.uniforms).toBe(args[3]);
        expect(work!.shader).toBe(args[0]);
        inputs = work!.inputs;
        uniforms = work!.uniforms;
        vectors =
          id === "stylize.vignette" ? [work!.dimensions!] : [work!.offset!];
        if (id === "stylize.vignette") {
          expect(work!.uniforms!.center).toBe((raw as typeof vignette).center);
          expect(work!.uniforms!.radius).toBe((raw as typeof vignette).radius);
          expect(work!.uniforms!.color).toBe((raw as typeof vignette).color);
        } else expect(work!.uniforms!.offset).toBe(work!.offset);
        return pass(...args);
      });
      run(h, raw, id);
      expect(work).toEqual({});
      for (const v of vectors) expect(v).toHaveLength(0);
      expect(inputs).toHaveLength(0);
      expect(uniforms).toEqual({});
      empty(memory);
    });
    expect(raw).toEqual(id === "stylize.vignette" ? vignette : chromatic);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("preserves early/mid original offset round null over secondary metadata cleanup and permits exact retry", async () => {
  for (const failAt of [1, 2]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let work: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
        return lease;
      });
      const round = Math.round;
      let calls = 0;
      vi.spyOn(Math, "round").mockImplementation((v) => {
        if (++calls === failAt) throw null;
        return round(v);
      });
      let failure: unknown = "unset";
      try {
        run(h, chromatic);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      expect(h.records).toEqual([]);
      empty(memory);
      vi.restoreAllMocks();
      run(h, chromatic);
      expect(h.records).toHaveLength(2);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears the actual offset after original every getter null before creating its predicate and permits retry", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    adopt = memory.adopt.bind(memory),
    descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "every")!;
  let work: Work | undefined,
    offset: number[] | undefined,
    predicate: unknown = "unset";
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      work = args[0] as Work;
      return adopt(...args);
    });
    Object.defineProperty(Array.prototype, "every", {
      configurable: descriptor.configurable!,
      enumerable: descriptor.enumerable!,
      get: function (this: number[]) {
        if (this === work?.offset) {
          offset = work.offset;
          predicate = work.neutral;
          throw null;
        }
        return descriptor.value;
      },
    });
    let failure: unknown = "unset";
    try {
      run(h, chromatic);
    } catch (error) {
      failure = error;
    } finally {
      Object.defineProperty(Array.prototype, "every", descriptor);
    }
    expect(failure).toBeNull();
    expect(predicate).toBeUndefined();
    expect(offset).toHaveLength(0);
    expect(work).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    run(h, chromatic);
    expect(h.records).toHaveLength(2);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual partially populated vignette uniform record/dimensions after borrowed color getter null and preserves first null over secondary cleanup", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let work: Work | undefined,
    uniforms: object | undefined,
    dimensions: number[] | undefined;
  const params = new Proxy(vignette, {
    get(t, k, r) {
      if (k === "color") {
        uniforms = work!.uniforms;
        dimensions = work!.dimensions;
        expect(uniforms).toEqual({
          amount: 1,
          dimensions: [2, 2],
          center: vignette.center,
          radius: vignette.radius,
          softness: 0.3,
        });
        throw null;
      }
      return Reflect.get(t, k, r);
    },
  });
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      work = args[0] as Work;
      return adopt(...args);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw Error("secondary cleanup");
      });
      return lease;
    });
    let failure: unknown = "unset";
    try {
      run(h, params, "stylize.vignette");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(uniforms).toEqual({});
    expect(dimensions).toHaveLength(0);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(1);
    empty(memory);
  });
  memory.dispose();
});
it("preserves native create/pass null over secondary control cleanup, clears actual refs and permits retry", async () => {
  for (const stage of ["create", "pass"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory);
    let work: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      if (stage === "create")
        vi.spyOn(h.context, "createSurface").mockImplementation(() => {
          throw null;
        });
      else
        vi.spyOn(h.context, "pass").mockImplementation(() => {
          throw null;
        });
      let failure: unknown = "unset";
      try {
        run(h, chromatic);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(shadowHarness(), chromatic);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual GPU work after header adoption null before offset/native factories and permits retry", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness();
  let actual: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value;
      throw null;
    });
    const round = vi.spyOn(Math, "round");
    let failure: unknown = "unset";
    try {
      run(h, chromatic);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual({});
    expect(round).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    run(h, chromatic);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual vectors/uniform/native refs after successful pass before propagating first cleanup null", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    reserve = memory.reserve.bind(memory),
    adopt = memory.adopt.bind(memory);
  let work: Work | undefined,
    offset: number[] | undefined,
    uniforms: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      work = args[0] as Work;
      return adopt(...args);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw null;
      });
      return lease;
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...args) => {
      offset = work!.offset;
      uniforms = work!.uniforms;
      return pass(...args);
    });
    let failure: unknown = "unset";
    try {
      run(h, chromatic);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toHaveLength(2);
    expect(offset).toHaveLength(0);
    expect(uniforms).toEqual({});
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
