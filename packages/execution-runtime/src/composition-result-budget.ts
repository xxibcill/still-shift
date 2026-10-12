import { serializeCompositionNodeJson } from "./composition-node-json.ts";
import type { MemoryLease } from "../../renderer-core/src/managed-memory.ts";
import { CompositionNodeMemory } from "./composition-node-memory.ts";
import type { CompositionResultSize } from "./composition-result-size.ts";

/** Export-owned result/RPC/summary storage; returned metrics transfer to the caller.
 * Native V8/Playwright/FFmpeg RSS is measured independently of these capacities.
 */
export class CompositionResultBudget {
  private readonly memory: CompositionNodeMemory;
  private readonly shared: boolean;
  private readonly owned = new Set<MemoryLease>();
  private readonly results: MemoryLease[] = [];
  constructor(frameCount: number, owner?: CompositionNodeMemory) {
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount < 1 ||
      frameCount > 108000
    )
      throw Error("Composition result frame bound is invalid");
    if (owner !== undefined && !(owner instanceof CompositionNodeMemory))
      throw Error("Invalid composition Node memory owner");
    this.memory = owner ?? new CompositionNodeMemory();
    this.shared = owner !== undefined;
    // Receiver chunks, descriptors and exact-P95 arrays/sort workspace.
    this.reserve(4 * 1024 ** 2 + frameCount * 32);
  }
  receive(size: CompositionResultSize) {
    if (
      ![size.characters, size.decodedBytes, size.nodes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw Error("Composition result descriptor is invalid");
    const lease = this.reserve(
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
  serializeJson(value: unknown, space = 0, suffix = "") {
    const result = serializeCompositionNodeJson(
      this.memory,
      value,
      space,
      suffix,
    );
    this.track(result.lease);
    return result;
  }
  retainText(text: string) {
    return { text, lease: this.reserve(Buffer.byteLength(text) + 256) };
  }
  reserveText(characters: number) {
    return this.reserve(characters * 4 + 256);
  }
  reserveTransient(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 1)
      throw Error("Composition transient metadata capacity is invalid");
    return this.reserve(bytes);
  }
  private reserve(bytes: number) {
    const lease = this.memory.reserve(bytes);
    this.track(lease);
    return lease;
  }
  private track(lease: MemoryLease) {
    this.owned.add(lease);
    const release = lease.release;
    lease.release = () => {
      try {
        release();
      } finally {
        this.owned.delete(lease);
      }
    };
  }
  get statistics() {
    return {
      ...this.memory.statistics,
      scope: this.shared
        ? ("composition-node-source-and-result-capacity" as const)
        : ("export-result-rpc-and-summary-capacity" as const),
    };
  }
  dispose() {
    this.results.length = 0;
    for (const lease of this.owned) lease.release();
    this.owned.clear();
    if (!this.shared) this.memory.dispose();
  }
}
