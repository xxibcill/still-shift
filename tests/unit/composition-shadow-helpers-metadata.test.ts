import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  shadowGaussianKernel,
  shadowCompositePixel,
  blurShadowMask,
} from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
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

const originalBlur = [
  {
    sigma: 0,
    padding: 0,
    direction: [1, 0],
    output: [0, 1, 255, 128, 91, 3],
    sha256: "d2f082682a374c15a9073d56c7218f42178c54a3fbc3b561cad11018922ba1ce",
  },
  {
    sigma: 0,
    padding: 0,
    direction: [0, 1],
    output: [0, 1, 255, 128, 91, 3],
    sha256: "d2f082682a374c15a9073d56c7218f42178c54a3fbc3b561cad11018922ba1ce",
  },
  {
    sigma: 0,
    padding: 255,
    direction: [1, 0],
    output: [0, 1, 255, 128, 91, 3],
    sha256: "d2f082682a374c15a9073d56c7218f42178c54a3fbc3b561cad11018922ba1ce",
  },
  {
    sigma: 0,
    padding: 255,
    direction: [0, 1],
    output: [0, 1, 255, 128, 91, 3],
    sha256: "d2f082682a374c15a9073d56c7218f42178c54a3fbc3b561cad11018922ba1ce",
  },
  {
    sigma: 1,
    padding: 0,
    direction: [1, 0],
    output: [14, 62, 102, 73, 68, 30],
    sha256: "e0c6426ac8296977847747614489524335cf7a95805724bf688d1d171b7f9b36",
  },
  {
    sigma: 1,
    padding: 0,
    direction: [0, 1],
    output: [31, 22, 103, 51, 37, 63],
    sha256: "4af67ba03655f4fca094d0e235c3d267cbad5ddccd45e01981ced722ec576659",
  },
  {
    sigma: 1,
    padding: 255,
    direction: [1, 0],
    output: [92, 92, 180, 151, 98, 108],
    sha256: "f8a49c0fb5bef126c85e9f9c9909c265ffcb4328f2f229757b1a3f85e4511403",
  },
  {
    sigma: 1,
    padding: 255,
    direction: [0, 1],
    output: [122, 114, 194, 143, 128, 154],
    sha256: "800541259741ca4e905470fd7ccb48ba6edcfb7d4b0b8538aafe2eaff37a1589",
  },
  {
    sigma: 1.7,
    padding: 0,
    direction: [1, 0],
    output: [30, 51, 60, 48, 47, 34],
    sha256: "b00f47ddbc6bea947564d46396769f91e44cfe244347228f2b1f12ac322d8b55",
  },
  {
    sigma: 1.7,
    padding: 0,
    direction: [0, 1],
    output: [25, 18, 60, 30, 22, 51],
    sha256: "a999a4800abfa0029d4b653255131527646fb443d7257a6a62c88dfb27962159",
  },
  {
    sigma: 1.7,
    padding: 255,
    direction: [1, 0],
    output: [145, 145, 175, 163, 142, 149],
    sha256: "b213a6b324e162201c610fe5295f88f6eca69c242dfda8c0758b80f7219afeb0",
  },
  {
    sigma: 1.7,
    padding: 255,
    direction: [0, 1],
    output: [170, 163, 205, 175, 166, 196],
    sha256: "722475c6056f7a070e57e78e1c97468a5ebcc2e27b6ab3ca32ea73d42ec2b93a",
  },
  {
    sigma: 8,
    padding: 0,
    direction: [1, 0],
    output: [12, 13, 13, 11, 11, 11],
    sha256: "16f0260a9d3104e22645e57ee79d6470c2b95e71bff140f07bbf962edde4ecbb",
  },
  {
    sigma: 8,
    padding: 0,
    direction: [0, 1],
    output: [6, 5, 13, 6, 5, 13],
    sha256: "c6e02dffdff03fddf5ba078ee0d194d1b8ff2ff02fd2cba43d47dde2b47397ad",
  },
  {
    sigma: 8,
    padding: 255,
    direction: [1, 0],
    output: [230, 230, 230, 228, 228, 228],
    sha256: "509a500ccbbc2b30e82578c10d3c97f8b777f7edcb418bea3b4401aceed63f9d",
  },
  {
    sigma: 8,
    padding: 255,
    direction: [0, 1],
    output: [236, 234, 243, 236, 234, 242],
    sha256: "87e3dd33cabc03603015926d1978e2670eb270f0aedba470846d4829df6c2732",
  },
] as const;
const limits = { pixels: 1024 * 1024, metadata: 65536 },
  params = { color: [0.7, 0.2, 0.1, 0.6], opacity: 0.8 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function sha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 32 whole original composite results in active/inactive standalone routes with actual returned array owners", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const run = async () => {
      for (const x of originalPixels) {
        const output = shadowCompositePixel(x.inner, x.src, x.mask, params);
        expect(output).toEqual(x.result);
        expect(sha(output)).toBe(x.sha256);
        if (active) expect(memory.owns(output)).toBe(true);
        releaseRenderMetadata(output);
      }
      empty(memory);
    };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
});
it("preserves all 16 original directional/padded blur backing bytes with actual returned view/independent backing owners", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const run = async () => {
      for (const x of originalBlur) {
        const k = shadowGaussianKernel(x.sigma),
          input = new Uint8Array([0, 1, 255, 128, 91, 3]);
        const output = blurShadowMask(input, 3, 2, k, x.direction, x.padding);
        expect([...output]).toEqual(x.output);
        expect(createHash("sha256").update(output).digest("hex")).toBe(
          x.sha256,
        );
        if (active) {
          expect(memory.owns(output)).toBe(true);
          expect(memory.owns(output.buffer)).toBe(true);
        }
        releaseRenderMetadata(output);
        releaseRenderMetadata(k);
        expect(input.byteLength).toBe(6);
      }
      empty(memory);
    };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
});
it("rejects composite work and returned array quotas before channel/map factories", async () => {
  for (const metadata of [1023, 1024 + 287]) {
    const memory = new ManagedMemory({ ...limits, metadata });
    await withManagedMemory(memory, async () => {
      const map = vi.spyOn(Array.prototype, "map");
      expect(() =>
        shadowCompositePixel(true, [128, 33, 67, 128], 128, params),
      ).toThrow(/metadata/);
      expect(map).not.toHaveBeenCalled();
      empty(memory);
    });
    memory.dispose();
  }
});
it("rejects standalone blur view/control quota before pixel producer or original math", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 511 });
  await withManagedMemory(memory, async () => {
    const floor = vi.spyOn(Math, "floor");
    expect(() =>
      blurShadowMask(
        new Uint8Array(6),
        3,
        2,
        { radius: 0, weights: [4096], total: 4096 },
        [1, 0],
        0,
      ),
    ).toThrow(/metadata/);
    expect(floor).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("retires standalone blur metadata when original pixel quota fails before the view factory", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 5 });
  await withManagedMemory(memory, async () => {
    expect(() =>
      blurShadowMask(
        new Uint8Array(6),
        3,
        2,
        { radius: 0, weights: [4096], total: 4096 },
        [1, 0],
        0,
      ),
    ).toThrow(/pixels/);
    empty(memory);
  });
  memory.dispose();
});
it("cleans composite Math.round/Array.from partial producers on null then permits retry", async () => {
  for (const from of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      if (from)
        vi.spyOn(Array, "from").mockImplementationOnce(() => {
          throw null;
        });
      else
        vi.spyOn(Math, "round").mockImplementationOnce(() => {
          throw null;
        });
      let failure: unknown = "unset";
      try {
        shadowCompositePixel(false, [128, 33, 67, 128], 128, params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      vi.restoreAllMocks();
      const output = shadowCompositePixel(
        false,
        [128, 33, 67, 128],
        128,
        params,
      );
      expect(memory.owns(output)).toBe(true);
      releaseRenderMetadata(output);
      empty(memory);
    });
    memory.dispose();
  }
});
it("cleans and detaches actual unreturned standalone blur view after original mid-loop null over secondary retirement error then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    vi.spyOn(Math, "floor").mockImplementationOnce(() => {
      throw null;
    });
    const release = memory.release.bind(memory);
    let backing: ArrayBuffer | undefined;
    vi.spyOn(memory, "release").mockImplementation((value) => {
      if (value instanceof ArrayBuffer) backing = value;
      release(value);
      throw Error("secondary backing release");
    });
    let failure: unknown = "unset";
    try {
      blurShadowMask(
        new Uint8Array(6),
        3,
        2,
        { radius: 0, weights: [4096], total: 4096 },
        [1, 0],
        0,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(backing!.byteLength).toBe(0);
    empty(memory);
    vi.restoreAllMocks();
    const output = blurShadowMask(
      new Uint8Array(6),
      3,
      2,
      { radius: 0, weights: [4096], total: 4096 },
      [1, 0],
      0,
    );
    releaseRenderMetadata(output);
    empty(memory);
  });
  memory.dispose();
});
it("retains actual array/view outputs outside active scope until their consumer releases them then empties/detaches their values", async () => {
  const memory = new ManagedMemory(limits);
  let array: number[] | undefined, view: Uint8Array | undefined;
  await withManagedMemory(memory, async () => {
    array = shadowCompositePixel(false, [128, 33, 67, 128], 128, params);
    view = blurShadowMask(
      new Uint8Array(6),
      3,
      2,
      { radius: 0, weights: [4096], total: 4096 },
      [1, 0],
      0,
    );
  });
  expect(memory.owns(array!)).toBe(true);
  expect(memory.owns(view!)).toBe(true);
  expect(memory.statistics.current).toEqual({ pixels: 6, metadata: 288 + 512 });
  releaseRenderMetadata(array!);
  releaseRenderMetadata(view!);
  expect(array).toHaveLength(0);
  expect(view!.byteLength).toBe(0);
  empty(memory);
  memory.dispose();
});
it("retires actual standalone outputs at scratch/allocator cleanup without changing borrowed source or kernel arrays", async () => {
  const memory = new ManagedMemory(limits);
  let array: number[] | undefined, view: Uint8Array | undefined;
  const input = new Uint8Array([0, 1, 255, 128, 91, 3]),
    kernel = { radius: 0, weights: [4096], total: 4096 };
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    array = shadowCompositePixel(true, [128, 33, 67, 128], 128, params);
    view = blurShadowMask(input, 3, 2, kernel, [1, 0], 0);
    memory.endScratch();
    expect(array).toHaveLength(0);
    expect(view!.byteLength).toBe(0);
    empty(memory);
    array = shadowCompositePixel(true, [128, 33, 67, 128], 128, params);
    view = blurShadowMask(input, 3, 2, kernel, [1, 0], 0);
  });
  memory.dispose();
  expect(array).toHaveLength(0);
  expect(view!.byteLength).toBe(0);
  expect([...input]).toEqual([0, 1, 255, 128, 91, 3]);
  expect(kernel.weights).toEqual([4096]);
  empty(memory);
});
it("cleans actual produced array/view when metadata adoption throws null before publication", async () => {
  for (const view of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const adopt = memory.adopt.bind(memory);
      let result: object | undefined;
      vi.spyOn(memory, "adopt").mockImplementation((value, ...args) => {
        if (
          (view && ArrayBuffer.isView(value)) ||
          (!view && Array.isArray(value))
        ) {
          result = value;
          throw null;
        }
        adopt(value, ...args);
      });
      let failure: unknown = "unset";
      try {
        if (view)
          blurShadowMask(
            new Uint8Array(6),
            3,
            2,
            { radius: 0, weights: [4096], total: 4096 },
            [1, 0],
            0,
          );
        else shadowCompositePixel(true, [128, 33, 67, 128], 128, params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (view) expect((result as Uint8Array).byteLength).toBe(0);
      else expect(result as number[]).toHaveLength(0);
      empty(memory);
    });
    memory.dispose();
  }
});
