import { afterEach, expect, it, vi } from "vitest";
import { sampledBlurKernel } from "../../packages/renderer-core/src/composition/render/sampled-blur.ts";
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
    kind: "native",
    id: "blur.radial",
    params: {
      angle: 0,
      samples: 2,
      center: [0.3, 0.7],
    },
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
    kind: "native",
    id: "blur.radial",
    params: {
      angle: 37,
      samples: 2,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "7f98ff6f79f0411425d34acf18e3f904a00ca145afedeadaa03c5bfe0a8d6132",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [
          37, 42, 190, 158, 124, 22, 168, 70, 33, 187, 17, 153, 134, 73, 109,
          21,
        ],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.radial",
    params: {
      angle: 37,
      samples: 8,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "c456d0c9206508d4a81f6071338a576522febd7382a7216d1bfa2a64f3997ee5",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [28, 41, 196, 180, 156, 17, 156, 75, 34, 184, 19, 150, 128, 80, 96, 16],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.radial",
    params: {
      angle: 180,
      samples: 64,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "88fdaa5cbdb050185b9e9dc919a05e711368b08110ea9a4c335aee877f56e933",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [52, 49, 173, 99, 83, 28, 181, 55, 34, 179, 27, 144, 73, 68, 141, 56],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.zoom",
    params: {
      amount: 0,
      samples: 2,
      center: [0.3, 0.7],
    },
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
    kind: "native",
    id: "blur.zoom",
    params: {
      amount: 0.5,
      samples: 2,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "ea199ad967ca9a876871327c69f58a7da2dfeec605e40e65ab413a2362543a71",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [24, 57, 179, 179, 140, 29, 147, 71, 34, 193, 8, 151, 40, 201, 13, 19],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.zoom",
    params: {
      amount: 0.5,
      samples: 8,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "00a143038bcd186fcac8cbeed08ee290631fd42de31461e103697d33d4cbdb83",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 47, 190, 189, 166, 17, 149, 77, 34, 188, 15, 149, 55, 164, 36, 14],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.zoom",
    params: {
      amount: 1,
      samples: 64,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "2a2505ea1eb27b61717e46ca158bcde373c56136c45eff83dc90bfe38e3c3560",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [24, 55, 183, 173, 143, 27, 146, 75, 33, 186, 17, 147, 46, 162, 35, 22],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.lens",
    params: {
      radius: 0,
      samples: 2,
      center: [0.3, 0.7],
    },
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
    kind: "native",
    id: "blur.lens",
    params: {
      radius: 3.7,
      samples: 2,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "0acec3a088df63f821377a62e99416917a1f49716952e77c43bb406d956ca2e4",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [204, 0, 153, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    kind: "native",
    id: "blur.lens",
    params: {
      radius: 3.7,
      samples: 8,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "3ea83ef5cfbc6b7abb424e81aceb2c0060af0fb063ee62d440d3e547431e1245",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [185, 23, 162, 11, 34, 187, 17, 15, 0, 255, 0, 1, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    kind: "native",
    id: "blur.lens",
    params: {
      radius: 1000,
      samples: 64,
      center: [0.3, 0.7],
    },
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
];
const limits = { pixels: 1048576, metadata: 1048576 },
  params = { radius: 3.7, samples: 8, center: [0.3, 0.7] };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
type Work = {
  transformWork: {
    taps: number[][];
    transforms?: number[][];
    shape?: object;
    transformProducer?: unknown;
  };
  sampling: { index?: unknown };
  image?: { data: Uint8ClampedArray };
  premultiplied?: Uint8Array;
  sample?: number[];
  sums?: number[];
  bytes?: number[];
  normalizeProducer?: unknown;
  input?: object;
  output?: object;
};
function owner(memory: ManagedMemory): Work | undefined {
  const resources = (
    memory as unknown as { resources: Map<object, { value: object }> }
  ).resources;
  return [...resources.values()]
    .map((x) => x.value)
    .find(
      (x) => Object.hasOwn(x, "transformWork") && Object.hasOwn(x, "sampling"),
    ) as Work | undefined;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 12 whole original sampled-blur Canvas traces and exact published pixels in active/inactive routes with no residual owners", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      run = async () => {
        for (const x of originals) {
          const h = shadowHarness(),
            plugin = sampledBlurKernel(x.id)!;
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
it("rejects actual Canvas work before original tap/math/readback/pixel/native factories including neutral transforms", async () => {
  for (const radius of [0, 3.7]) {
    const memory = new ManagedMemory({ ...limits, metadata: 65535 }),
      h = shadowHarness(),
      plugin = sampledBlurKernel("blur.lens")!;
    await withManagedMemory(memory, async () => {
      const sqrt = vi.spyOn(Math, "sqrt"),
        from = vi.spyOn(Array, "from");
      expect(() =>
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          { ...params, radius } as never,
        ),
      ).toThrow(/metadata/);
      expect(sqrt).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("holds actual image/view/backing/tap/sample/native refs through publication then clears owned arrays and detaches both stores while borrowed input/params stay intact", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  let work: Work | undefined,
    image: Uint8ClampedArray | undefined,
    premultiplied: Uint8Array | undefined,
    sample: number[] | undefined,
    taps: number[][] | undefined,
    firstTap: number[] | undefined,
    shape: object | undefined;
  const create = h.context.createSurface;
  await withManagedMemory(memory, async () => {
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      const output = create(...args),
        put = output.ctx.putImageData;
      vi.spyOn(output.ctx, "putImageData").mockImplementation((...parts) => {
        work = owner(memory)!;
        expect(memory.owns(work)).toBe(true);
        expect(memory.statistics.current).toEqual({
          pixels: 32,
          metadata: 65536,
        });
        image = work.image!.data;
        premultiplied = work.premultiplied;
        sample = work.sample;
        taps = work.transformWork.transforms;
        firstTap = taps![0];
        shape = work.transformWork.shape;
        expect(work.input).toBe(h.input);
        expect(work.output).toBe(output);
        expect(parts[0]).toBe(work.image);
        expect(taps).toHaveLength(8);
        expect(work.sampling.index).toBeUndefined();
        expect(work.sums).toBeUndefined();
        expect(work.bytes).toBeUndefined();
        expect(work.normalizeProducer).toBeUndefined();
        expect(memory.owns(image.buffer)).toBe(true);
        expect(memory.owns(premultiplied!.buffer)).toBe(true);
        return put(...parts);
      });
      return output;
    });
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    empty(memory);
  });
  expect(image!.byteLength).toBe(0);
  expect(premultiplied!.byteLength).toBe(0);
  for (const value of [sample, taps, firstTap]) expect(value).toHaveLength(0);
  expect(shape).toEqual({});
  expect(work).toEqual({});
  expect(h.input).toHaveProperty("width", 2);
  expect(params.center).toEqual([0.3, 0.7]);
  memory.dispose();
});
it("reuses actual index/sums/map controls under one render owner with two original pixel admissions and no per-pixel lease", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      floor = Math.floor;
    let closures = 0,
      normalizations = 0;
    const actualSums: number[][] = [];
    vi.spyOn(Math, "floor").mockImplementation((value) => {
      const work = owner(memory);
      if (work?.sampling.index) {
        closures++;
        expect(typeof work.sampling.index).toBe("function");
      }
      if (work?.normalizeProducer) {
        normalizations++;
        if (work.sums && !actualSums.includes(work.sums))
          actualSums.push(work.sums);
      }
      return floor(value);
    });
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    expect(closures).toBeGreaterThan(0);
    expect(normalizations).toBe(16);
    expect(actualSums).toHaveLength(4);
    for (const value of actualSums) expect(value).toHaveLength(0);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 65536],
      ["pixels", 16],
      ["pixels", 16],
    ]);
    empty(memory);
  });
  memory.dispose();
});
it("keeps original readback/premultiplied pixel quotas before factories and detaches an earlier actual readback on the second quota cut", async () => {
  for (const pixels of [15, 31]) {
    const memory = new ManagedMemory({ ...limits, pixels }),
      h = shadowHarness(),
      plugin = sampledBlurKernel("blur.lens")!;
    let image: Uint8ClampedArray | undefined;
    const read = h.input.ctx.getImageData;
    vi.spyOn(h.input.ctx, "getImageData").mockImplementation(() => {
      const result = read();
      image = result.data;
      return result;
    });
    await withManagedMemory(memory, async () => {
      expect(() =>
        plugin.renderCanvas!(
          h.context as never,
          h.input as never,
          params as never,
        ),
      ).toThrow(/pixels/);
      expect(h.records).toHaveLength(pixels === 15 ? 0 : 1);
      if (image) expect(image.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("cleans both actual stores and transform arrays when original premultiplication throws null before sampling then retries", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  let work: Work | undefined,
    first: Uint8ClampedArray | undefined,
    second: Uint8Array | undefined,
    tap: number[] | undefined;
  await withManagedMemory(memory, async () => {
    const round = Math.round;
    vi.spyOn(Math, "round").mockImplementation((value) => {
      const current = owner(memory);
      if (current?.premultiplied) {
        work = current;
        first = current.image!.data;
        second = current.premultiplied;
        tap = current.transformWork.taps[0];
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
    expect(first!.byteLength).toBe(0);
    expect(second!.byteLength).toBe(0);
    expect(tap).toHaveLength(0);
    expect(work).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    empty(memory);
  });
  memory.dispose();
});
it("cleans actual sampling index/sums/view refs on sampling or normalization math null and preserves null over secondary first backing retirement error", async () => {
  for (const normalize of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = sampledBlurKernel("blur.lens")!;
    let work: Work | undefined, sums: number[] | undefined;
    const stores: ArrayBufferLike[] = [];
    await withManagedMemory(memory, async () => {
      const release = memory.release.bind(memory);
      vi.spyOn(memory, "release").mockImplementation((value) => {
        if (value instanceof ArrayBuffer) stores.push(value);
        release(value);
        if (stores.length === 1)
          throw Error("secondary first backing retirement");
      });
      const floor = Math.floor;
      vi.spyOn(Math, "floor").mockImplementation((value) => {
        const current = owner(memory);
        if (
          current &&
          (normalize ? current.normalizeProducer : current.sampling.index)
        ) {
          work = current;
          sums = current.sums;
          throw null;
        }
        return floor(value);
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
      expect(stores).toHaveLength(2);
      for (const store of stores) expect(store.byteLength).toBe(0);
      expect(sums).toHaveLength(0);
      expect(work).toEqual({});
      empty(memory);
    });
    memory.dispose();
  }
});
it("cleans original normalized map producer null and all actual stores before retry", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  await withManagedMemory(memory, async () => {
    vi.spyOn(Array.prototype, "map").mockImplementationOnce(() => {
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
    expect(h.records).toHaveLength(1);
    empty(memory);
    vi.restoreAllMocks();
    plugin.renderCanvas!(h.context as never, h.input as never, params as never);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual phase and partial tap refs on readback null without entering pixel factories", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  let work: Work | undefined, tap: number[] | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(h.input.ctx, "getImageData").mockImplementationOnce(() => {
      work = owner(memory);
      tap = work!.transformWork.taps[0];
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
    expect(tap).toHaveLength(0);
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
it("retires both actual stores and refs after native create/publication null and permits retry", async () => {
  for (const publish of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = sampledBlurKernel("blur.lens")!;
    let work: Work | undefined;
    const stores: ArrayBufferLike[] = [];
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
      expect(stores).toHaveLength(2);
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
it("visits both actual backing retirements and clears metadata after first successful-publication cleanup null", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  const stores: ArrayBufferLike[] = [];
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
    expect(stores).toHaveLength(2);
    for (const store of stores) expect(store.byteLength).toBe(0);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(3);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual nested transform/sampling controls when phase adoption throws null before native/math factories", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = sampledBlurKernel("blur.lens")!;
  let work: Work | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      work = value as Work;
      throw null;
    });
    const sqrt = vi.spyOn(Math, "sqrt");
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
    expect(sqrt).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
