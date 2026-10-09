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
  managed?: boolean;
  memory?: ManagedMemory;
  sampling?: { index?: (x: number, y: number) => number };
  offset?: number[];
  neutral?: (value: number) => boolean;
  input?: object;
  output?: object;
  image?: { data: Uint8ClampedArray };
  premultiplied?: Uint8Array;
  red?: number[];
  blue?: number[];
  rgbKeys?: number[];
  rgb?: number[];
  rgbProducer?: (channel: number) => number;
  color?: readonly number[];
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
  return stylizeEffectKernel(id)!.renderCanvas!(
    h.context as never,
    h.input as never,
    params as never,
  );
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let work: Work | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    if (args[1].bytes === 16384) work = args[0] as Work;
    return adopt(...args);
  });
  return () => work;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 16 complete original stylize GPU/Canvas native traces and full pixels with immediate selected callback retirement", async () => {
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
      empty(memory);
      memory.dispose();
    }
});
it("rejects exact Canvas header before original offset/math/neutral/readback factories and preserves allocation-free vignette and allocating chromatic neutrals", async () => {
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
    vi.restoreAllMocks();
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
it("holds actual views/red-blue/offset/native refs through publication and clears four actual RGB/key arrays and reused sampling controls without per-pixel leases", async () => {
  for (const id of ["stylize.vignette", "stylize.chromatic-aberration"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      raw = structuredClone(id === "stylize.vignette" ? vignette : chromatic),
      getWork = observe(memory);
    const rgbs: number[][] = [],
      keys: number[][] = [];
    let work: Work | undefined,
      image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      red: number[] | undefined,
      blue: number[] | undefined,
      offset: number[] | undefined,
      sampling: Work["sampling"],
      indexCalls = 0;
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        round = Math.round,
        floor = Math.floor;
      vi.spyOn(Math, "round").mockImplementation((v) => {
        const w = getWork();
        if (w?.rgb && !rgbs.includes(w.rgb)) {
          expect(memory.owns(w)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(16384);
          expect(w.rgbKeys).toEqual([0, 1, 2]);
          expect(typeof w.rgbProducer).toBe("function");
          rgbs.push(w.rgb);
          keys.push(w.rgbKeys!);
        }
        return round(v);
      });
      vi.spyOn(Math, "floor").mockImplementation((v) => {
        const w = getWork();
        if (w?.sampling?.index) {
          indexCalls++;
          expect(memory.owns(w)).toBe(true);
          expect(w.rgb).toHaveLength(3);
          expect(w.red).toHaveLength(4);
          expect(w.blue).toHaveLength(4);
        }
        return floor(v);
      });
      const create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
        const output = create(...args),
          put = output.ctx.putImageData;
        vi.spyOn(output.ctx, "putImageData").mockImplementation((...v) => {
          work = getWork();
          expect(memory.owns(work!)).toBe(true);
          expect(memory.statistics.current).toEqual({
            pixels: id === "stylize.vignette" ? 16 : 32,
            metadata: 16384,
          });
          expect(work!.input).toBe(h.input);
          expect(work!.output).toBe(output);
          expect(work!.image).toBe(v[0]);
          image = work!.image!.data;
          expect(memory.owns(image.buffer)).toBe(true);
          premult = work!.premultiplied;
          red = work!.red;
          blue = work!.blue;
          offset = work!.offset;
          sampling = work!.sampling;
          expect(work!.rgb).toBeUndefined();
          expect(work!.rgbKeys).toBeUndefined();
          expect(work!.rgbProducer).toBeUndefined();
          expect(sampling?.index).toBeUndefined();
          expect(red).toHaveLength(4);
          expect(blue).toHaveLength(4);
          if (premult) expect(memory.owns(premult.buffer)).toBe(true);
          if (id === "stylize.vignette")
            expect(work!.color).toBe((raw as typeof vignette).color);
          return put(...v);
        });
        return output;
      });
      run(h, raw, id);
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual(
        id === "stylize.vignette"
          ? [
              ["metadata", 16384],
              ["pixels", 16],
            ]
          : [
              ["metadata", 16384],
              ["pixels", 16],
              ["pixels", 16],
            ],
      );
      expect(rgbs).toHaveLength(4);
      expect(keys).toHaveLength(4);
      for (const value of [
        ...rgbs,
        ...keys,
        red!,
        blue!,
        ...(offset ? [offset] : []),
      ])
        expect(value).toHaveLength(0);
      expect(indexCalls > 0).toBe(id !== "stylize.vignette");
      expect(sampling).toEqual({});
      expect(image!.byteLength).toBe(0);
      if (premult) expect(premult.byteLength).toBe(0);
      expect(work).toEqual({});
      expect(h.records).toEqual(
        originals.find(
          (x) =>
            !x.gpu &&
            x.id === id &&
            JSON.stringify(x.params) === JSON.stringify(raw),
        )!.records,
      );
      empty(memory);
    });
    expect(raw).toEqual(id === "stylize.vignette" ? vignette : chromatic);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("keeps both original pixel quota cuts and retires every actual earlier view and callback owner", async () => {
  for (const quota of [15, 31]) {
    const memory = new ManagedMemory({ ...limits, pixels: quota }),
      h = shadowHarness(),
      getWork = observe(memory);
    let earlier: Uint8ClampedArray | undefined;
    await withManagedMemory(memory, async () => {
      const read = h.input.ctx.getImageData;
      vi.spyOn(h.input.ctx, "getImageData").mockImplementation(() => {
        const image = read();
        earlier = image.data;
        return image;
      });
      expect(() => run(h, chromatic)).toThrow(/pixels/);
      expect(h.records).toHaveLength(quota === 15 ? 0 : 1);
      expect(getWork()).toEqual({});
      if (earlier) expect(earlier.byteLength).toBe(0);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual unreturned premultiply view before early/mid loops and retires both backings despite first release null", async () => {
  for (const failAt of [3, 8]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory);
    let first: Uint8ClampedArray | undefined,
      second: Uint8Array | undefined,
      offset: number[] | undefined,
      visits = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        release(v);
        if (++visits === 1) throw Error("secondary pixels cleanup");
      });
      const round = Math.round;
      let calls = 0;
      vi.spyOn(Math, "round").mockImplementation((v) => {
        if (++calls === failAt) {
          const work = getWork()!;
          expect(memory.owns(work)).toBe(true);
          expect(memory.statistics.current).toEqual({
            pixels: 32,
            metadata: 16384,
          });
          first = work.image!.data;
          second = work.premultiplied;
          offset = work.offset;
          throw null;
        }
        return round(v);
      });
      let failure: unknown = "unset";
      try {
        run(h, chromatic);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(first!.byteLength).toBe(0);
      expect(second!.byteLength).toBe(0);
      expect(offset).toHaveLength(0);
      expect(visits).toBe(2);
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, chromatic);
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual partial RGB keys/function/completed samples after native map getter, channel callback, color getter or sampling null and permits retry", async () => {
  for (const cut of ["map-getter", "channel", "color", "sampling"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory),
      descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "map")!;
    let first: Uint8ClampedArray | undefined,
      second: Uint8Array | undefined,
      keys: number[] | undefined,
      rgb: number[] | undefined,
      red: number[] | undefined,
      blue: number[] | undefined,
      sampling: Work["sampling"],
      visits = 0;
    const capture = () => {
      const work = getWork()!;
      expect(memory.owns(work)).toBe(true);
      first = work.image!.data;
      second = work.premultiplied;
      keys = work.rgbKeys;
      rgb = work.rgb;
      red = work.red;
      blue = work.blue;
      sampling = work.sampling;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        release(v);
        if (++visits === 1) throw Error("secondary pixels cleanup");
      });
      let params: typeof chromatic = chromatic;
      if (cut === "map-getter")
        Object.defineProperty(Array.prototype, "map", {
          configurable: descriptor.configurable!,
          enumerable: descriptor.enumerable!,
          get: function (this: number[]) {
            if (this === getWork()?.rgbKeys) {
              expect(getWork()!.rgbProducer).toBeUndefined();
              return capture();
            }
            return descriptor.value;
          },
        });
      if (cut === "channel") {
        const round = Math.round;
        vi.spyOn(Math, "round").mockImplementation((v) => {
          const work = getWork();
          if (work?.rgbKeys && !work.rgb) {
            expect(typeof work.rgbProducer).toBe("function");
            return capture();
          }
          return round(v);
        });
      }
      if (cut === "color")
        params = Object.defineProperty({ ...chromatic }, "color", {
          get: capture,
        });
      if (cut === "sampling") {
        const floor = Math.floor;
        vi.spyOn(Math, "floor").mockImplementation((v) => {
          if (getWork()?.sampling?.index) return capture();
          return floor(v);
        });
      }
      let failure: unknown = "unset";
      try {
        run(h, params);
      } catch (error) {
        failure = error;
      } finally {
        Object.defineProperty(Array.prototype, "map", descriptor);
      }
      expect(failure).toBeNull();
      expect(first!.byteLength).toBe(0);
      expect(second!.byteLength).toBe(0);
      for (const value of [keys, rgb, red, blue])
        if (value) expect(value).toHaveLength(0);
      expect(sampling).toEqual({});
      expect(visits).toBe(2);
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, chromatic);
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires actual earlier views on native read/create/publication null preserving first null over secondary cleanup and retry", async () => {
  for (const cut of ["read", "create", "put"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      reserve = memory.reserve.bind(memory);
    let first: Uint8ClampedArray | undefined, second: Uint8Array | undefined;
    const fail = () => {
      const work = getWork()!;
      first = work.image?.data;
      second = work.premultiplied;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args);
        if (args[0] === "metadata") {
          const release = lease.release.bind(lease);
          vi.spyOn(lease, "release").mockImplementation(() => {
            release();
            throw Error("secondary metadata cleanup");
          });
        }
        return lease;
      });
      if (cut === "read")
        vi.spyOn(h.input.ctx, "getImageData").mockImplementation(fail);
      else {
        const create = h.context.createSurface;
        vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
          if (cut === "create") return fail();
          const output = create(...args);
          vi.spyOn(output.ctx, "putImageData").mockImplementation(fail);
          return output;
        });
      }
      let failure: unknown = "unset";
      try {
        run(h, chromatic);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (first) expect(first.byteLength).toBe(0);
      if (second) expect(second.byteLength).toBe(0);
      expect(getWork()).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      const next = shadowHarness();
      run(next, chromatic);
      expect(next.records).toHaveLength(3);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual Canvas header and sampling record after metadata adoption null before offset/readback/native factories", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    adopt = memory.adopt.bind(memory);
  let work: Work | undefined, sampling: Work["sampling"];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      work = args[0] as Work;
      sampling = work.sampling;
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
    expect(work).toEqual({});
    expect(sampling).toEqual({});
    expect(round).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    vi.spyOn(memory, "adopt").mockImplementation(adopt);
    run(h, chromatic);
    expect(h.records).toHaveLength(3);
    empty(memory);
  });
  memory.dispose();
});
it("detaches actual captured premultiply backing after pixel adoption null before loops even with secondary metadata release failure", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let work: Work | undefined,
    first: Uint8ClampedArray | undefined,
    second: Uint8Array | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args);
      if (args[0] === "metadata") {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
      }
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (args[1].bytes === 16384) work = args[0] as Work;
      else if (args[0] === work?.premultiplied?.buffer) {
        first = work.image!.data;
        second = work.premultiplied;
        expect(memory.statistics.current).toEqual({
          pixels: 32,
          metadata: 16384,
        });
        throw null;
      }
      return adopt(...args);
    });
    const round = vi.spyOn(Math, "round");
    let failure: unknown = "unset";
    try {
      run(h, chromatic);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(first!.byteLength).toBe(0);
    expect(second!.byteLength).toBe(0);
    expect(round).toHaveBeenCalledTimes(2);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(1);
    empty(memory);
    vi.restoreAllMocks();
    run(h, chromatic);
    expect(h.records).toHaveLength(4);
    empty(memory);
  });
  memory.dispose();
});
it("propagates successful publication cleanup null only after every actual backing and metadata reference retires", async () => {
  for (const id of ["stylize.vignette", "stylize.chromatic-aberration"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory);
    let first: Uint8ClampedArray | undefined,
      second: Uint8Array | undefined,
      red: number[] | undefined,
      blue: number[] | undefined,
      visits = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        const work = getWork()!;
        first = work.image!.data;
        second = work.premultiplied;
        red = work.red;
        blue = work.blue;
        release(v);
        if (++visits === 1) throw null;
      });
      let failure: unknown = "unset";
      try {
        run(h, id === "stylize.vignette" ? vignette : chromatic, id);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(visits).toBe(id === "stylize.vignette" ? 1 : 2);
      expect(first!.byteLength).toBe(0);
      if (second) expect(second.byteLength).toBe(0);
      expect(red).toHaveLength(0);
      expect(blue).toHaveLength(0);
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(3);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("clears actual neutral offset after original every getter null before predicate creation and original early/mid offset math null", async () => {
  for (const cut of ["every", 1, 2] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "every")!;
    let offset: number[] | undefined;
    await withManagedMemory(memory, async () => {
      if (cut === "every")
        Object.defineProperty(Array.prototype, "every", {
          configurable: descriptor.configurable!,
          enumerable: descriptor.enumerable!,
          get: function (this: number[]) {
            if (this === getWork()?.offset) {
              offset = getWork()!.offset;
              expect(getWork()!.neutral).toBeUndefined();
              throw null;
            }
            return descriptor.value;
          },
        });
      else {
        const round = Math.round;
        let calls = 0;
        vi.spyOn(Math, "round").mockImplementation((v) => {
          if (++calls === cut) throw null;
          return round(v);
        });
      }
      let failure: unknown = "unset";
      try {
        run(h, chromatic);
      } catch (error) {
        failure = error;
      } finally {
        Object.defineProperty(Array.prototype, "every", descriptor);
      }
      expect(failure).toBeNull();
      if (offset) expect(offset).toHaveLength(0);
      expect(getWork()).toEqual({});
      expect(h.records).toEqual([]);
      empty(memory);
      vi.restoreAllMocks();
      run(h, chromatic);
      expect(h.records).toHaveLength(3);
      empty(memory);
    });
    memory.dispose();
  }
});
it("drops actual metadata refs after both native backing detachments throw secondary errors following premultiply adoption null", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    adopt = memory.adopt.bind(memory);
  const backingPrototype = ArrayBuffer.prototype as ArrayBuffer & {
    transfer(bytes?: number): ArrayBuffer;
  };
  const transfer = backingPrototype.transfer;
  let work: Work | undefined,
    image: Uint8ClampedArray | undefined,
    premultiplied: Uint8Array | undefined,
    offset: number[] | undefined,
    transfers = 0;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (args[1].bytes === 16384) work = args[0] as Work;
      else if (args[0] === work?.premultiplied?.buffer) {
        image = work.image!.data;
        premultiplied = work.premultiplied;
        offset = work.offset;
        throw null;
      }
      return adopt(...args);
    });
    vi.spyOn(backingPrototype, "transfer").mockImplementation(function (
      this: ArrayBuffer,
      bytes?: number,
    ) {
      transfer.call(this, bytes);
      transfers++;
      throw Error("secondary native detachment cleanup");
    });
    let failure: unknown = "unset";
    try {
      run(h, chromatic);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(transfers).toBe(2);
    expect(image!.byteLength).toBe(0);
    expect(premultiplied!.byteLength).toBe(0);
    expect(offset).toHaveLength(0);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(1);
    empty(memory);
    vi.restoreAllMocks();
    run(h, chromatic);
    expect(h.records).toHaveLength(4);
    empty(memory);
  });
  memory.dispose();
});
