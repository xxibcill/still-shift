import { expect, it } from "vitest";
import {
  resolvePropertyPath,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateProperty } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "alias",
  width: 32,
  height: 32,
  fps: 24,
  frameCount: 12,
  assets: [],
  layers: [
    {
      id: "art",
      type: "solid",
      size: [16, 16],
      color: "#ffffff",
      effects: [
        { id: "paint", effect: "blur.primitive" },
        { id: "gaussian", effect: "blur.gaussian" },
      ],
    },
  ],
});
it("resolves legacy blur only to an existing primitive paint effect", () => {
  const comp = fixture();
  expect(resolvePropertyPath(comp, "art.blur")).toMatchObject({
    path: "art.effects[paint].radius",
    type: "scalar",
  });
  comp.layers[0]!.effects!.shift();
  expect(resolvePropertyPath(comp, "art.blur")).toMatchObject({
    code: "comp-path-property",
  });
});
it("targets aliases through real driver and expression evaluation", () => {
  const comp = fixture();
  comp.signals = [
    {
      id: "soft",
      keys: [
        { frame: 0, value: 0, interpolation: "linear" },
        { frame: 11, value: 11, interpolation: "linear" },
      ],
    },
  ];
  comp.drivers = [{ target: "art.blur", signal: "soft" }];
  expect(evaluateProperty(comp, "art.effects[paint].radius", 5)).toBe(5);
  const expressed = structuredClone(comp);
  expressed.drivers = [];
  expressed.expressions = { "art.blur": { source: "frame * 2" } };
  expect(evaluateProperty(expressed, "art.effects[paint].radius", 5)).toBe(10);
});
it("does not promise delivered milestones for unknown effect parameters", () => {
  const comp = fixture();
  comp.layers[0]!.effects = [{ id: "missing", effect: "custom.not-installed" }];
  expect(
    resolvePropertyPath(comp, "art.effects[missing].radius"),
  ).toMatchObject({ code: "comp-path-property" });
});
