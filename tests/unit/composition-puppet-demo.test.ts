import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { evaluateComp, bakeExpressions } from "@still-shift/renderer-core";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
const fixture = (name: string): Composition =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../examples/composition/12-puppet-acting/${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
it("authors the acting demo with only animated pins, fixed art and fixed transforms", () => {
  const comp = fixture("composition");
  expect(validateComposition(comp).ok).toBe(true);
  expect(comp.layers).toHaveLength(2);
  const rest = evaluateComp(comp, 0);
  for (let frame = 0; frame < comp.frameCount; frame++) {
    const current = evaluateComp(comp, frame);
    for (let i = 0; i < 2; i++) {
      expect(current.layers[i]!.transform).toEqual(rest.layers[i]!.transform);
      expect(current.layers[i]!.effects[0]!.params.rest).toEqual(
        rest.layers[i]!.effects[0]!.params.rest,
      );
    }
  }
  for (const i of [0, 1])
    expect(
      evaluateComp(comp, 23).layers[i]!.effects[0]!.params.pins,
    ).not.toEqual(rest.layers[i]!.effects[0]!.params.pins);
});
it("drives the hand from a constrained helper and the elbow from an expression", () => {
  const comp = fixture("prop-follow");
  expect(validateComposition(comp).ok).toBe(true);
  const baked = bakeExpressions(comp);
  expect(baked.ok).toBe(true);
  if (!baked.ok) return;
  for (let frame = 0; frame < comp.frameCount; frame++) {
    const state = evaluateComp(comp, frame);
    const actor = state.layers.find((l) => l.id === "actor")!;
    const prop = state.layers.find((l) => l.id === "prop")!;
    const helper = state.layers.find((l) => l.id === "hand-target")!;
    const pins = actor.effects[0]!.params.pins as number[][];
    expect(helper.transform.position).toEqual(prop.transform.position);
    expect(pins[5]![0]! + 16).toBeCloseTo(prop.transform.position[0], 10);
    expect(pins[5]![1]! + 20).toBeCloseTo(prop.transform.position[1], 10);
    expect(pins[4]![1]).toBeCloseTo(
      65 + (prop.transform.position[1] - 97) * 0.375,
      10,
    );
    expect(
      evaluateComp(baked.composition, frame).layers[0]!.effects[0]!.params.pins,
    ).toEqual(pins);
  }
});
