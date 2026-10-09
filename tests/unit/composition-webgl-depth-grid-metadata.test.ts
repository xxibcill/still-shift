import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  depthImageGrid,
  hardwareDepthGrid,
} from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  releaseRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
const limits = { pixels: 8 * 1024 * 1024, metadata: 8192 };
const sha = (v: ArrayBufferView) =>
  createHash("sha256")
    .update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
    .digest("hex");
const original = {
  grid: {
    vertices: {
      bytes: 150672,
      sha256:
        "4372445283f0ff67da14278044fa0c0287bca505de636a5359c29fb188c9290a",
    },
    indices: {
      bytes: 110592,
      sha256:
        "7f3149182d62576d4810f439e8955b2f21598e25367186cda72a46489bb014a8",
    },
  },
  hardware: {
    vertices: {
      bytes: 3538944,
      sha256:
        "d390913efc7999b9c37365adf799f93249dabda5ed528acafd30f485ec6f9720",
    },
    indices: {
      bytes: 110592,
      sha256:
        "34ef1756355723b261c048711ebc65fa06a58c0a21ee1bc660a2029725086624",
    },
  },
};
afterEach(() => vi.restoreAllMocks());
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function check(
  grid: ReturnType<typeof depthImageGrid>,
  expected: typeof original.grid,
) {
  for (const key of ["vertices", "indices"] as const) {
    expect(grid[key].byteLength).toBe(expected[key].bytes);
    expect(sha(grid[key])).toBe(expected[key].sha256);
  }
}
function release(grid: ReturnType<typeof depthImageGrid>) {
  releaseRenderPixels(grid.vertices);
  releaseRenderPixels(grid.indices);
  releaseRenderMetadata(grid);
}
it("denies actual grid working data one byte before any pixel producer", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1023 }),
    set = vi.spyOn(Float32Array.prototype, "set");
  await withManagedMemory(memory, async () => {
    expect(depthImageGrid).toThrow(/metadata/);
    expect(set).not.toHaveBeenCalled();
    expect(memory.statistics.peak.pixels).toBe(0);
    empty(memory);
  });
});
it("preserves complete original grid and hardware buffer bytes while actual result records retain view references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const grid = depthImageGrid(),
      expanded = hardwareDepthGrid(grid);
    check(grid, original.grid);
    check(expanded, original.hardware);
    expect(memory.owns(grid)).toBe(true);
    expect(memory.owns(expanded)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(1024);
    const views = [
      grid.vertices,
      grid.indices,
      expanded.vertices,
      expanded.indices,
    ];
    release(expanded);
    release(grid);
    empty(memory);
    expect(grid).toEqual({});
    expect(expanded).toEqual({});
    for (const view of views) expect(view.byteLength).toBe(0);
  });
  const inactive = depthImageGrid();
  check(inactive, original.grid);
  check(hardwareDepthGrid(inactive), original.hardware);
});
it("owns actual per-set numeric vectors through copy then clears them without changing typed values", async () => {
  const memory = new ManagedMemory(limits),
    set = Float32Array.prototype.set;
  let first: number[] | undefined;
  vi.spyOn(Float32Array.prototype, "set").mockImplementation(function (
    this: Float32Array,
    values,
    offset,
  ) {
    expect(memory.statistics.current.metadata).toBe(1024);
    if (!first) {
      first = values as number[];
      expect(first).toEqual([-1, 1, 0, 1]);
    }
    return set.call(this, values, offset);
  });
  await withManagedMemory(memory, async () => {
    const grid = depthImageGrid();
    expect(first).toEqual([]);
    check(grid, original.grid);
    release(grid);
    empty(memory);
  });
});
it("rolls back every backing on exact result-record metadata denial and second pixel denial", async () => {
  for (const quotas of [
    { pixels: limits.pixels, metadata: 1535 },
    { pixels: 200000, metadata: 4096 },
  ]) {
    const memory = new ManagedMemory(quotas);
    await withManagedMemory(memory, async () => {
      expect(depthImageGrid).toThrow(/quota/);
      empty(memory);
    });
  }
});
it("detaches partial grid on original null set failure, preserves null and permits retry", async () => {
  const memory = new ManagedMemory(limits);
  let buffer: ArrayBuffer | undefined;
  const adopt = memory.adopt.bind(memory);
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    if (value instanceof ArrayBuffer) buffer = value;
    return adopt(value, lease, destroy);
  });
  vi.spyOn(Float32Array.prototype, "set").mockImplementationOnce(() => {
    throw null;
  });
  await withManagedMemory(memory, async () => {
    try {
      depthImageGrid();
      expect.fail("set");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(buffer?.byteLength).toBe(0);
    empty(memory);
    const grid = depthImageGrid();
    check(grid, original.grid);
    release(grid);
    empty(memory);
  });
});
it("denies hardware working metadata and second backing before producing subarray views while keeping borrowed input exact", async () => {
  const grid = depthImageGrid(),
    before = sha(grid.vertices);
  for (const quotas of [
    { pixels: limits.pixels, metadata: 1023 },
    { pixels: 200000, metadata: 4096 },
  ]) {
    const memory = new ManagedMemory(quotas),
      subarray = vi.spyOn(grid.vertices, "subarray");
    await withManagedMemory(memory, async () => {
      expect(() => hardwareDepthGrid(grid)).toThrow(/quota/);
      expect(subarray).not.toHaveBeenCalled();
      empty(memory);
    });
    subarray.mockRestore();
    expect(sha(grid.vertices)).toBe(before);
  }
});
it("owns actual triangle lists and three borrowed-backing views through original copies then drops references", async () => {
  const grid = depthImageGrid(),
    memory = new ManagedMemory(limits);
  let owner:
      | { views: Float32Array[]; triangle?: Float32Array[]; values?: number[] }
      | undefined,
    triangle: Float32Array[] | undefined,
    corners: number[] | undefined;
  const adopt = memory.adopt.bind(memory),
    set = Float32Array.prototype.set;
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    if ("views" in value) owner = value as typeof owner;
    return adopt(value, lease, destroy);
  });
  vi.spyOn(Float32Array.prototype, "set").mockImplementation(function (
    this: Float32Array,
    values,
    offset,
  ) {
    if (!triangle) {
      triangle = owner?.triangle;
      corners = owner?.values;
      expect(triangle).toHaveLength(3);
      expect(owner?.views).toHaveLength(3);
      expect(corners).toEqual([0, 1, 2]);
      expect((values as Float32Array).buffer).toBe(grid.vertices.buffer);
    }
    return set.call(this, values, offset);
  });
  await withManagedMemory(memory, async () => {
    const expanded = hardwareDepthGrid(grid);
    expect(triangle).toEqual([]);
    expect(corners).toEqual([]);
    expect(owner?.views).toEqual([]);
    expect(owner?.triangle).toBeUndefined();
    check(expanded, original.hardware);
    release(expanded);
    empty(memory);
  });
  check(grid, original.grid);
});
it("releases actual hardware buffers on null subarray or copy failure then allows retry without changing borrowed input", async () => {
  const grid = depthImageGrid();
  for (const stage of ["subarray", "set"]) {
    const memory = new ManagedMemory(limits);
    let first: ArrayBuffer | undefined, second: ArrayBuffer | undefined;
    const adopt = memory.adopt.bind(memory);
    const capture = vi
      .spyOn(memory, "adopt")
      .mockImplementation((value, lease, destroy) => {
        if (value instanceof ArrayBuffer) {
          if (!first) first = value;
          else second = value;
        }
        return adopt(value, lease, destroy);
      });
    const spy =
      stage === "subarray"
        ? vi.spyOn(grid.vertices, "subarray")
        : vi.spyOn(Float32Array.prototype, "set");
    spy.mockImplementationOnce(() => {
      throw null;
    });
    await withManagedMemory(memory, async () => {
      try {
        hardwareDepthGrid(grid);
        expect.fail(stage);
      } catch (error) {
        expect(error).toBe(null);
      }
      expect(first?.byteLength).toBe(0);
      expect(second?.byteLength).toBe(0);
      empty(memory);
      spy.mockRestore();
      const expanded = hardwareDepthGrid(grid);
      check(expanded, original.hardware);
      release(expanded);
      empty(memory);
    });
    capture.mockRestore();
    check(grid, original.grid);
  }
});
it("drops actual returned grid view references on scratch or allocator cleanup with original detached backings", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    let grid: ReturnType<typeof depthImageGrid> | undefined;
    let vertices: Float32Array | undefined, indices: Uint16Array | undefined;
    await withManagedMemory(memory, async () => {
      if (!allocatorFirst) memory.beginScratch();
      grid = depthImageGrid();
      vertices = grid.vertices;
      indices = grid.indices;
      if (allocatorFirst) memory.dispose();
      else memory.endScratch();
      empty(memory);
    });
    expect(grid).toEqual({});
    expect(vertices?.byteLength).toBe(0);
    expect(indices?.byteLength).toBe(0);
  }
});
