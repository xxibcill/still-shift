import type { CompositionNodeMemory } from "./composition-node-memory.ts";
/** Exact JSON character/UTF-8 count for plain data, including pretty whitespace.
 * Reject hooks/accessors/cycles before their producers can bypass admission.
 */
export function compositionNodeJsonSize(
  value: unknown,
  space = 0,
  suffix = "",
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isInteger(space) || space < 0 || space > 10)
    throw Error("Node JSON indentation is invalid");
  let characters = suffix.length,
    encodedBytes = Buffer.byteLength(suffix);
  const active = new Set<object>();
  const add = (chars: number, bytes = chars) => {
    characters += chars;
    encodedBytes += bytes;
    if (characters * 2 + encodedBytes + 256 > maximum)
      throw Error("Composition Node JSON exceeds its available capacity");
  };
  const string = (text: string) => {
    add(2);
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (
        code === 34 ||
        code === 92 ||
        code === 8 ||
        code === 9 ||
        code === 10 ||
        code === 12 ||
        code === 13
      )
        add(2);
      else if (code < 32) add(6);
      else if (code < 128) add(1);
      else if (code < 2048) add(1, 2);
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        text.charCodeAt(index + 1) >= 0xdc00 &&
        text.charCodeAt(index + 1) <= 0xdfff
      ) {
        add(2, 4);
        index++;
      } else if (code >= 0xd800 && code <= 0xdfff) add(6);
      else add(1, 3);
    }
  };
  const ignored = (item: unknown) =>
    item === undefined ||
    typeof item === "function" ||
    typeof item === "symbol";
  const visit = (item: unknown, depth: number) => {
    if (depth > 128) throw Error("Node JSON nesting exceeds 128");
    if (ignored(item) || item === null) {
      add(4);
      return;
    }
    if (typeof item === "string") {
      string(item);
      return;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item))
        throw Error("Node JSON number must be finite");
      add(String(item).length);
      return;
    }
    if (typeof item === "boolean") {
      add(item ? 4 : 5);
      return;
    }
    if (typeof item !== "object") throw Error("Node JSON requires plain data");
    if (active.has(item)) throw Error("Node JSON contains a cycle");
    const array = Array.isArray(item),
      prototype = Object.getPrototypeOf(item);
    if (array && prototype !== Array.prototype && prototype !== null)
      throw Error("Node JSON requires plain arrays");
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw Error("Node JSON requires plain data");
    const hook =
      Object.getOwnPropertyDescriptor(item, "toJSON") ??
      (!array
        ? Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
        : Object.getOwnPropertyDescriptor(Array.prototype, "toJSON"));
    if (hook && (!("value" in hook) || typeof hook.value === "function"))
      throw Error("Node JSON contains a serialization hook");
    active.add(item);
    add(2);
    let count = 0;
    const entry = (key: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor && !("value" in descriptor))
        throw Error("Node JSON contains an accessor");
      const child: unknown = descriptor?.value;
      if (!array && ignored(child)) return;
      if (count++) add(1);
      if (space) add(1 + (depth + 1) * space);
      if (!array) {
        string(key);
        add(space ? 2 : 1);
      }
      visit(child, depth + 1);
    };
    if (array)
      for (let index = 0; index < item.length; index++) entry(String(index));
    else for (const key in item) if (Object.hasOwn(item, key)) entry(key);
    if (count && space) add(1 + depth * space);
    active.delete(item);
  };
  if (ignored(value)) throw Error("Node JSON root must be serializable");
  visit(value, 0);
  add(0);
  return {
    characters,
    encodedBytes,
    capacityBytes: characters * 2 + encodedBytes + 256,
  };
}
export function serializeCompositionNodeJson(
  owner: CompositionNodeMemory,
  value: unknown,
  space = 0,
  suffix = "",
): {
  text: string;
  lease: ReturnType<CompositionNodeMemory["reserve"]>;
  size: ReturnType<typeof compositionNodeJsonSize>;
} {
  const scratch = owner.reserve(65536);
  try {
    const size = compositionNodeJsonSize(
        value,
        space,
        suffix,
        owner.availableBytes,
      ),
      lease = owner.reserve(size.capacityBytes);
    try {
      return { text: JSON.stringify(value, null, space) + suffix, lease, size };
    } catch (error) {
      lease.release();
      throw error;
    }
  } finally {
    scratch.release();
  }
}
