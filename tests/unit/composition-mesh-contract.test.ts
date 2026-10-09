import { expect, it } from "vitest";
import {
  compositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "@still-shift/renderer-core";
function fixture(
  effect: string,
  params: Record<string, never> = {},
): Composition {
  return {
    schemaVersion: "composition-1",
    id: "mesh",
    width: 128,
    height: 128,
    fps: 24,
    frameCount: 12,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        color: "#ffffff",
        size: [100, 100],
        effects: [{ id: "deform", effect, params }],
      },
    ],
  };
}
it("accepts all rectangular Bezier grid sizes from 2x2 through 8x8", () => {
  for (let rows = 2; rows <= 8; rows++)
    for (let columns = 2; columns <= 8; columns++) {
      const comp = fixture("distort.mesh-warp");
      comp.layers[0]!.effects![0]!.params = {
        rows,
        columns,
        controls: Array.from({ length: rows * columns }, (_, i) => [
          (i % columns) / (columns - 1),
          Math.floor(i / columns) / (rows - 1),
        ]),
      };
      expect(validateComposition(comp).ok).toBe(true);
      expect(() => evaluateComp(comp, 0)).not.toThrow();
    }
});
it("validates final grid dimensions after expressions", () => {
  const comp = fixture("distort.mesh-warp");
  comp.expressions = { "art.effects[deform].columns": { source: "3" } };
  expect(() => evaluateComp(comp, 2)).toThrow(/row-major/);
});
it("rejects mismatched pins, duplicate rest pins and invalid region settings", () => {
  for (const params of [
    { rest: [[0, 0]], pins: [] },
    {
      rest: [
        [0, 0],
        [0, 0],
      ],
      pins: [
        [0, 0],
        [1, 1],
      ],
    },
    { starchCenters: [[0, 0]], starch: [[10, 2]] },
    { starchCenters: [[0, 0]], starch: [] },
    { overlapCenters: [[0, 0]], overlap: [[0, 2]] },
  ]) {
    const comp = fixture("distort.puppet");
    comp.layers[0]!.effects![0]!.params = params;
    expect(() => evaluateComp(comp, 0)).toThrow();
  }
});
it("samples animated pins and independently addressed controls", () => {
  const comp = fixture("distort.puppet");
  comp.layers[0]!.effects![0]!.params = {
    rest: [
      [0, 0],
      [10, 0],
    ],
    pins: [
      [0, 0],
      {
        keys: [
          { frame: 0, value: [10, 0] },
          { frame: 10, value: [10, 10] },
        ],
      },
    ],
  };
  comp.expressions = { "art.effects[deform].pins[p0]": { source: "[1, 2]" } };
  expect(evaluateComp(comp, 5).layers[0]!.effects[0]!.params.pins).toEqual([
    [1, 2],
    [10, 5],
  ]);
});
it("defines layer-local controls and unbounded deformation extents", () => {
  for (const id of ["distort.mesh-warp", "distort.puppet"]) {
    const definition = compositionEffectDefinition(id)!;
    expect(definition.usesLayerSpace).toBe(true);
    expect(
      definition.expandBounds!({ left: 0, top: 0, right: 1, bottom: 1 }, {}),
    ).toBeNull();
  }
});
