import { expect, it } from "vitest";
import { rasterizeMesh } from "../../packages/renderer-core/src/composition/mesh/raster.ts";
import type { DeformedMesh } from "../../packages/renderer-core/src/composition/mesh/frame.ts";
const quad: DeformedMesh = {
  source: [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ],
  destination: [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ],
  indices: [0, 1, 2, 0, 2, 3],
};
it("maps affine texture triangles without shared-edge seams or double alpha", () => {
  const input = Uint8Array.from([
    100, 50, 20, 128, 40, 10, 5, 128, 30, 60, 90, 128, 5, 15, 25, 128,
  ]);
  const output = new Uint8Array(input.length);
  rasterizeMesh(quad, input, output, 2, 2);
  expect(output).toEqual(input);
  rasterizeMesh({ ...quad, indices: [0, 2, 1, 0, 3, 2] }, input, output, 2, 2);
  expect(output).toEqual(input);
});
it("composites triangles in the authored depth order", () => {
  const source = Uint8Array.from([
    128, 0, 0, 128, 0, 128, 0, 128, 128, 0, 0, 128, 0, 128, 0, 128,
  ]);
  const output = new Uint8Array(16);
  const mesh: DeformedMesh = {
    source: [
      [0, 0],
      [1, 0],
      [0, 2],
      [1, 0],
      [2, 0],
      [1, 2],
    ],
    destination: [
      [0, 0],
      [1, 0],
      [0, 2],
      [0, 0],
      [1, 0],
      [0, 2],
    ],
    indices: [0, 1, 2, 3, 4, 5],
  };
  rasterizeMesh(mesh, source, output, 2, 2);
  expect([...output.slice(0, 4)]).toEqual([64, 128, 0, 192]);
  rasterizeMesh({ ...mesh, indices: [3, 4, 5, 0, 1, 2] }, source, output, 2, 2);
  expect([...output.slice(0, 4)]).toEqual([128, 64, 0, 192]);
});
