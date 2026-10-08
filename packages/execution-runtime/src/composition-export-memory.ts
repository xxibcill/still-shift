import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  serializeRenderMetadata,
  type ManagedMetadataText,
} from "../../renderer-core/src/managed-metadata.ts";
import {
  compositionResultSize,
  COMPOSITION_RESULT_CHUNK_CHARACTERS,
} from "./composition-result-size.ts";
import type { CompositionFrameDistribution } from "./composition-frame-assignment.ts";
import {
  ManagedMemory,
  type MemoryLimits,
} from "../../renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../renderer-core/src/managed-memory-context.ts";

const GiB = 1024 ** 3;
export const COMPOSITION_APPLICATION_MEMORY_LIMIT = 8 * GiB;
export const COMPOSITION_NODE_MEMORY_ALLOWANCE = GiB / 2;

/** Static partition before any browser producer. Native/driver RSS is measured separately. */
export function compositionWorkerMemoryLimits(workers: number): MemoryLimits {
  if (!Number.isInteger(workers) || workers < 1 || workers > 4)
    throw Error("Composition memory partition requires 1–4 workers");
  const metadata = GiB / 8;
  const total = Math.floor(
    (COMPOSITION_APPLICATION_MEMORY_LIMIT - COMPOSITION_NODE_MEMORY_ALLOWANCE) /
      workers,
  );
  return { pixels: total - metadata, metadata };
}

/** One export page retains result owners through Node's acknowledgement of the RPC. */
export class CompositionExportMemory {
  private memory: ManagedMemory | undefined;
  private transfer: ManagedMetadataText | undefined;
  private chunk: { text: string } | undefined;
  private state: "idle" | "rendering" | "awaiting-acknowledgement" = "idle";

  async run<T>(workers: number, render: () => Promise<T>) {
    if (this.state !== "idle")
      throw Error("Composition export memory is still in use");
    const memory = new ManagedMemory(compositionWorkerMemoryLimits(workers));
    this.memory = memory;
    this.state = "rendering";
    try {
      const value = await withManagedMemory(memory, render);
      this.state = "awaiting-acknowledgement";
      return { value, memory: memory.statistics };
    } catch (error) {
      try {
        await withManagedMemory(memory, async () => memory.dispose());
      } catch {
        // The original render, upload or cancellation failure is authoritative.
      } finally {
        this.memory = undefined;
        this.state = "idle";
      }
      throw error;
    }
  }

  async prepareTransfer(value: unknown) {
    if (
      this.state !== "awaiting-acknowledgement" ||
      !this.memory ||
      this.transfer
    )
      throw Error("Composition export result is not ready for transfer");
    return withManagedMemory(this.memory, async () => {
      const work = allocateRenderMetadata(262144, () => ({
        size: compositionResultSize(value),
      }));
      try {
        this.transfer = serializeRenderMetadata(value);
        this.chunk = allocateRenderMetadata(
          128 + COMPOSITION_RESULT_CHUNK_CHARACTERS * 4,
          () => ({ text: "" }),
          true,
          (value) => {
            value.text = "";
          },
        );
        const characters = this.transfer.value!.length;
        if (characters > work.size.characters)
          throw Error("Composition result exceeded its admitted JSON bound");
        return { ...work.size, characters, memory: this.memory!.statistics };
      } finally {
        releaseRenderMetadata(work);
      }
    });
  }
  async readTransfer(offset: number) {
    if (
      !this.transfer ||
      !this.memory ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= this.transfer.value!.length
    )
      throw Error("Composition result transfer offset is invalid");
    return withManagedMemory(this.memory, async () => {
      this.chunk!.text = this.transfer!.value!.slice(
        offset,
        offset + COMPOSITION_RESULT_CHUNK_CHARACTERS,
      );
      return this.chunk!.text;
    });
  }

  async acknowledge() {
    if (this.state !== "awaiting-acknowledgement" || !this.memory)
      throw Error("Composition export has no completed result to acknowledge");
    const memory = this.memory;
    try {
      return await withManagedMemory(memory, async () => {
        memory.dispose();
        const result = memory.statistics;
        if (
          result.current.pixels ||
          result.current.metadata ||
          result.reservations
        )
          throw Error(
            "Composition export retained owners after result acknowledgement",
          );
        return result;
      });
    } finally {
      this.memory = undefined;
      this.transfer = undefined;
      this.chunk = undefined;
      this.state = "idle";
    }
  }
}

/** Large frames run contiguous worker ranges in bounded groups, so waiting uploads
 * cannot hold the only capacity needed by an earlier frame. The 64-byte/pixel
 * scheduling envelope covers two float exposure targets plus capture/cache staging;
 * actual producer admission still enforces the limit for more complex graphs.
 */
export function compositionExecutionPolicy(
  width: number,
  height: number,
  workers: number,
) {
  compositionWorkerMemoryLimits(workers);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isSafeInteger(width * height)
  )
    throw Error("Composition memory policy dimensions are invalid");
  const area = width * height;
  const envelope = area * 64 + GiB / 8;
  const concurrentWorkers = Math.max(
    1,
    Math.min(
      workers,
      Math.floor(
        (COMPOSITION_APPLICATION_MEMORY_LIMIT -
          COMPOSITION_NODE_MEMORY_ALLOWANCE) /
          envelope,
      ),
    ),
  );
  const distribution: CompositionFrameDistribution =
    concurrentWorkers === workers ? "round-robin" : "contiguous";
  return {
    concurrentWorkers,
    distribution,
    cacheBytes: Math.min(2 * GiB, Math.max(GiB / 8, area * 32)),
    diskBytes: 8 * GiB,
  };
}
