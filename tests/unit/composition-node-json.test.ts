import { expect, it } from "vitest";
import { CompositionNodeMemory } from "../../packages/execution-runtime/src/composition-node-memory.ts";
import {
  compositionNodeJsonSize,
  serializeCompositionNodeJson,
} from "../../packages/execution-runtime/src/composition-node-json.ts";
it("counts actual JSON/UTF-8 including escapes, Unicode, holes and pretty whitespace", () => {
  const holes = [undefined, undefined, 3];
  Reflect.deleteProperty(holes, "1");
  const cases = [
    {
      value: [
        0,
        -0,
        1e21,
        true,
        null,
        undefined,
        "Thai ภาษาไทย",
        "😀",
        "\ud800",
        '\u0000\b\t\n\f\r\\"',
      ],
    },
    holes,
    { ignored: undefined, hookName: { toJSON: 12 } },
    {},
    [],
  ];
  for (const value of cases)
    for (const space of [0, 2, 10]) {
      const text = JSON.stringify(value, null, space) + "\n",
        size = compositionNodeJsonSize(value, space, "\n");
      expect(size.characters).toBe(text.length);
      expect(size.encodedBytes).toBe(Buffer.byteLength(text));
      expect(size.capacityBytes).toBe(
        text.length * 2 + Buffer.byteLength(text) + 256,
      );
    }
});
it("rejects hidden serialization producers and cycles without invoking them", () => {
  let reads = 0;
  for (const value of [
    {
      get value() {
        reads++;
        return 1;
      },
    },
    {
      toJSON() {
        reads++;
        return "expanded";
      },
    },
  ])
    expect(() => compositionNodeJsonSize(value)).toThrow(
      /accessor|serialization hook/,
    );
  const inherited = [1];
  Object.setPrototypeOf(inherited, {
    toJSON() {
      reads++;
      return "expanded";
    },
  });
  expect(() => compositionNodeJsonSize(inherited)).toThrow(/plain arrays/);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => compositionNodeJsonSize(cycle)).toThrow(/cycle/);
  expect(reads).toBe(0);
});
it("admits serialization before generating its text and retires its lease", () => {
  const owner = new CompositionNodeMemory(),
    held = owner.reserve(511 * 1024 ** 2);
  expect(() =>
    serializeCompositionNodeJson(owner, { text: "x".repeat(1024 ** 2) }),
  ).toThrow(/available capacity/);
  expect(owner.statistics.current.metadata).toBe(held.bytes);
  const value = { text: "ภาษาไทย😀", numbers: [1, 2, 3] },
    result = serializeCompositionNodeJson(owner, value, 2, "\n");
  expect(result.text).toBe(JSON.stringify(value, null, 2) + "\n");
  expect(owner.statistics.current.metadata).toBe(
    held.bytes + result.size.capacityBytes,
  );
  result.lease.release();
  expect(owner.statistics.current.metadata).toBe(held.bytes);
  owner.dispose();
});
it("child producer failure and successful transfer preserve unrelated owners", () => {
  const parent = new CompositionNodeMemory(),
    foreign = parent.reserve(1024),
    failed = new CompositionNodeMemory(parent);
  failed.reserve(4096);
  failed.dispose();
  expect(parent.statistics.current.metadata).toBe(foreign.bytes);
  const complete = new CompositionNodeMemory(parent);
  complete.reserve(8192);
  complete.transfer();
  complete.dispose();
  expect(parent.statistics.current.metadata).toBe(9216);
  expect(() => complete.reserve(1)).toThrow(/disposed/);
  parent.dispose();
  expect(parent.statistics.reservations).toBe(0);
});
