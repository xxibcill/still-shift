export type CompositionResultSize = {
  characters: number;
  decodedBytes: number;
  nodes: number;
};
export const COMPOSITION_RESULT_CHUNK_CHARACTERS = 65536;

/** Count serialized occurrences, including aliases, without materializing JSON.
 * The result protocol accepts plain data only; accessors/cycles cannot expand it
 * between admission and serialization. Bounds include worst-case JSON escaping.
 */
export function compositionResultSize(value: unknown): CompositionResultSize {
  const active = new Set<object>();
  let characters = 0,
    decodedBytes = 0,
    nodes = 0;
  const visit = (item: unknown, depth: number) => {
    if (depth > 64 || ++nodes > 2_000_000)
      throw Error("Composition result exceeds its structural bound");
    if (typeof item === "string") {
      characters += 2 + 6 * item.length;
      decodedBytes += 32 + 2 * item.length;
    } else if (typeof item === "number") {
      if (!Number.isFinite(item))
        throw Error("Composition result contains a non-finite number");
      characters += 24;
      decodedBytes += 8;
    } else if (
      item === null ||
      item === undefined ||
      typeof item === "boolean"
    ) {
      characters += 5;
      decodedBytes += 8;
    } else if (typeof item === "object") {
      if (active.has(item)) throw Error("Composition result contains a cycle");
      if (Object.getOwnPropertyDescriptor(item, "toJSON"))
        throw Error("Composition result contains a serialization hook");
      const array = Array.isArray(item);
      if (
        !array &&
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      )
        throw Error("Composition result is not plain data");
      active.add(item);
      characters += 2;
      decodedBytes += 64;
      const inspect = (key: string) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !("value" in descriptor))
          throw Error("Composition result contains an accessor or hole");
        if (!array) {
          characters += 4 + 6 * key.length;
          decodedBytes += 48 + 2 * key.length;
        } else decodedBytes += 8;
        characters += 1;
        visit(descriptor.value, depth + 1);
      };
      if (array) {
        if (item.length > 108000)
          throw Error("Composition result array exceeds its frame bound");
        for (let index = 0; index < item.length; index++)
          inspect(String(index));
      } else {
        const keys = Object.keys(item);
        if (keys.length > 4096)
          throw Error("Composition result object exceeds its field bound");
        for (const key of keys) inspect(key);
      }
      active.delete(item);
    } else throw Error("Composition result contains a non-data value");
    if (characters > 256 * 1024 ** 2 || decodedBytes > 256 * 1024 ** 2)
      throw Error("Composition result exceeds its storage bound");
  };
  visit(value, 0);
  return { characters, decodedBytes, nodes };
}
