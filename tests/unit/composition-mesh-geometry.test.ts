import { expect, it } from "vitest";
import {
  bezierMeshPoint,
  rigidMlsPoint,
  deformPuppetPoint,
  triangleFlips,
  orderMeshTriangles,
  type PuppetPin,
} from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
import type { Point } from "../../packages/renderer-core/src/node-transform.ts";

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};
const rest: Point[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
it("preserves arbitrary rigid motion and reaches every pin exactly", () => {
  const angle = 0.73;
  const transform = ([x, y]: Point): Point => [
    Math.cos(angle) * x - Math.sin(angle) * y + 7,
    Math.sin(angle) * x + Math.cos(angle) * y - 13,
  ];
  const pins: PuppetPin[] = rest.map((point) => ({
    rest: point,
    target: transform(point),
  }));
  for (const point of [...rest, [15, 8], [34, 72], [-20, 13]] as Point[])
    close(rigidMlsPoint(point, pins), transform(point));
  for (const pin of pins)
    expect(rigidMlsPoint(pin.rest, pins)).toEqual(pin.target);
});
it("handles no pins and one translating pin, and rejects collapsed fits", () => {
  expect(rigidMlsPoint([4, 5], [])).toEqual([4, 5]);
  expect(rigidMlsPoint([4, 5], [{ rest: [1, 2], target: [8, 12] }])).toEqual([
    11, 15,
  ]);
  expect(() =>
    rigidMlsPoint(
      [50, 50],
      rest.map((point) => ({ rest: point, target: [0, 0] })),
    ),
  ).toThrow(/collapsed/);
});
it("interpolates moved pins and deterministically bends intermediate geometry", () => {
  const pins: PuppetPin[] = [
    { rest: [0, 0], target: [0, 0] },
    { rest: [100, 0], target: [95, 25] },
    { rest: [50, 0], target: [50, 8] },
  ];
  const first = rigidMlsPoint([75, 10], pins);
  for (let i = 0; i < 20; i++)
    expect(rigidMlsPoint([75, 10], pins)).toEqual(first);
  expect(first[1]).toBeGreaterThan(10);
  for (const pin of pins)
    expect(rigidMlsPoint(pin.rest, pins)).toEqual(pin.target);
});
it.each([2, 3, 4, 5, 6, 7, 8])(
  "preserves the identity Bezier lattice with %i controls per axis",
  (count) => {
    const points: Point[] = Array.from({ length: count * count }, (_, i) => [
      (i % count) / (count - 1),
      Math.floor(i / count) / (count - 1),
    ]);
    for (const uv of [
      [0, 0],
      [1, 1],
      [0.2, 0.71],
      [0.53, 0.43],
    ] as Point[])
      close(bezierMeshPoint(uv, count, count, points), uv);
  },
);
it("evaluates an independent quadratic Bezier reference and enforces topology", () => {
  const points: Point[] = [
    [0, 0],
    [0.5, -1],
    [1, 0],
    [0, 1],
    [0.5, 2],
    [1, 1],
  ];
  close(bezierMeshPoint([0.5, 0.25], 3, 2, points), [0.5, 0]);
  expect(() => bezierMeshPoint([0, 0], 1, 2, points)).toThrow();
  expect(() => bezierMeshPoint([0, 0], 3, 3, points)).toThrow();
});
it("detects collapsed and flipped triangles relative to their original winding", () => {
  const indices = [0, 1, 2, 0, 2, 3];
  expect(triangleFlips(rest, rest, indices)).toEqual([]);
  expect(
    triangleFlips(
      rest,
      rest.map(([x, y]) => [-x, y]),
      indices,
    ),
  ).toEqual([0, 1]);
  expect(
    triangleFlips(
      rest,
      [
        [0, 0],
        [100, 0],
        [50, 0],
        [0, 100],
      ],
      indices,
    ),
  ).toEqual([0]);
  expect(triangleFlips(rest, rest, [0, 2, 1, 0, 3, 2])).toEqual([]);
});
it("stiffens a region while preserving pin targets and global rigid motion", () => {
  const pins: PuppetPin[] = [
    { rest: [0, 0], target: [0, 0] },
    { rest: [100, 0], target: [100, 30] },
    { rest: [0, 100], target: [0, 100] },
    { rest: [100, 100], target: [100, 80] },
  ];
  const regions = [{ center: [50, 50] as Point, radius: 80, strength: 1 }];
  const a = deformPuppetPoint([45, 50], pins, regions),
    b = deformPuppetPoint([55, 50], pins, regions);
  expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(10, 8);
  for (const pin of pins)
    expect(deformPuppetPoint(pin.rest, pins, regions)).toEqual(pin.target);
});
it("orders overlapping regions by depth with stable original-index ties", () => {
  const vertices: Point[] = [
    [0, 0],
    [2, 0],
    [0, 2],
    [10, 0],
    [12, 0],
    [10, 2],
  ];
  expect(
    orderMeshTriangles(
      vertices,
      [0, 1, 2, 3, 4, 5],
      [{ center: [0, 0], radius: 4, depth: 2 }],
    ),
  ).toEqual([3, 4, 5, 0, 1, 2]);
  expect(orderMeshTriangles(vertices, [0, 1, 2, 3, 4, 5], [])).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
});
