import {
  ManagedMemory,
  withManagedMemory,
  type MemoryLimits,
} from "@still-shift/renderer-core";

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
      this.state = "idle";
    }
  }
}
