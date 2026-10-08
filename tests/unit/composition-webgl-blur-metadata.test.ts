import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  blurKernel,
  blurKernelLength,
} from "../../packages/renderer-core/src/composition/render/webgl-blur-kernel.ts";
import {
  blurRescaleSteps,
  rescaledGaussianBlur,
} from "../../packages/renderer-core/src/composition/render/webgl-blur-rescale.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
const limits = { pixels: 65536, metadata: 1024 * 1024 };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
afterEach(() => vi.restoreAllMocks());

function harness() {
  type Surface = WebglSurface & { id: number };
  let index = 0;
  const dst = { width: 321, height: 179, id: 0 } as Surface;
  const records: unknown[] = [];
  const inputs: Surface[][] = [];
  const uniforms: Record<string, number[]>[] = [];
  const device = {
    surface: vi.fn((width: number, height: number): Surface => {
      const surface = { width, height, id: ++index } as Surface;
      records.push(["surface", width, height]);
      return surface;
    }),
    pass: vi.fn(
      (
        body: string,
        target: Surface,
        input: Surface[],
        values?: Record<string, number[]>,
      ) => {
        records.push([
          "pass",
          sha(body),
          target.id,
          input.map((value) => value.id),
          values ? JSON.parse(JSON.stringify(values)) : null,
        ]);
        inputs.push(input);
        if (values) uniforms.push(values);
      },
    ),
    swap: vi.fn((a: Surface, b: Surface) => {
      records.push(["swap", a.id, b.id]);
    }),
    release: vi.fn((surface: Surface) => {
      records.push(["release", surface.id]);
    }),
  };
  const blur = vi.fn((surface: WebglSurface, sigma: number) => {
    records.push(["blur", (surface as Surface).id, sigma]);
  });
  return {
    device,
    dst,
    records,
    inputs,
    uniforms,
    blur,
    gpu: device as unknown as WebglDevice,
  };
}

it("denies original length-array production before Gaussian math and kernel weights before Array.from", async () => {
  const first = new ManagedMemory({ pixels: 1, metadata: 511 });
  await withManagedMemory(first, async () => {
    const round = vi.spyOn(Math, "fround");
    expect(() => blurKernelLength(2)).toThrow("metadata");
    expect(round).not.toHaveBeenCalled();
    round.mockRestore();
    first.dispose();
  });
  const second = new ManagedMemory({ pixels: 1, metadata: 1111 });
  await withManagedMemory(second, async () => {
    const from = vi.spyOn(Array, "from");
    expect(() => blurKernel(2)).toThrow("metadata");
    expect(from).not.toHaveBeenCalled();
    expect(second.statistics.current.metadata).toBe(0);
    second.dispose();
  });
});

it("preserves complete original Gaussian kernel hashes and owns actual returned arrays until consumer release", async () => {
  // Complete kernel JSON hashes captured from pushed ae1cbf9.
  const cases = [
    [0, "4eed53ca4ff216c385b46798b6bc120e8e41df8d609cfce989f6af1d37dcdabb"],
    [2, "e63973e44766dd4c598bd524f77a6ed424c8be568025033b1a6f27c4595e6795"],
    [16, "7dd56629ffec3199c1a1ec5c4e5ac1687f04504a187a9384dd274bb824ba11d9"],
    [128, "49bcead36419179ad71f818357b1829f48fd1cec9f6951c791aca79551a145b2"],
    [532, "9eae19c6072840e6aad791e42a2761a9d973537cad807050fd9c2df1269e81da"],
    [1000, "9eae19c6072840e6aad791e42a2761a9d973537cad807050fd9c2df1269e81da"],
  ] as const;
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    for (const [sigma, hash] of cases) {
      const kernel = blurKernel(sigma);
      expect(sha(kernel)).toBe(hash);
      expect(memory.owns(kernel)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(
        512 + 8 * kernel.weights.length,
      );
      const weights = kernel.weights,
        lengths = kernel.lengths;
      releaseRenderMetadata(kernel);
      expect(weights).toHaveLength(0);
      expect(lengths).toHaveLength(0);
      expect(memory.statistics.current.metadata).toBe(0);
    }
    const invalid = blurKernel(NaN);
    expect(invalid.weights).toEqual([]);
    expect(Number.isNaN(invalid.radius)).toBe(true);
    releaseRenderMetadata(invalid);
    memory.dispose();
  });
});

it("preserves original null weight factory failure and restores actual setup arrays/admission for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const from = vi.spyOn(Array, "from").mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      blurKernel(2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(0);
    from.mockRestore();
    const kernel = blurKernel(2);
    expect(kernel.weights).toHaveLength(11);
    releaseRenderMetadata(kernel);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("retains original returned kernels until scratch or allocator-first cleanup without changing unmanaged values", async () => {
  const memory = new ManagedMemory(limits);
  let kernel: ReturnType<typeof blurKernel>;
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    kernel = blurKernel(16);
    expect(kernel.weights).toHaveLength(89);
    memory.endScratch();
    expect(kernel.weights).toHaveLength(0);
    kernel = blurKernel(2);
  });
  memory.dispose();
  releaseRenderMetadata(kernel!);
  expect(kernel!.weights).toHaveLength(0);
  expect(memory.statistics.current.metadata).toBe(0);
  expect(blurKernel(2).weights).toHaveLength(11);
});

it("admits actual empty/nonempty scale arrays before original factories and preserves finite validation", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 519 });
  await withManagedMemory(memory, async () => {
    const from = vi.spyOn(Array, "from");
    expect(() => blurRescaleSteps(270)).toThrow("metadata");
    expect(from).not.toHaveBeenCalled();
    from.mockRestore();
    const empty = blurRescaleSteps(135);
    expect(memory.owns(empty)).toBe(true);
    releaseRenderMetadata(empty);
    expect(() => blurRescaleSteps(NaN)).toThrow("comp-effect-params");
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("denies rescale arena one byte before native intermediate construction and releases actual step owner", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 528 + 9216 - 1 });
  await withManagedMemory(memory, async () => {
    const { gpu, device, dst, blur } = harness();
    expect(() => rescaledGaussianBlur(gpu, dst, 532, blur)).toThrow("metadata");
    expect(device.surface).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("preserves exact original rescale dimensions, shader/math/uniforms/blur/swap/release trace and actual consumer lifetimes", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { gpu, device, dst, blur, records, inputs, uniforms } = harness();
    expect(rescaledGaussianBlur(gpu, dst, 532, blur)).toBe(true);
    expect(sha(records)).toBe(
      "ed6423052892a34238bc5c3099963d1c6e08d61dfa0df01bdb15cd44bfd950ec",
    );
    expect(device.surface).toHaveBeenCalledTimes(4);
    for (const input of inputs) expect(input).toHaveLength(0);
    for (const value of uniforms) expect(Object.keys(value)).toHaveLength(0);
    expect(dst.width).toBe(321);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("visits every native intermediate on null recursive blur failure, preserves original null over cleanup and supports retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { gpu, device, dst, blur, inputs } = harness();
    blur.mockImplementationOnce(() => {
      throw null;
    });
    device.release.mockImplementationOnce(() => {
      throw Error("secondary release");
    });
    let caught: unknown = "missing";
    try {
      rescaledGaussianBlur(gpu, dst, 532, blur);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(device.release).toHaveBeenCalledTimes(3);
    for (const input of inputs) expect(input).toHaveLength(0);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(rescaledGaussianBlur(gpu, dst, 532, blur)).toBe(true);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("preserves first null native release, visits all remaining surfaces and retains original unmanaged/empty rescale values", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { gpu, device, dst, blur } = harness();
    device.release.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      rescaledGaussianBlur(gpu, dst, 532, blur);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(device.release).toHaveBeenCalledTimes(4);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(rescaledGaussianBlur(gpu, dst, 135, blur)).toBe(false);
    memory.dispose();
  });
  const { gpu, dst, blur, records } = harness();
  expect(rescaledGaussianBlur(gpu, dst, 532, blur)).toBe(true);
  expect(sha(records)).toBe(
    "ed6423052892a34238bc5c3099963d1c6e08d61dfa0df01bdb15cd44bfd950ec",
  );
});
