import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "@still-shift/scene-contract";
import { ManagedMemory } from "../../renderer-core/src/managed-memory.ts";
/** One Node render retains source/catalogue and result capacities together.
 * Physical V8/Playwright/FFmpeg RSS remains an independent measurement.
 */
export class CompositionNodeMemory {
  private readonly memory = new ManagedMemory({
    pixels: 1,
    metadata: COMPOSITION_NODE_MEMORY_ALLOWANCE - 1,
  });
  reserve(bytes: number) {
    return this.memory.reserve("metadata", bytes);
  }
  get availableBytes() {
    return (
      this.memory.limits.metadata - this.memory.statistics.current.metadata
    );
  }
  get statistics() {
    return {
      ...this.memory.statistics,
      scope: "composition-node-source-and-result-capacity" as const,
      limitBytes: COMPOSITION_NODE_MEMORY_ALLOWANCE,
    };
  }
  dispose() {
    this.memory.dispose();
  }
}
