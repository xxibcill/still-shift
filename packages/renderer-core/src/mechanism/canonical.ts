/** Deterministic JSON for hash binding. Arrays retain index order; object keys sort. */
export function canonicalMechanismJson(value: unknown): string {
  const ancestors = new WeakSet<object>();
  function encode(input: unknown, depth: number): string {
    if (depth > 64)
      throw new TypeError("Mechanism canonical JSON nesting exceeds 64 levels");
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean")
      return JSON.stringify(input);
    if (typeof input === "number" && Number.isFinite(input))
      return JSON.stringify(input);
    if (typeof input !== "object")
      throw new TypeError("Mechanism canonical JSON requires finite JSON data");
    if (ancestors.has(input))
      throw new TypeError("Mechanism canonical JSON cannot contain cycles");
    if (
      !Array.isArray(input) &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    )
      throw new TypeError("Mechanism canonical JSON requires plain objects");
    if (
      Array.isArray(input) &&
      Array.from({ length: input.length }, (_, index) =>
        Object.hasOwn(input, index),
      ).some((present) => !present)
    )
      throw new TypeError(
        "Mechanism canonical JSON cannot contain sparse arrays",
      );
    ancestors.add(input);
    const encoded = Array.isArray(input)
      ? `[${input.map((item) => encode(item, depth + 1)).join(",")}]`
      : `{${Object.keys(input)
          .sort()
          .filter(
            (key) => (input as Record<string, unknown>)[key] !== undefined,
          )
          .map(
            (key) =>
              `${JSON.stringify(key)}:${encode((input as Record<string, unknown>)[key], depth + 1)}`,
          )
          .join(",")}}`;
    ancestors.delete(input);
    return encoded;
  }
  return encode(value, 0);
}
