import { expect, it } from "vitest";
import { meshOutputBounds } from "../../packages/renderer-core/src/composition/mesh/bounds.ts";
import {
  bezierMeshPoint,
  isCollapsedMeshPlacement,
  deformPuppetPoint,
} from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
import {
  transformPoint,
  type Point,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { projectBounds } from "../../packages/renderer-core/src/composition/evaluate/geometry.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import type { EvaluatedEffect } from "../../packages/renderer-core/src/composition/evaluate/effects.ts";
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const input = { left: 0, top: 0, right: 16, bottom: 16 };
function contains(bounds: Bounds, point: Point) {
  expect(point[0]).toBeGreaterThanOrEqual(bounds.left - 1e-9);
  expect(point[0]).toBeLessThanOrEqual(bounds.right + 1e-9);
  expect(point[1]).toBeGreaterThanOrEqual(bounds.top - 1e-9);
  expect(point[1]).toBeLessThanOrEqual(bounds.bottom + 1e-9);
}
function puppet(rest: Point[], pins: Point[]): EvaluatedEffect {
  return {
    id: "mesh",
    effect: "distort.puppet",
    enabled: true,
    params: { rest, pins },
  };
}
it("keeps empty puppets and uniform pin translations tight in placed coordinates", () => {
  expect(meshOutputBounds(input, puppet([], []), identity)).toEqual(input);
  expect(
    meshOutputBounds(
      input,
      puppet(
        [
          [0, 0],
          [16, 16],
        ],
        [
          [32, 0],
          [48, 16],
        ],
      ),
      identity,
    ),
  ).toEqual({ left: 32, top: 0, right: 48, bottom: 16 });
  expect(
    meshOutputBounds(input, puppet([[0, 0]], [[32, 0]]), [0, 2, -1, 0, 5, 7]),
  ).toEqual({ left: 0, top: 64, right: 16, bottom: 80 });
});
it("encloses high-order Bezier output under reflection and skew", () => {
  const controls: Point[] = Array.from({ length: 64 }, (_, i) => [
    (i % 8) / 7 + Math.sin(i),
    Math.floor(i / 8) / 7 + Math.cos(i),
  ]);
  const origin: Point = [-4, 7],
    size: Point = [16, 24],
    matrix: Matrix = [-2, 0.5, 0.25, 1, 12, -9];
  const effect: EvaluatedEffect = {
    id: "mesh",
    effect: "distort.mesh-warp",
    enabled: true,
    params: { controls, origin, size },
  };
  const bounds = meshOutputBounds(input, effect, matrix);
  for (let y = 0; y <= 20; y++)
    for (let x = 0; x <= 20; x++) {
      const point = bezierMeshPoint([x / 20, y / 20], 8, 8, controls);
      contains(
        bounds,
        transformPoint(matrix, [
          origin[0] + point[0] * size[0],
          origin[1] + point[1] * size[1],
        ]),
      );
    }
});
it("encloses nonuniform rigid MLS and starch output under affine placement", () => {
  const rest: Point[] = [
      [0, 0],
      [16, 0],
      [8, 16],
    ],
    targets: Point[] = [
      [32, -4],
      [51, 5],
      [38, 20],
    ];
  const pins = rest.map((point, i) => ({ rest: point, target: targets[i]! }));
  const starch = [
    { center: [7, 7] as Point, radius: 12, strength: 0.8 },
    { center: [12, 8] as Point, radius: 8, strength: 1 },
  ];
  for (const matrix of [identity, [-2, 0.5, 0.25, 1, 12, -9] as Matrix]) {
    const bounds = meshOutputBounds(
      projectBounds(input, matrix),
      puppet(rest, targets),
      matrix,
    );
    for (let y = 0; y <= 16; y++)
      for (let x = 0; x <= 16; x++)
        contains(
          bounds,
          transformPoint(matrix, deformPuppetPoint([x, y], pins, starch)),
        );
  }
});

it("does not invert collapsed descendant owners when retaining parent mesh input", () => {
  const effect = puppet(
    [
      [0, 0],
      [16, 16],
    ],
    [
      [0, 0],
      [20, 12],
    ],
  );
  for (const owner of [
    [0, 0, 0, 0, 10, 10],
    [0, 0, 0, 1, 10, 10],
    [1, 0, 0, 0, 10, 10],
    [1, 1, 2, 2, 10, 10],
  ] as Matrix[])
    expect(
      meshOutputBounds(
        input,
        effect,
        owner,
        isCollapsedMeshPlacement(owner),
        true,
      ),
    ).toEqual(input);
});

it("keeps external mesh-space bounds for scope-generated input under a collapsed owner", () => {
  const effect = puppet(
    [
      [0, 0],
      [16, 16],
    ],
    [
      [0, 0],
      [20, 12],
    ],
  );
  expect(meshOutputBounds(input, effect, identity, true, false)).toEqual(
    meshOutputBounds(input, effect, identity),
  );
});
