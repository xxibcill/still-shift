import {
  CompositionNodeCapacityError,
  isCompositionNodeCapacityError,
} from "@still-shift/execution-runtime/export";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { expect, it } from "vitest";
import {
  NativeSourceAdmission,
  nativeJsonTreeCapacity,
} from "../../packages/animation-engine/src/native-source-admission.ts";
import { COMPOSITION_NODE_MEMORY_ALLOWANCE } from "@still-shift/scene-contract";

it("counts decoded structure independently of whitespace and escaped punctuation", () => {
  const text = JSON.stringify({
    key: [1, true, null, 'a"[{}]', { nested: 2 }],
  });
  const bytes = nativeJsonTreeCapacity(text, 100000, "assets.fixture");
  expect(bytes).toBeGreaterThan(text.length);
  expect(
    nativeJsonTreeCapacity(" \n\t" + text + " \r", 100000, "assets.fixture"),
  ).toBe(bytes);
  expect(JSON.parse(text).key).toHaveLength(5);
  expect(() =>
    nativeJsonTreeCapacity(text, bytes - 1, "assets.fixture"),
  ).toThrow(CompositionNodeCapacityError);
});
it("rejects deeply nested valid JSON before its parser can create the tree", () => {
  const text = "[".repeat(129) + "0" + "]".repeat(129);
  expect(() => nativeJsonTreeCapacity(text, 100000, "assets.nested")).toThrow(
    /nesting exceeds 128/,
  );
  expect(
    nativeJsonTreeCapacity(
      "[".repeat(128) + "0" + "]".repeat(128),
      100000,
      "assets.nested",
    ),
  ).toBe(128 * 80 + 16);
});
it("admits body/decode before parse staging and retains preceding source entries", () => {
  const budget = new NativeSourceAdmission(),
    before = budget.statistics.current.metadata;
  const first = budget.begin("assets.first"),
    text = '{"value":[1,2,3]}';
  first.admitBody(text.length + 1);
  expect(budget.statistics.current.metadata).toBe(
    before + (text.length + 1) * 3 + 128,
  );
  first.admitTree(text);
  const capacity = nativeJsonTreeCapacity(text, 100000, "assets.first");
  expect(budget.statistics.current.metadata).toBe(
    before + (text.length + 1) * 3 + 128 + capacity * 8,
  );
  first.complete();
  first.dispose();
  expect(budget.statistics.current.metadata).toBe(before + capacity * 4);
  const second = budget.begin("assets.second");
  expect(() => second.admitBody(COMPOSITION_NODE_MEMORY_ALLOWANCE / 3)).toThrow(
    /composition Node source allowance/,
  );
  second.dispose();
  expect(budget.statistics.current.metadata).toBe(before + capacity * 4);
  expect(budget.statistics.limitBytes).toBe(512 * 1024 ** 2);
  budget.dispose();
  expect(budget.statistics.current.metadata).toBe(0);
  expect(budget.statistics.reservations).toBe(0);
});
it("releases failed and cancelled input-stage capacities without losing preceding admission", () => {
  const budget = new NativeSourceAdmission(),
    before = budget.statistics.current.metadata;
  for (const withTree of [false, true]) {
    const input = budget.begin("assets.cancelled");
    input.admitBody(512);
    if (withTree) input.admitTree('{"value":1}');
    input.dispose();
    input.dispose();
    expect(budget.statistics.current.metadata).toBe(before);
  }
  budget.dispose();
});
it("bounds dense numeric JSON before any decoded numeric array is allocated", () => {
  const budget = new NativeSourceAdmission(),
    input = budget.begin("assets.dense");
  const text = "[" + "0,".repeat(5000000) + "0]";
  input.admitBody(text.length + 1);
  expect(() => input.admitTree(text)).toThrow(/Node source capacity/);
  input.dispose();
  budget.dispose();
  expect(budget.statistics.current.metadata).toBe(0);
});

it("retains native diagnostic codes and locations alongside typed capacity rejection", () => {
  const location = "assets.fixture";
  let failure: unknown;
  try {
    nativeJsonTreeCapacity("[0]", 1, location);
  } catch (error) {
    failure = error;
  }
  expect(isCompositionNodeCapacityError(failure)).toBe(true);
  expect(passageDiagnostics(failure)).toEqual([
    {
      code: "comp-native3d-limit",
      severity: "error",
      message: "Native JSON exceeds its admitted Node source capacity",
      path: location,
    },
  ]);
});
