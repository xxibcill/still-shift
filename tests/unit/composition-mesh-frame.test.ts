import { expect, it } from "vitest";
import { evaluateComp } from "@still-shift/renderer-core";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { meshFrame } from "../../packages/renderer-core/src/composition/mesh/frame.ts";
import { triangleFlips } from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
import { rasterizeMesh } from "../../packages/renderer-core/src/composition/mesh/raster.ts";

function effect(
  effect: string,
  params: NonNullable<
    NonNullable<CompositionLayer["effects"]>[number]["params"]
  >,
) {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "mesh-frame",
    width: 100,
    height: 100,
    fps: 24,
    frameCount: 1,
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
  expect(validateComposition(comp).ok).toBe(true);
  return evaluateComp(comp, 0).layers[0]!.effects[0]!.params;
}

it("renders the minimum identity Bezier size with default tessellation", () => {
  const mesh = meshFrame(
    "distort.mesh-warp",
    effect("distort.mesh-warp", { size: [1, 1] }),
    1,
    1,
  );
  const input = Uint8Array.from([120, 80, 40, 255]);
  const output = new Uint8Array(4);
  rasterizeMesh(mesh, input, output, 1, 1);
  expect(output).toEqual(input);
  expect(triangleFlips(mesh.source, mesh.destination, mesh.indices)).toEqual(
    [],
  );
});

it("preserves an identity puppet with a pin near the alpha edge", () => {
  const input = new Uint8Array(100 * 100 * 4).fill(255);
  const params = effect("distort.puppet", {
    rest: [[0.02, 50]],
    pins: [[0.02, 50]],
  });
  const mesh = meshFrame("distort.puppet", params, 100, 100, input);
  const output = new Uint8Array(input.length);
  rasterizeMesh(mesh, input, output, 100, 100);
  expect(output).toEqual(input);
  expect(triangleFlips(mesh.source, mesh.destination, mesh.indices)).toEqual(
    [],
  );
});

it("still rejects genuine Bezier folds and collapsed deformation", () => {
  for (const controls of [
    [
      [0, 0],
      [-1, 0],
      [0, 1],
      [-1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 0],
      [1, 0],
    ],
  ]) {
    expect(() =>
      meshFrame(
        "distort.mesh-warp",
        effect("distort.mesh-warp", { controls }),
        100,
        100,
      ),
    ).toThrow(/comp-mesh-flip/);
  }
});
