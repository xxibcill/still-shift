import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "@still-shift/scene-contract";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../renderer-core/src/managed-memory.ts";
/** One Node render retains source/catalogue and result capacities together.
 * Physical V8/Playwright/FFmpeg RSS remains an independent measurement.
 */
export class CompositionNodeMemory {
  private readonly memory: ManagedMemory;
  private closed = false;
  private readonly scoped: Set<MemoryLease> | undefined;
  constructor(parent?: CompositionNodeMemory) {
    if (parent !== undefined && !(parent instanceof CompositionNodeMemory))
      throw Error("Invalid composition Node memory owner");
    this.memory = parent
      ? parent.memory
      : new ManagedMemory({
          pixels: 1,
          metadata: COMPOSITION_NODE_MEMORY_ALLOWANCE - 1,
        });
    this.scoped = parent ? new Set() : undefined;
  }
  /** A successful child hands its reservations to the render owner. */
  transfer() {
    this.scoped?.clear();
  }
  reserve(bytes: number) {
    if (this.closed) throw Error("Composition Node memory owner is disposed");
    const lease = this.memory.reserve("metadata", bytes);
    if (this.scoped) {
      this.scoped.add(lease);
      const release = lease.release;
      lease.release = () => {
        try {
          release();
        } finally {
          this.scoped?.delete(lease);
        }
      };
    }
    return lease;
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
    if (this.closed) return;
    this.closed = true;
    if (this.scoped) {
      for (const lease of this.scoped) lease.release();
      this.scoped.clear();
    } else this.memory.dispose();
  }
}
