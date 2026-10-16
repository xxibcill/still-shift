import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "@still-shift/scene-contract";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../renderer-core/src/managed-memory.ts";
/** Admission failure does not imply that previously verified source/artifact bytes changed. */
export class CompositionNodeCapacityError extends Error {
  readonly code = "composition-node-capacity";
  readonly requestedBytes: number;
  readonly availableBytes: number;
  readonly path: string | undefined;
  constructor(
    requestedBytes: number,
    availableBytes: number,
    message = "Composition managed metadata exceed their aggregate worker quota",
    path?: string,
  ) {
    super(message);
    this.name = "CompositionNodeCapacityError";
    this.requestedBytes = requestedBytes;
    this.availableBytes = availableBytes;
    this.path = path;
  }
}
export function isCompositionNodeCapacityError(
  error: unknown,
): error is CompositionNodeCapacityError {
  return (
    error instanceof Error &&
    Object.getOwnPropertyDescriptor(error, "code")?.value ===
      "composition-node-capacity"
  );
}
/** One Node render retains source/catalogue and result capacities together.
 * Physical V8/Playwright/FFmpeg RSS remains an independent measurement.
 */
export class CompositionNodeMemory {
  private readonly memory: ManagedMemory;
  private closed = false;
  private readonly scoped: Set<MemoryLease> | undefined;
  private readonly parent: CompositionNodeMemory | undefined;
  constructor(parent?: CompositionNodeMemory) {
    this.parent = parent;
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
  /** A successful child hands its reservations to its immediate consumer. */
  transfer() {
    if (this.closed) throw Error("Composition Node memory owner is disposed");
    if (this.scoped && this.parent) {
      for (const lease of this.scoped) this.parent.retain(lease);
      this.scoped.clear();
    }
  }
  reserve(bytes: number) {
    if (this.closed) throw Error("Composition Node memory owner is disposed");
    if (
      Number.isSafeInteger(bytes) &&
      bytes >= 0 &&
      bytes > this.availableBytes
    )
      throw new CompositionNodeCapacityError(bytes, this.availableBytes);
    const lease = this.memory.reserve("metadata", bytes);
    this.retain(lease);
    return lease;
  }
  private retain(lease: MemoryLease) {
    if (this.closed) throw Error("Composition Node memory owner is disposed");
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
