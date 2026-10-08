import { expect, it } from "vitest";
import {
  renderMemory,
  allocateRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { allocateRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
import {
  CompositionExportMemory,
  compositionWorkerMemoryLimits,
  COMPOSITION_APPLICATION_MEMORY_LIMIT,
  COMPOSITION_NODE_MEMORY_ALLOWANCE,
} from "../../packages/execution-runtime/src/composition-export-memory.ts";

it("partitions the application ceiling across all workers and the Node allowance", () => {
  for (let workers = 1; workers <= 4; workers++) {
    const { pixels, metadata } = compositionWorkerMemoryLimits(workers);
    expect(
      (pixels + metadata) * workers + COMPOSITION_NODE_MEMORY_ALLOWANCE,
    ).toBeLessThanOrEqual(COMPOSITION_APPLICATION_MEMORY_LIMIT);
    expect(pixels).toBeGreaterThan(256 * 1024 ** 2);
  }
  for (const workers of [0, 5, 1.5, NaN])
    expect(() => compositionWorkerMemoryLimits(workers)).toThrow();
});
it("keeps real result backing and metadata live until RPC acknowledgement", async () => {
  const owner = new CompositionExportMemory();
  const { value, memory } = await owner.run(4, async () => ({
    pixels: allocateRenderPixels(4, () => new Uint8Array([1, 2, 3, 4])),
    rows: allocateRenderMetadata(
      128,
      () => [1, 2],
      false,
      (rows) => {
        rows.length = 0;
      },
    ),
  }));
  expect(memory.current).toEqual({ pixels: 4, metadata: 128 });
  expect([...value.pixels]).toEqual([1, 2, 3, 4]);
  expect(value.rows).toEqual([1, 2]);
  await expect(owner.run(1, async () => 1)).rejects.toThrow(/still in use/);
  const after = await owner.acknowledge();
  expect(after.current).toEqual({ pixels: 0, metadata: 0 });
  expect(after.reservations).toBe(0);
  expect(value.pixels.byteLength).toBe(0);
  expect(value.rows).toEqual([]);
  expect(renderMemory()).toBeUndefined();
  await expect(owner.acknowledge()).rejects.toThrow(/no completed result/);
});
it("rejects capacity before the native producer and preserves the original null failure", async () => {
  const owner = new CompositionExportMemory();
  let produced = false;
  await expect(
    owner.run(4, async () => {
      allocateRenderPixels(compositionWorkerMemoryLimits(4).pixels + 1, () => {
        produced = true;
        return new Uint8Array(1);
      });
    }),
  ).rejects.toThrow(/quota/);
  expect(produced).toBe(false);
  await expect(
    owner.run(4, async () => {
      allocateRenderMetadata(
        128,
        () => ({}),
        false,
        () => {
          throw Error("cleanup");
        },
      );
      throw null;
    }),
  ).rejects.toBeNull();
  const next = await owner.run(1, async () => "recovered");
  expect(next.value).toBe("recovered");
  await owner.acknowledge();
});
