import { expect, it } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  serializeManagedMetadata,
  sortedMetadataObject,
} from "../../packages/renderer-core/src/managed-metadata.ts";

it("preserves complete native JSON strings, escapes, omission, holes, numbers and toJSON", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  const sparse = [undefined, null, undefined, -0, 1e-7];
  delete sparse[2];
  for (const input of [
    null,
    undefined,
    true,
    -0,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    NaN,
    Infinity,
    "ไทย\n\u0000\ud800",
    sparse,
    {
      omitted: undefined,
      function: () => {},
      symbol: Symbol("x"),
      value: 'a"\\b',
    },
    new Date("2026-10-08T00:00:00Z"),
  ]) {
    const text = serializeManagedMetadata(memory, input);
    expect(text.value).toBe(JSON.stringify(input));
    expect(memory.statistics.current.metadata).toBe(
      text.value === undefined ? 0 : 128 + text.value.length * 2,
    );
    text.release();
    expect(memory.statistics.reservations).toBe(0);
  }
  memory.dispose();
});
it("preserves sorted native output and invokes original getters and toJSON once", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  let getters = 0,
    conversions = 0;
  const value = {
    z: {
      toJSON() {
        conversions++;
        return { b: 2, a: 1 };
      },
    },
    get a() {
      getters++;
      return "ไทย";
    },
  };
  const replacer = (_key: string, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? sortedMetadataObject(item)
      : item;
  const text = serializeManagedMetadata(memory, value, replacer);
  expect(text.value).toBe('{"a":"ไทย","z":{"a":1,"b":2}}');
  expect(getters).toBe(1);
  expect(conversions).toBe(1);
  expect(memory.statistics.reservations).toBe(1);
  text.release();
  expect(memory.statistics.reservations).toBe(0);
  memory.dispose();
});
it("denies the original shallow sort/copy before getter invocation when its combined quota is unavailable", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 256 });
  let calls = 0;
  const input = {
    get value() {
      calls++;
      return "large";
    },
  };
  expect(() =>
    serializeManagedMetadata(memory, input, (_key, value) =>
      typeof value === "object" && value !== null
        ? sortedMetadataObject(value)
        : value,
    ),
  ).toThrow("aggregate worker quota");
  expect(calls).toBe(0);
  expect(memory.statistics.reservations).toBe(0);
  memory.dispose();
});
it("preserves original null getter errors and cyclic/native failures while releasing every started temporary", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  const cyclic: { next?: unknown } = {};
  cyclic.next = cyclic;
  for (const input of [
    {
      nested: {
        get failure() {
          throw null;
        },
      },
    },
    cyclic,
    1n,
  ]) {
    let reason: unknown = "not thrown";
    try {
      serializeManagedMetadata(
        memory,
        input,
        input === cyclic || typeof input === "bigint"
          ? undefined
          : (_key, value) =>
              value && typeof value === "object" && !Array.isArray(value)
                ? sortedMetadataObject(value)
                : value,
      );
    } catch (error) {
      reason = error;
    }
    expect(
      input === cyclic || typeof input === "bigint"
        ? reason instanceof TypeError
        : reason === null,
    ).toBe(true);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  }
  memory.dispose();
});
it("retains an admitted output across scratch and explicitly drops its owned reference on disposal", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  memory.beginScratch();
  const kept = serializeManagedMetadata(memory, { keep: true });
  kept.retain();
  const scratch = serializeManagedMetadata(memory, { temporary: true });
  memory.endScratch();
  expect(kept.value).toBe('{"keep":true}');
  expect(scratch.value).toBe(undefined);
  expect(memory.statistics.reservations).toBe(1);
  memory.dispose();
  expect(kept.value).toBe(undefined);
});
it("rejects oversized JSON output before its primitive emission and releases the controller", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 4096 });
  expect(() => serializeManagedMetadata(memory, "x".repeat(10000))).toThrow(
    "aggregate worker quota",
  );
  expect(memory.statistics.current.metadata).toBe(0);
  expect(memory.statistics.reservations).toBe(0);
  memory.dispose();
});
it("admits native boxed primitives and preserves their original coercion exactly once", () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  let calls = 0;
  const boxed = Object("original");
  boxed.toString = () => {
    calls++;
    return "ไทย\n\ud800";
  };
  const text = serializeManagedMetadata(memory, [
    boxed,
    Object(Number.MAX_VALUE),
    Object(false),
  ]);
  expect(text.value).toBe('["ไทย\\n\\ud800",1.7976931348623157e+308,false]');
  expect(calls).toBe(1);
  text.release();
  expect(() =>
    serializeManagedMetadata(memory, Object("x".repeat(10000))),
  ).toThrow("aggregate worker quota");
  expect(memory.statistics.reservations).toBe(0);
  memory.dispose();
});
it("preserves original boxed coercion failures and restores nested serialization ownership", () => {
  const outer = new ManagedMemory({ pixels: 1, metadata: 65536 });
  const inner = new ManagedMemory({ pixels: 1, metadata: 65536 });
  const value = Object(1);
  value.valueOf = () => {
    throw null;
  };
  let reason: unknown = "not thrown";
  try {
    serializeManagedMetadata(outer, value);
  } catch (error) {
    reason = error;
  }
  expect(reason).toBe(null);
  expect(outer.statistics.reservations).toBe(0);
  const text = serializeManagedMetadata(
    outer,
    { nested: { a: 1 } },
    function (_key, item) {
      if (item === 1) {
        const nested = serializeManagedMetadata(
          inner,
          { b: 2 },
          (_name, entry) =>
            entry && typeof entry === "object"
              ? sortedMetadataObject(entry)
              : entry,
        );
        expect(nested.value).toBe('{"b":2}');
        nested.release();
      }
      return item && typeof item === "object"
        ? sortedMetadataObject(item)
        : item;
    },
  );
  expect(text.value).toBe('{"nested":{"a":1}}');
  expect(inner.statistics.reservations).toBe(0);
  expect(outer.statistics.reservations).toBe(1);
  text.release();
  outer.dispose();
  inner.dispose();
});
