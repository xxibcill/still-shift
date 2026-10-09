import { expect, it } from "vitest";
import {
  compositionResultSize,
  COMPOSITION_RESULT_CHUNK_CHARACTERS,
} from "../../packages/execution-runtime/src/composition-result-size.ts";
import { CompositionResultBudget } from "../../packages/execution-runtime/src/composition-result-budget.ts";
import { CompositionExportMemory } from "../../packages/execution-runtime/src/composition-export-memory.ts";

it("bounds escaped JSON and counts repeated aliases as transferred copies", () => {
  const row = { text: '\u0000\n😀"', value: 1e-300, missing: undefined };
  const single = compositionResultSize(row);
  const repeated = compositionResultSize({ first: row, second: row });
  expect(single.characters).toBeGreaterThanOrEqual(JSON.stringify(row).length);
  expect(repeated.decodedBytes).toBeGreaterThan(single.decodedBytes * 2);
  expect(repeated.characters).toBeGreaterThanOrEqual(
    JSON.stringify({ first: row, second: row }).length,
  );
});
it("rejects getters and cycles without invoking their producers", () => {
  let reads = 0;
  expect(() =>
    compositionResultSize({
      get value() {
        reads++;
        return 1;
      },
    }),
  ).toThrow(/accessor/);
  expect(reads).toBe(0);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => compositionResultSize(cycle)).toThrow(/cycle/);
  expect(() => compositionResultSize([Infinity])).toThrow(/non-finite/);
});
it("admits transfer staging first and retains decoded results until handoff", () => {
  const budget = new CompositionResultBudget(108000);
  const initial = budget.statistics.current.metadata;
  const size = compositionResultSize({
    frames: Array.from({ length: 108000 }, (_, index) => ({
      index,
      renderMs: 1.25,
      uploadMs: 0.5,
    })),
  });
  const transfer = budget.receive(size);
  expect(budget.statistics.current.metadata).toBe(
    initial + size.decodedBytes + 4 * size.characters + 262144,
  );
  transfer.complete();
  transfer.dispose();
  expect(budget.statistics.current.metadata).toBe(initial + size.decodedBytes);
  expect(() => budget.reserveText(512 * 1024 ** 2)).toThrow(/quota/);
  budget.dispose();
  expect(budget.statistics.current.metadata).toBe(0);
});
it("retains admitted JSON and chunk storage through browser acknowledgement", async () => {
  const memory = new CompositionExportMemory();
  const value = {
    text: "x".repeat(COMPOSITION_RESULT_CHUNK_CHARACTERS + 13),
    rows: [{ value: 1 }],
  };
  await memory.run(4, async () => value);
  const size = await memory.prepareTransfer(value);
  expect(size.memory.current.metadata).toBeGreaterThan(size.characters * 2);
  const chunks = [];
  for (
    let offset = 0;
    offset < size.characters;
    offset += COMPOSITION_RESULT_CHUNK_CHARACTERS
  )
    chunks.push(await memory.readTransfer(offset));
  expect(JSON.parse(chunks.join(""))).toEqual(value);
  expect((await memory.acknowledge()).current).toEqual({
    pixels: 0,
    metadata: 0,
  });
  await expect(memory.readTransfer(0)).rejects.toThrow(/offset/);
});

it("rejects hidden serialization hooks before invoking them", () => {
  let calls = 0;
  for (const value of [{}, []]) {
    Object.defineProperty(value, "toJSON", {
      value: () => {
        calls++;
        return "expanded";
      },
    });
    expect(() => compositionResultSize(value)).toThrow(/serialization hook/);
  }
  expect(calls).toBe(0);
});
