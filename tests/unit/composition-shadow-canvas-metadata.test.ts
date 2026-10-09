import { afterEach, expect, it, vi } from "vitest";
import {
  shadowEffectKernel,
  shadowCompositePixel,
} from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
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
export const params = {
  blur: 1.7,
  offset: [1.3, -0.9],
  color: [0.7, 0.2, 0.1, 0.6],
  opacity: 0.8,
};

const originalNative = [
  {
    id: "light.drop-shadow",
    gpu: true,
    calls: 8,
    sha256: "bd687a1c69020d8d0e2dc732fc74e9c47cb17772f6fc965c2f8c839860307286",
  },
  {
    id: "light.drop-shadow",
    gpu: false,
    calls: 3,
    sha256: "6c05fe4a327b2ea0e52ef097cf984c6a55f9244dc2d7d1e9ce642507c2436e8d",
  },
  {
    id: "light.inner-shadow",
    gpu: true,
    calls: 8,
    sha256: "ccf5f618d0b713a71bce8203824682fa5e6f70870425a05cee36637329323f7b",
  },
  {
    id: "light.inner-shadow",
    gpu: false,
    calls: 3,
    sha256: "d7f15fbbe883ffad954af776ca9e6ad0448104c3a70b2acca3f4aacf58e95cfa",
  },
] as const;

const originalPixels = [
  {
    inner: false,
    src: [255, 0, 0, 255],
    mask: 0,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: false,
    src: [255, 0, 0, 255],
    mask: 1,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: false,
    src: [255, 0, 0, 255],
    mask: 128,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: false,
    src: [255, 0, 0, 255],
    mask: 255,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: false,
    src: [0, 0, 0, 0],
    mask: 0,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: false,
    src: [0, 0, 0, 0],
    mask: 1,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: false,
    src: [0, 0, 0, 0],
    mask: 128,
    result: [43, 12, 6, 61],
    sha256: "bb0f33e49aa9618da78d109bc643c01bd05086f2848863b673ff6cf3c43b710c",
  },
  {
    inner: false,
    src: [0, 0, 0, 0],
    mask: 255,
    result: [85, 24, 12, 122],
    sha256: "8b7a41776d32007d6bf5fcc784aa57673ec832ce2dbe3a24431081c1ad72c2c8",
  },
  {
    inner: false,
    src: [128, 33, 67, 128],
    mask: 0,
    result: [128, 33, 67, 128],
    sha256: "2c2869241c3c3a2731beb1837b38d204864c677f58c553bb230b0a9b680b5141",
  },
  {
    inner: false,
    src: [128, 33, 67, 128],
    mask: 1,
    result: [128, 33, 67, 128],
    sha256: "2c2869241c3c3a2731beb1837b38d204864c677f58c553bb230b0a9b680b5141",
  },
  {
    inner: false,
    src: [128, 33, 67, 128],
    mask: 128,
    result: [149, 39, 70, 158],
    sha256: "4f86bd2632febc50ae750db9d608b032bb18517b2edcd28fa3baa912caca014a",
  },
  {
    inner: false,
    src: [128, 33, 67, 128],
    mask: 255,
    result: [170, 45, 73, 189],
    sha256: "97422e5318fc1352a3e4f941f3ff78a9a76201ad1f24dca8eaabddeb38d1fa19",
  },
  {
    inner: false,
    src: [7, 35, 0, 51],
    mask: 0,
    result: [7, 35, 0, 51],
    sha256: "d777e3a12dd470ed95d9dfb0d0e9b4450c6b009acdd9fb50df8fefed4dc29ccb",
  },
  {
    inner: false,
    src: [7, 35, 0, 51],
    mask: 1,
    result: [7, 35, 0, 51],
    sha256: "d777e3a12dd470ed95d9dfb0d0e9b4450c6b009acdd9fb50df8fefed4dc29ccb",
  },
  {
    inner: false,
    src: [7, 35, 0, 51],
    mask: 128,
    result: [41, 45, 5, 100],
    sha256: "6d1fc7a4dbd3a16caf9ee9c4a36f4821c4e28704b7bedbb3cbcef99afcdb2e8c",
  },
  {
    inner: false,
    src: [7, 35, 0, 51],
    mask: 255,
    result: [75, 54, 10, 149],
    sha256: "22242181867c7400b904b570bb198847bf5c7880e61582d3829744fd7cccba99",
  },
  {
    inner: true,
    src: [255, 0, 0, 255],
    mask: 0,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: true,
    src: [255, 0, 0, 255],
    mask: 1,
    result: [255, 0, 0, 255],
    sha256: "b2bf6ace4430f464bfbfa921e1c40fe7159150fbf7c9cc61815bbff535f3888c",
  },
  {
    inner: true,
    src: [255, 0, 0, 255],
    mask: 128,
    result: [237, 12, 6, 255],
    sha256: "a44873c96a2a6b3200aa0bab5cf6b9ccddcbf093921a659ee49e7c999b47e99b",
  },
  {
    inner: true,
    src: [255, 0, 0, 255],
    mask: 255,
    result: [218, 24, 12, 255],
    sha256: "94f7909aa80dddc15bc5009404a94a6cd5ab6786c3508a1bfc4d1b4181237b88",
  },
  {
    inner: true,
    src: [0, 0, 0, 0],
    mask: 0,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: true,
    src: [0, 0, 0, 0],
    mask: 1,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: true,
    src: [0, 0, 0, 0],
    mask: 128,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: true,
    src: [0, 0, 0, 0],
    mask: 255,
    result: [0, 0, 0, 0],
    sha256: "1c10b03518fff8fc374a20bbf5107c66496656bec0662d6c6db123d4a898f121",
  },
  {
    inner: true,
    src: [128, 33, 67, 128],
    mask: 0,
    result: [128, 33, 67, 128],
    sha256: "2c2869241c3c3a2731beb1837b38d204864c677f58c553bb230b0a9b680b5141",
  },
  {
    inner: true,
    src: [128, 33, 67, 128],
    mask: 1,
    result: [128, 33, 67, 128],
    sha256: "2c2869241c3c3a2731beb1837b38d204864c677f58c553bb230b0a9b680b5141",
  },
  {
    inner: true,
    src: [128, 33, 67, 128],
    mask: 128,
    result: [119, 31, 54, 128],
    sha256: "9249e6cca52ed4bcef45092dbfb4b11a038c365d64d0b81e0cce6a138b616766",
  },
  {
    inner: true,
    src: [128, 33, 67, 128],
    mask: 255,
    result: [109, 30, 41, 128],
    sha256: "5c806ec9ecdd4c3947c27420f89371f92fadb4dceab71075bef80554cfe6f1e4",
  },
  {
    inner: true,
    src: [7, 35, 0, 51],
    mask: 0,
    result: [7, 35, 0, 51],
    sha256: "d777e3a12dd470ed95d9dfb0d0e9b4450c6b009acdd9fb50df8fefed4dc29ccb",
  },
  {
    inner: true,
    src: [7, 35, 0, 51],
    mask: 1,
    result: [7, 35, 0, 51],
    sha256: "d777e3a12dd470ed95d9dfb0d0e9b4450c6b009acdd9fb50df8fefed4dc29ccb",
  },
  {
    inner: true,
    src: [7, 35, 0, 51],
    mask: 128,
    result: [14, 29, 1, 51],
    sha256: "66780b73d6188a504164b318903ccb93b4240f95467ebc55f770c1f9789e3f98",
  },
  {
    inner: true,
    src: [7, 35, 0, 51],
    mask: 255,
    result: [21, 23, 2, 51],
    sha256: "ed5c82946f10cb22fcdb60d9642c53cc908267b2d4d7cde44c5df4757b7aa42c",
  },
] as const;
const limits = { pixels: 1024 * 1024, metadata: 65536 };
type Work = {
  memory?: ManagedMemory;
  image?: ImageData;
  premultiplied?: Uint8Array;
  mask?: Uint8Array;
  horizontal?: Uint8Array;
  blurred?: Uint8Array;
  offset?: number[];
  sample?: number[];
  directions?: number[][];
  view?: Uint8Array;
  kernel?: object;
  output?: object;
  composite: { channels?: number[]; mapped?: number[]; output?: number[] };
  sampling: { index?: (x: number, y: number) => number };
  blurControls: [{ value?: Uint8Array }, { value?: Uint8Array }];
};
function owner(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as { resources: Map<object, { value: object }> }
    ).resources.values(),
  ].find((x) => "composite" in x.value)?.value as Work;
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function render(
  h: ReturnType<typeof shadowHarness>,
  id = "light.drop-shadow",
  p = params,
) {
  return shadowEffectKernel(id)!.renderCanvas!(
    h.context as never,
    h.input as never,
    p as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves both complete original Canvas inner/drop-shadow readback/publication traces and all output bytes", async () => {
  for (const original of originalNative.filter((x) => !x.gpu)) {
    for (const active of [false, true]) {
      const memory = new ManagedMemory(limits);
      const run = async () => {
        const h = shadowHarness();
        render(h, original.id);
        expect(h.records).toHaveLength(original.calls);
        expect(sha(h.records)).toBe(original.sha256);
        empty(memory);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      memory.dispose();
    }
  }
});
it("preserves 32 complete original independent opaque/transparent/translucent composite results", () => {
  for (const x of originalPixels) {
    const result = shadowCompositePixel(x.inner, x.src, x.mask, params);
    expect(result).toEqual(x.result);
    expect(sha(result)).toBe(x.sha256);
  }
});
it("rejects actual Canvas view/vector/per-pixel/control factories before original readback", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 8191 });
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    expect(() => render(h)).toThrow(/metadata/);
    expect(h.records).toEqual([]);
    empty(memory);
  });
  memory.dispose();
});
it("preserves original opacity/alpha no-op guards before readback or arena", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1 });
  await withManagedMemory(memory, async () => {
    for (const p of [
      { ...params, opacity: 0 },
      { ...params, color: [0.7, 0.2, 0.1, 0] },
    ]) {
      const h = shadowHarness();
      expect(render(h, "light.drop-shadow", p)).toBe(h.input);
      expect(h.records).toEqual([]);
      empty(memory);
    }
  });
  memory.dispose();
});
it("owns actual readback/backing/view/offset/sample/blur direction refs through original publication then clears/detaches all owned values", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const create = h.context.createSurface;
    let work: Work | undefined,
      stores: Uint8Array[] = [];
    let image: ImageData | undefined,
      offset: number[] | undefined,
      sample: number[] | undefined,
      directions: number[][] | undefined;
    vi.spyOn(h.context, "createSurface").mockImplementation((w, h) => {
      work = owner(memory);
      expect(memory.owns(work)).toBe(true);
      image = work.image;
      offset = work.offset;
      sample = work.sample;
      directions = work.directions;
      stores = [
        work.premultiplied!,
        work.mask!,
        work.horizontal!,
        work.blurred!,
      ];
      for (const v of stores) expect(memory.owns(v.buffer)).toBe(true);
      expect(memory.owns(image!.data.buffer)).toBe(true);
      expect(work.view).toBeUndefined();
      expect(work.composite.output).toBeUndefined();
      expect(work.sampling.index).toBeUndefined();
      return create(w, h);
    });
    render(h);
    for (const v of stores) expect(v.byteLength).toBe(0);
    expect(image!.data.byteLength).toBe(0);
    expect(offset).toHaveLength(0);
    expect(sample).toHaveLength(0);
    for (const v of directions!) expect(v).toHaveLength(0);
    expect(work!.kernel).toBeUndefined();
    expect(work!.image).toBeUndefined();
    expect(work!.memory).toBeUndefined();
    expect(work!.blurControls.map((x) => x.value)).toEqual([
      undefined,
      undefined,
    ]);
    expect(params.offset).toEqual([1.3, -0.9]);
    expect(params.color).toEqual([0.7, 0.2, 0.1, 0.6]);
    empty(memory);
  });
  memory.dispose();
});
it("captures actual per-pixel index closure and composite arrays/views under one reused arena then clears them after each consumer", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const floor = Math.floor,
      round = Math.round;
    let sampling = 0,
      composite = 0;
    const arrays: number[][] = [];
    vi.spyOn(Math, "floor").mockImplementation((v) => {
      const work = owner(memory);
      if (work?.sampling.index) {
        sampling++;
        expect(memory.owns(work)).toBe(true);
        expect(typeof work.sampling.index).toBe("function");
      }
      return floor(v);
    });
    vi.spyOn(Math, "round").mockImplementation((v) => {
      const work = owner(memory);
      if (work?.view && work.composite.channels) {
        composite++;
        arrays.push(work.composite.channels);
        if (work.composite.mapped) arrays.push(work.composite.mapped);
        if (work.composite.output) arrays.push(work.composite.output);
        expect(memory.owns(work)).toBe(true);
        expect(work.view.byteLength).toBe(4);
      }
      return round(v);
    });
    render(h, "light.inner-shadow");
    expect(sampling).toBeGreaterThan(0);
    expect(composite).toBeGreaterThan(0);
    for (const array of arrays) expect(array).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("preserves original readback null and clears admitted Canvas work then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    vi.spyOn(h.input.ctx, "getImageData").mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      render(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    empty(memory);
    render(h);
    empty(memory);
  });
  memory.dispose();
});
it("retires each pixel admission failure after partial readback/premultiplication/mask/blur production", async () => {
  for (const pixels of [15, 31, 35, 39, 43]) {
    const memory = new ManagedMemory({ ...limits, pixels });
    await withManagedMemory(memory, async () => {
      const h = shadowHarness();
      expect(() => render(h)).toThrow(/pixels/);
      empty(memory);
    });
    memory.dispose();
  }
});
it("cleans actual sampling closure and pixel stores when Math.floor throws null during offset resampling", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const floor = Math.floor;
    vi.spyOn(Math, "floor").mockImplementation((v) => {
      if (owner(memory)?.sampling.index) throw null;
      return floor(v);
    });
    let failure: unknown = "unset";
    try {
      render(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    empty(memory);
    vi.restoreAllMocks();
    render(h);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual unreturned horizontal/vertical blur backings after mid-producer Math.floor null and then retries", async () => {
  for (const horizontal of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = shadowHarness();
      const floor = Math.floor;
      vi.spyOn(Math, "floor").mockImplementation((v) => {
        const work = owner(memory);
        if (work?.blurControls[horizontal ? 0 : 1].value) throw null;
        return floor(v);
      });
      let failure: unknown = "unset";
      try {
        render(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      vi.restoreAllMocks();
      render(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("preserves output/putImageData publication null while retiring all actual buffers/refs and Gaussian", async () => {
  for (const producer of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = shadowHarness();
      const create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation((w, h) => {
        if (producer) throw null;
        const v = create(w, h);
        v.ctx.putImageData = () => {
          throw null;
        };
        return v;
      });
      let failure: unknown = "unset";
      try {
        render(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
    });
    memory.dispose();
  }
});
it("visits every backing/kernel retirement despite first pixel retirement null and drops all metadata", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const release = memory.release.bind(memory);
    let count = 0;
    vi.spyOn(memory, "release").mockImplementation((v) => {
      release(v);
      if (v instanceof ArrayBuffer && ++count === 1) throw null;
    });
    let failure: unknown = "unset";
    try {
      render(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(count).toBe(5);
    empty(memory);
  });
  memory.dispose();
});
