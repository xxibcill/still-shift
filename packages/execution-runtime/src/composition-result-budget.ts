import {
  ManagedMemory,
  type MemoryLease,
} from "../../renderer-core/src/managed-memory.ts";
import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "./composition-export-memory.ts";
import type { CompositionResultSize } from "./composition-result-size.ts";

/** Export-owned result/RPC/summary storage; returned metrics transfer to the caller.
 * Native V8/Playwright/FFmpeg RSS is measured independently of these capacities.
 */
export class CompositionResultBudget {
  private readonly memory = new ManagedMemory({
    pixels: 1,
    metadata: COMPOSITION_NODE_MEMORY_ALLOWANCE - 1,
  });
  private readonly results: MemoryLease[] = [];
  constructor(frameCount: number) {
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount < 1 ||
      frameCount > 108000
    )
      throw Error("Composition result frame bound is invalid");
    // Receiver chunks, descriptors and exact-P95 arrays/sort workspace.
    this.memory.reserve("metadata", 4 * 1024 ** 2 + frameCount * 32);
  }
  receive(size: CompositionResultSize) {
    if (
      ![size.characters, size.decodedBytes, size.nodes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw Error("Composition result descriptor is invalid");
    const lease = this.memory.reserve(
      "metadata",
      size.decodedBytes + 4 * size.characters + 262144,
    );
    let complete = false;
    return {
      complete: () => {
        lease.resize(size.decodedBytes);
        this.results.push(lease);
        complete = true;
      },
      dispose: () => {
        if (!complete) lease.release();
      },
    };
  }
  reserveText(characters: number) {
    return this.memory.reserve("metadata", characters * 4 + 256);
  }
  get statistics() {
    return {
      ...this.memory.statistics,
      scope: "export-result-rpc-and-summary-capacity" as const,
      limitBytes: COMPOSITION_NODE_MEMORY_ALLOWANCE,
    };
  }
  dispose() {
    this.results.length = 0;
    this.memory.dispose();
  }
}
