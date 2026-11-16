import { describe, expect, it } from "vitest";
import { cachedRecent } from "../../packages/renderer-core/src/recent-cache.ts";

describe("cachedRecent", () => {
  it("creates once per key and returns the cached value on a hit", () => {
    const map = new Map<string, number>();
    let created = 0;
    const get = (key: string) =>
      cachedRecent(
        map,
        key,
        4,
        () => ++created,
        () => undefined,
      );
    expect(get("a")).toBe(1);
    expect(get("a")).toBe(1);
    expect(created).toBe(1);
  });

  it("evicts the least recently used entry once full", () => {
    const map = new Map<string, string>();
    const evicted: string[] = [];
    const get = (key: string) =>
      cachedRecent(
        map,
        key,
        2,
        () => key,
        (value) => evicted.push(value),
      );
    get("a");
    get("b");
    get("a"); // "b" is now the least recently used
    get("c");
    expect(evicted).toEqual(["b"]);
    expect([...map.keys()]).toEqual(["a", "c"]);
  });

  it("never holds more than its limit, whatever the access pattern", () => {
    const map = new Map<number, number>();
    let live = 0;
    for (let frame = 0; frame < 50; frame++)
      for (let k = 0; k <= frame; k++)
        cachedRecent(
          map,
          frame * 100 + k,
          8,
          () => ++live,
          () => live--,
        );
    expect(map.size).toBe(8);
    expect(live).toBe(8);
  });
});
