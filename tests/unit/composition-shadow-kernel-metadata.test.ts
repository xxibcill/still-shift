import { afterEach, expect, it, vi } from "vitest";
import {
  shadowGaussianKernel,
  shadowEffectKernel,
} from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
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

const originalKernels = [
  {
    sigma: 0,
    weights: 1,
    sha256: "22be27860ae3feab63907236c2c8cff203db5c77ba6819432e174cc0cbd2bfe6",
  },
  {
    sigma: 0.125,
    weights: 3,
    sha256: "f7478b94bbba162b022d0d6c0f0d040ee83bf723c44d60628b6bad6173c03ba4",
  },
  {
    sigma: 1,
    weights: 7,
    sha256: "7b6085b680062f2d78d1131ff5c921393a29e64a0f42c189c9ae2b6032521f89",
  },
  {
    sigma: 1.7,
    weights: 13,
    sha256: "8acda3944ea7332805936fecaeda3ec896e0c2bcf4fe73c95a026f9d1619746e",
  },
  {
    sigma: 8,
    weights: 49,
    sha256: "30cb890738ba38cb5163bbee3798ec6c1f56f4d733773093db2963c91d50fdc8",
  },
  {
    sigma: 32,
    weights: 193,
    sha256: "8406e3b52d22032e200de9e6f8b8dbebbaa7f6a96a37af48998bca8771cfb1b2",
  },
  {
    sigma: 128,
    weights: 769,
    sha256: "ab0f0fa7049e3048b0df42559c5394df2bee18688b16b942acdc0e730f8ed224",
  },
] as const;
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
const limits = { pixels: 1024 * 1024, metadata: 65536 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
type Kernel = ReturnType<typeof shadowGaussianKernel>;
type Work = {
  managed: boolean;
  float?: number[];
  weights?: number[];
  shape?: { length: number };
};
function values(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as { resources: Map<object, { value: object }> }
    ).resources.values(),
  ].map((x) => x.value);
}
afterEach(() => vi.restoreAllMocks());
it("preserves all complete original Gaussian containers from neutral through maximum supported radius", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const run = async () => {
      for (const original of originalKernels) {
        const k = shadowGaussianKernel(original.sigma);
        expect(k.weights).toHaveLength(original.weights);
        expect(sha(k)).toBe(original.sha256);
        releaseRenderMetadata(k);
      }
      empty(memory);
    };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
});
it("pre-admits neutral result and actual single weight before its factory", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 519 });
  await withManagedMemory(memory, async () => {
    expect(() => shadowGaussianKernel(0)).toThrow(/metadata/);
    empty(memory);
  });
  memory.dispose();
});
it("rejects floating workspace before original Array.from and permits quota retry", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1024 + 8 * 13 - 1 });
  await withManagedMemory(memory, async () => {
    const from = vi.spyOn(Array, "from");
    expect(() => shadowGaussianKernel(1.7)).toThrow(/metadata/);
    expect(from).not.toHaveBeenCalled();
    empty(memory);
    expect(shadowGaussianKernel(0).weights).toEqual([4096]);
  });
  memory.dispose();
  empty(memory);
});
it("pre-admits actual returned weight/result capacity before original floating map producer", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 1024 + 8 * 13 + 512 + 8 * 13 - 1,
  });
  await withManagedMemory(memory, async () => {
    const map = vi.spyOn(Array.prototype, "map");
    expect(() => shadowGaussianKernel(1.7)).toThrow(/metadata/);
    expect(map).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("captures actual floating array/shape through original math then retires work while result remains owned through consumer", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    let work: Work | undefined, float: number[] | undefined;
    const round = Math.round;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      work = values(memory).find((x) => "float" in x) as Work;
      float = work.float;
      expect(memory.owns(work)).toBe(true);
      expect(work.shape).toEqual({ length: 13 });
      expect(float).toHaveLength(13);
      expect(memory.statistics.current.metadata).toBe(
        1024 + 8 * 13 + 512 + 8 * 13,
      );
      return round(v);
    });
    const k = shadowGaussianKernel(1.7);
    expect(work!.shape).toBeUndefined();
    expect(float).toHaveLength(0);
    expect(work!.weights).toBeUndefined();
    expect(memory.owns(work!)).toBe(false);
    expect(memory.owns(k)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(512 + 8 * 13);
    expect(sha(k)).toBe(originalKernels[3].sha256);
    const weights = k.weights;
    releaseRenderMetadata(k);
    expect(weights).toHaveLength(0);
    expect(Object.keys(k)).toEqual([]);
    empty(memory);
  });
  memory.dispose();
});
it("cleans original Array.from/Math.exp null workspace and retries in same scope", async () => {
  for (const from of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      if (from)
        vi.spyOn(Array, "from").mockImplementationOnce(() => {
          throw null;
        });
      else
        vi.spyOn(Math, "exp").mockImplementationOnce(() => {
          throw null;
        });
      let failure: unknown = "unset";
      try {
        shadowGaussianKernel(1.7);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      expect(sha(shadowGaussianKernel(1.7))).toBe(originalKernels[3].sha256);
    });
    memory.dispose();
    empty(memory);
  }
});
it("clears a completed actual weight array after total-reduce null before returned record exists and then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const captured: { weights?: number[] } = {};
    const reduce = Array.prototype.reduce;
    let count = 0;
    vi.spyOn(Array.prototype, "reduce").mockImplementation(function (
      this: number[],
      ...args: unknown[]
    ) {
      if (++count === 2) {
        captured.weights = this;
        throw null;
      }
      return Reflect.apply(reduce, this, args);
    });
    let failure: unknown = "unset";
    try {
      shadowGaussianKernel(1.7);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(captured.weights).toHaveLength(0);
    empty(memory);
    vi.restoreAllMocks();
    const k = shadowGaussianKernel(1.7);
    expect(sha(k)).toBe(originalKernels[3].sha256);
    releaseRenderMetadata(k);
    empty(memory);
  });
  memory.dispose();
});
it("keeps actual returned weights charged outside scope until explicit consumer release and clears them at scratch retirement", async () => {
  const memory = new ManagedMemory(limits);
  let k: Kernel | undefined;
  await withManagedMemory(memory, async () => {
    k = shadowGaussianKernel(8);
  });
  expect(memory.owns(k!)).toBe(true);
  releaseRenderMetadata(k!);
  expect(Object.keys(k!)).toEqual([]);
  empty(memory);
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    k = shadowGaussianKernel(32);
    expect(memory.owns(k!)).toBe(true);
    memory.endScratch();
    expect(Object.keys(k!)).toEqual([]);
    empty(memory);
  });
  memory.dispose();
});
it("preserves all original inner/drop-shadow GPU/Canvas native commands and exact generated/uploaded/output bytes while retiring consumed kernels", async () => {
  for (const original of originalNative) {
    for (const active of [false, true]) {
      const memory = new ManagedMemory(limits);
      const run = async () => {
        memory.beginScratch();
        const h = shadowHarness(),
          p = shadowEffectKernel(original.id)!;
        if (original.gpu)
          p.renderGpu(h.context as never, h.input as never, params as never);
        else
          p.renderCanvas!(
            h.context as never,
            h.input as never,
            params as never,
          );
        expect(h.records).toHaveLength(original.calls);
        expect(sha(h.records)).toBe(original.sha256);
        expect(memory.statistics.current.metadata).toBe(0);
        memory.endScratch();
        empty(memory);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      memory.dispose();
    }
  }
});
it("holds actual kernel through GPU/Canvas consumers and retires it after native publication null", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const h = shadowHarness(),
        p = shadowEffectKernel("light.drop-shadow")!;
      let k: Kernel | undefined, weights: number[] | undefined;
      if (gpu) {
        vi.spyOn(h.context, "pass").mockImplementationOnce(() => {
          k = values(memory).find((x) => "weights" in x) as Kernel;
          weights = k.weights;
          expect(memory.owns(k)).toBe(true);
          throw null;
        });
      } else {
        const create = h.context.createSurface;
        vi.spyOn(h.context, "createSurface").mockImplementationOnce((w, h) => {
          k = values(memory).find((x) => "weights" in x) as Kernel;
          weights = k.weights;
          expect(memory.owns(k)).toBe(true);
          const out = create(w, h);
          out.ctx.putImageData = () => {
            throw null;
          };
          return out;
        });
      }
      let failure: unknown = "unset";
      try {
        if (gpu)
          p.renderGpu(h.context as never, h.input as never, params as never);
        else
          p.renderCanvas!(
            h.context as never,
            h.input as never,
            params as never,
          );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(weights).toHaveLength(0);
      expect(Object.keys(k!)).toEqual([]);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.endScratch();
      empty(memory);
    });
    memory.dispose();
  }
});
