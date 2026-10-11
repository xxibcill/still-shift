import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "@still-shift/scene-contract";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { type MemoryLease } from "../../renderer-core/src/managed-memory.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const SCANNER_BYTES = 65536;
const PARSE_COPIES = 8;
const RETAINED_COPIES = 4;
const MAX_DEPTH = 128;

/** Storage capacity, not engine RSS. Scan without token arrays or decoded keys.
 * Whitespace contributes to admitted text storage, not to decoded tree capacity.
 * Syntax and authored schemas are still checked by their original parsers.
 */
export function nativeJsonTreeCapacity(
  text: string,
  maximum: number,
  location: string,
) {
  let bytes = 0,
    depth = 0;
  const add = (count: number) => {
    bytes += count;
    if (!Number.isSafeInteger(bytes) || bytes > maximum)
      passageError(
        "comp-native3d-limit",
        "Native JSON exceeds its admitted Node source capacity",
        { path: location },
      );
  };
  for (let index = 0; index < text.length; ) {
    const code = text.charCodeAt(index);
    if (
      code === 32 ||
      code === 9 ||
      code === 10 ||
      code === 13 ||
      code === 44 ||
      code === 58
    ) {
      index++;
      continue;
    }
    if (code === 123 || code === 91) {
      if (++depth > MAX_DEPTH)
        passageError("comp-native3d-limit", "Native JSON nesting exceeds 128", {
          path: location,
        });
      add(code === 123 ? 208 : 80);
      index++;
      continue;
    }
    if (code === 125 || code === 93) {
      depth--;
      index++;
      continue;
    }
    if (code === 34) {
      const start = ++index;
      while (index < text.length && text.charCodeAt(index) !== 34) {
        index += text.charCodeAt(index) === 92 ? 2 : 1;
      }
      add(80 + Math.min(index - start, text.length - start) * 2);
      if (index < text.length) index++;
      let next = index;
      while (next < text.length && /[ \t\r\n]/.test(text[next]!)) next++;
      if (text.charCodeAt(next) === 58) add(64);
      continue;
    }
    // One primitive slot; do not allocate a substring for numbers/literals.
    add(16);
    index++;
    while (index < text.length) {
      const next = text.charCodeAt(index);
      if (
        next === 44 ||
        next === 93 ||
        next === 125 ||
        next === 58 ||
        next === 32 ||
        next === 9 ||
        next === 10 ||
        next === 13 ||
        next === 34 ||
        next === 91 ||
        next === 123
      )
        break;
      index++;
    }
  }
  return Math.max(bytes, 16);
}

/** One composition's input stage uses the original 512 MiB Node allowance.
 * Eight tree capacities cover parse/validation staging; four stay admitted for
 * earlier asset entries. Preparation variants and export results are separate.
 */
export class NativeSourceAdmission {
  private readonly memory: CompositionNodeMemory;
  private readonly shared: boolean;
  private readonly owned = new Set<MemoryLease>();
  private readonly retained: MemoryLease[] = [];
  private preparation: MemoryLease | undefined;
  constructor(owner?: CompositionNodeMemory) {
    if (owner !== undefined && !(owner instanceof CompositionNodeMemory))
      throw Error("Invalid composition Node memory owner");
    this.memory = owner ?? new CompositionNodeMemory();
    this.shared = owner !== undefined;
    this.reserve(SCANNER_BYTES, "preparedNative3D");
  }
  private reserve(bytes: number, location: string): MemoryLease {
    try {
      const lease = this.memory.reserve(bytes);
      this.owned.add(lease);
      return lease;
    } catch {
      passageError(
        "comp-native3d-limit",
        "Native inputs exceed the composition Node source allowance",
        { path: location },
      );
    }
  }
  begin(location: string) {
    let body: MemoryLease | undefined,
      tree: MemoryLease | undefined,
      complete = false;
    return {
      admitBody: (bytes: number) => {
        if (body) throw Error("Native source body already admitted");
        body = this.reserve(bytes * 3 + 128, location);
      },
      admitTree: (text: string) => {
        if (!body || tree)
          throw Error("Native source tree admission order is invalid");
        const available = this.memory.availableBytes;
        const capacity = nativeJsonTreeCapacity(
          text,
          Math.floor(available / PARSE_COPIES),
          location,
        );
        tree = this.reserve(capacity * PARSE_COPIES, location);
      },
      complete: () => {
        if (!tree || complete)
          throw Error("Native source completion requires an admitted tree");
        tree.resize((tree.bytes / PARSE_COPIES) * RETAINED_COPIES);
        this.retained.push(tree);
        complete = true;
      },
      dispose: () => {
        body?.release();
        if (!complete) tree?.release();
      },
    };
  }
  /** Grow the existing ingestion admission before any catalogue producer.
   * Keep admission continuously; never release old capacity to test a new limit.
   */
  admitPreparation(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 1)
      throw Error("Native preparation capacity is invalid");
    const first = this.retained[0];
    if (!first)
      throw Error("Native preparation requires admitted source entries");
    const prior = this.retained.reduce((sum, lease) => sum + lease.bytes, 0);
    // Escaped source strings can make the lexical estimate larger than the
    // decoded plan. Keep that already-admitted capacity instead of rejecting.
    bytes = Math.max(bytes, prior);
    try {
      first.resize(first.bytes + bytes - prior);
    } catch {
      passageError(
        "comp-native3d-limit",
        "Prepared native catalogues exceed the shared Node allowance",
        { path: "preparedNative3D" },
      );
    }
    for (const lease of this.retained.slice(1)) {
      lease.release();
      this.owned.delete(lease);
    }
    first.resize(bytes);
    this.retained.length = 0;
    this.preparation = first;
  }
  transferPreparation() {
    if (!this.preparation)
      throw Error("Native preparation has no admitted owner");
    if (this.shared) this.owned.delete(this.preparation);
  }
  get statistics() {
    return {
      ...this.memory.statistics,
      scope: "native-source-json-ingestion-capacity" as const,
      limitBytes: COMPOSITION_NODE_MEMORY_ALLOWANCE,
      parseCopies: PARSE_COPIES,
      retainedCopies: RETAINED_COPIES,
      maximumDepth: MAX_DEPTH,
      sharedNodeOwner: this.shared,
    };
  }
  get preparationStatistics() {
    return this.memory.statistics;
  }
  dispose() {
    for (const lease of this.owned) lease.release();
    this.owned.clear();
    this.retained.length = 0;
    if (!this.shared) this.memory.dispose();
  }
}
