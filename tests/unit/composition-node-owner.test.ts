import { expect, it } from "vitest";
import { CompositionNodeMemory } from "../../packages/execution-runtime/src/composition-node-memory.ts";
import { CompositionResultBudget } from "../../packages/execution-runtime/src/composition-result-budget.ts";
import { NativeSourceAdmission } from "../../packages/animation-engine/src/native-source-admission.ts";
import {
  nativePreparationCapacity,
  nativeSourceDataCapacity,
} from "../../packages/animation-engine/src/native-preparation-capacity.ts";
import { binaryCompositionFixture } from "../helpers/native-pbr-binary-composition-fixture.ts";
import { MechanismSceneV3Schema } from "@still-shift/scene-contract";

it("source and result/RPC capacities contend for one fixed allowance", () => {
  const fake = { reserve: () => undefined } as unknown as CompositionNodeMemory;
  expect(() => new CompositionResultBudget(11, fake)).toThrow(
    /Invalid composition Node memory owner/,
  );
  expect(() => new NativeSourceAdmission(fake)).toThrow(
    /Invalid composition Node memory owner/,
  );
  const owner = new CompositionNodeMemory(),
    source = owner.reserve(500 * 1024 ** 2),
    results = new CompositionResultBudget(11, owner);
  expect(results.statistics.scope).toBe(
    "composition-node-source-and-result-capacity",
  );
  expect(() => results.reserveTransient(16 * 1024 ** 2)).toThrow(/quota/);
  const transient = results.reserveTransient(1024 ** 2);
  transient.release();
  results.dispose();
  expect(source.active).toBe(true);
  expect(owner.statistics.current.metadata).toBe(500 * 1024 ** 2);
  source.release();
  owner.dispose();
  expect(owner.statistics.current.metadata).toBe(0);
});
it("retains source admission without a release gap before catalogue construction", () => {
  const owner = new CompositionNodeMemory(),
    foreign = owner.reserve(1024),
    input = new NativeSourceAdmission(owner),
    row = input.begin("assets.source");
  row.admitBody(64);
  row.admitTree('{"id":"source"}');
  row.complete();
  row.dispose();
  const previous = owner.statistics.current.metadata;
  expect(() => input.admitPreparation(512 * 1024 ** 2)).toThrow(
    /shared Node allowance/,
  );
  expect(owner.statistics.current.metadata).toBe(previous);
  input.admitPreparation(2 * 1024 ** 2);
  input.transferPreparation();
  input.dispose();
  expect(owner.statistics.current.metadata).toBe(2 * 1024 ** 2 + 1024);
  expect(foreign.active).toBe(true);
  owner.dispose();
  expect(owner.statistics.reservations).toBe(0);
});
it("failed catalogue construction releases local admission while preserving a foreign owner", () => {
  const owner = new CompositionNodeMemory(),
    foreign = owner.reserve(1024),
    input = new NativeSourceAdmission(owner),
    row = input.begin("assets.source");
  row.admitBody(64);
  row.admitTree('{"id":"source"}');
  row.complete();
  row.dispose();
  input.admitPreparation(2 * 1024 ** 2);
  input.dispose();
  expect(owner.statistics.current.metadata).toBe(1024);
  expect(foreign.active).toBe(true);
  owner.dispose();
});
it("admits actual source3 variant metadata without multiplying static mesh storage", () => {
  const fixture = binaryCompositionFixture(),
    source = MechanismSceneV3Schema.parse(JSON.parse(fixture.sourceBytes)),
    entries = { lever: { source } };
  const base = nativePreparationCapacity(fixture.composition, entries),
    metadata = nativeSourceDataCapacity(source, source.geometry.meshes);
  const layer = fixture.composition.layers.find(
    (item) => item.type === "native3d",
  )!;
  if (layer.type !== "native3d") throw Error("fixture layer");
  fixture.composition.layers.push({
    ...layer,
    id: "static.edit",
    pbrMaterialOverrides: {
      [source.geometry.materials[0]!.id]: { roughnessFactor: 0.8 },
    },
  });
  expect(nativePreparationCapacity(fixture.composition, entries) - base).toBe(
    metadata * 4,
  );
  const edited = nativePreparationCapacity(fixture.composition, entries);
  fixture.composition.layers.push({
    ...layer,
    id: "empty.alias",
    partOverrides: { [source.parts[0]!.id]: {} },
  });
  expect(nativePreparationCapacity(fixture.composition, entries)).toBe(edited);
});
it("retires repeated result transients rather than retaining their control records", () => {
  const owner = new CompositionNodeMemory(),
    results = new CompositionResultBudget(11, owner),
    initial = owner.statistics.current.metadata;
  for (let index = 0; index < 9000; index++)
    results.reserveTransient(256).release();
  expect(owner.statistics.current.metadata).toBe(initial);
  expect(owner.statistics.reservations).toBe(1);
  results.dispose();
  expect(owner.statistics.reservations).toBe(0);
  owner.dispose();
});

it("keeps conservative lexical admission when escapes exceed the decoded plan", () => {
  const owner = new CompositionNodeMemory(),
    input = new NativeSourceAdmission(owner),
    row = input.begin("assets.escaped");
  const text = '{"id":"' + "\\u0061".repeat(64) + '"}';
  row.admitBody(text.length + 1);
  row.admitTree(text);
  row.complete();
  row.dispose();
  const held = owner.statistics.current.metadata;
  input.admitPreparation(1);
  input.transferPreparation();
  expect(owner.statistics.current.metadata).toBe(held);
  input.dispose();
  expect(owner.statistics.current.metadata).toBeGreaterThan(0);
  owner.dispose();
});
