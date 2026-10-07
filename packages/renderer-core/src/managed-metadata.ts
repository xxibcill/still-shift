import type { ManagedMemory, MemoryLease } from "./managed-memory.ts";
import { renderMemory } from "./managed-memory-context.ts";

export type MetadataReplacer = (
  this: unknown,
  key: string,
  value: unknown,
) => unknown;
export type ManagedMetadataText = {
  readonly value: string | undefined;
  retain(): void;
  release(): void;
};
type Serialization = { memory: ManagedMemory; temporary: MemoryLease[] };
let serialization: Serialization | undefined;
const textControlBytes = 128;
const metadataLeases = new WeakMap<object, MemoryLease>();

/** Declare container/entry capacity before the original metadata factory allocates it. */
export function allocateRenderMetadata<T extends object>(
  bytes: number,
  factory: () => T,
  retained = false,
  destroy?: (value: T) => void,
): T {
  const memory = renderMemory();
  if (!memory) return factory();
  const lease = memory.reserve("metadata", bytes, undefined, retained);
  let value: T | undefined;
  try {
    value = factory();
    const owner = value;
    memory.adopt(owner, lease, () => {
      metadataLeases.delete(owner);
      destroy?.(owner);
    });
    metadataLeases.set(owner, lease);
    return owner;
  } catch (error) {
    try {
      if (value && !memory.owns(value)) destroy?.(value);
    } catch {
      /* Preserve the original ownership/factory error. */
    }
    try {
      lease.release();
    } catch {
      /* Preserve the original factory/admission error. */
    }
    throw error;
  }
}
export function resizeRenderMetadata(value: object, bytes: number): void {
  const lease = metadataLeases.get(value);
  if (lease) lease.resize(bytes);
  else if (renderMemory())
    throw Error("Managed metadata container has no admitted owner");
}
export function releaseRenderMetadata(value: object): void {
  metadataLeases.get(value)?.release();
}

/** Keep normalization copies in the current serializer's temporary ownership. */
export function copySerializationMetadata<T extends object>(
  value: object,
  addedProperties: number,
  factory: () => T,
): T {
  const phase = serialization;
  if (!phase) return factory();
  let properties = addedProperties;
  for (const key in value) if (Object.hasOwn(value, key)) properties++;
  const lease = phase.memory.reserve("metadata", 64 + properties * 16);
  try {
    const result = factory();
    phase.memory.adopt(result, lease);
    phase.temporary.push(lease);
    return result;
  } catch (error) {
    lease.release();
    throw error;
  }
}

// JSON unboxes these after the replacer, including the original numeric/string coercion.
function unboxJsonPrimitive(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return value;
  try {
    return Boolean.prototype.valueOf.call(value);
  } catch {
    /* This object has no native Boolean data. */
  }
  let numeric = false;
  try {
    Number.prototype.valueOf.call(value);
    numeric = true;
  } catch {
    /* This object has no native Number data. */
  }
  // Keep original coercion outside the brand probe so its errors are preserved.
  return numeric ? +(value as unknown as number) : unboxJsonString(value);
}
function unboxJsonString(value: object): unknown {
  try {
    String.prototype.valueOf.call(value);
  } catch {
    return value;
  }
  return `${value}`;
}

/** The inactive renderer keeps native serialization; explicit owners can retain/release active output. */
export function serializeRenderMetadata(
  value: unknown,
  replacer?: MetadataReplacer,
): ManagedMetadataText {
  const memory = renderMemory();
  if (memory) return serializeManagedMetadata(memory, value, replacer);
  return {
    value: JSON.stringify(value, replacer),
    retain() {},
    release() {},
  };
}

/** Reserve the owned UTF16 output before native JSON emits each value; borrowed input getters/toJSON run once. */
export function serializeManagedMetadata(
  memory: ManagedMemory,
  value: unknown,
  replacer?: MetadataReplacer,
): ManagedMetadataText {
  const lease = memory.reserve("metadata", textControlBytes);
  const record: { value: string | undefined } = { value: "" };
  memory.adopt(record, lease, () => {
    record.value = undefined;
  });
  const previous = serialization;
  const phase: Serialization = { memory, temporary: [] };
  serialization = phase;
  let first = true,
    bytes = textControlBytes;
  const admit = (additional: number) => {
    bytes += additional;
    lease.resize(bytes);
  };
  try {
    const output = JSON.stringify(
      value,
      function (key: string, input: unknown) {
        const normalized = unboxJsonPrimitive(
          replacer ? replacer.call(this, key, input) : input,
        );
        if (!first) admit(2 * (6 * key.length + 4));
        first = false;
        if (typeof normalized === "string")
          admit(2 * (6 * normalized.length + 2));
        else if (typeof normalized === "number") admit(64);
        else if (typeof normalized === "boolean") admit(10);
        else if (
          normalized === null ||
          normalized === undefined ||
          typeof normalized === "function" ||
          typeof normalized === "symbol"
        )
          admit(8);
        else if (Array.isArray(normalized)) admit(2 * (normalized.length + 1));
        else if (typeof normalized === "object") admit(4);
        return normalized;
      },
    );
    record.value = output;
    if (output === undefined) lease.release();
    else lease.resize(textControlBytes + output.length * 2);
    return {
      get value() {
        return record.value;
      },
      retain() {
        memory.retain(record);
      },
      release() {
        lease.release();
      },
    };
  } catch (error) {
    try {
      lease.release();
    } catch {
      /* Preserve the original serialization failure. */
    }
    throw error;
  } finally {
    serialization = previous;
    for (const temporary of phase.temporary) temporary.release();
  }
}

/** Admit the shallow entry tuples, pointer arrays and result object before the original sort/copy. */
export function sortedMetadataObject(value: object): Record<string, unknown> {
  const phase = serialization;
  let lease: MemoryLease | undefined;
  if (phase) {
    let count = 0;
    for (const key in value) if (Object.hasOwn(value, key)) count++;
    lease = phase.memory.reserve("metadata", 128 + count * 128);
  }
  try {
    const result = Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    if (lease && phase) {
      phase.memory.adopt(result, lease);
      phase.temporary.push(lease);
    }
    return result;
  } catch (error) {
    try {
      lease?.release();
    } catch {
      /* Preserve the original getter/sort failure. */
    }
    throw error;
  }
}
