import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  buildRenderGraph,
  type DrawOp,
  type IsolateOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "paint",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 20,
  assets: [],
  layers: [
    {
      id: "child",
      type: "solid",
      parent: "group",
      size: [20, 20],
      color: "#ffffff",
      transform: { anchor: [0, 0], position: [-24, 10] },
      effects: [
        { id: "blur", effect: "blur.primitive", params: { radius: 0 } },
      ],
    },
    {
      id: "group",
      type: "group",
      size: [100, 100],
      effects: [
        { id: "blur", effect: "blur.primitive", params: { radius: 4 } },
      ],
    },
  ],
});
const ops = (comp: Composition) =>
  buildRenderGraph(comp, evaluateComp(comp, 0)).root.ops;

describe("primitive drawing blur", () => {
  it("inherits positive group blur without flattening or culling its children", () => {
    const comp = fixture();
    expect(validateComposition(comp).ok).toBe(true);
    expect(ops(comp)).toHaveLength(1);
    expect(ops(comp)[0]).toMatchObject({
      kind: "draw",
      layer: "child",
      paintBlur: 4,
    });
    comp.layers[0]!.effects![0]!.params!.radius = 2;
    expect((ops(comp)[0] as DrawOp).paintBlur).toBe(2);
    comp.layers[0]!.effects![0]!.enabled = false;
    expect((ops(comp)[0] as DrawOp).paintBlur).toBe(4);
    comp.layers[1]!.effects![0]!.enabled = false;
    expect(ops(comp)).toEqual([]);
  });
  it("retains drawing blur inside pixel stacks and rejects ambiguous paint stages", () => {
    const comp = fixture();
    comp.layers[1]!.effects!.push({
      id: "soft",
      effect: "blur.gaussian",
      params: { radius: 2 },
    });
    const group = ops(comp)[0] as IsolateOp;
    expect(group.effects.map((effect) => effect.effect)).toEqual([
      "blur.gaussian",
    ]);
    expect(group.ops[0]).toMatchObject({ kind: "draw", paintBlur: 4 });
    comp.layers[1]!.effects!.push({ id: "extra", effect: "blur.primitive" });
    expect(validateComposition(comp).ok).toBe(false);
    comp.layers = [
      {
        id: "adjust",
        type: "adjustment",
        effects: [{ id: "blur", effect: "blur.primitive" }],
      },
    ];
    expect(validateComposition(comp).ok).toBe(true);
  });
});
