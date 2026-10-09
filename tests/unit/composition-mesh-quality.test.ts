import { expect, it } from "vitest";
import { improveMeshTriangles } from "../../packages/renderer-core/src/composition/mesh/quality.ts";
import {
  triangleArea,
  triangleFlips,
} from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
import type { Point } from "../../packages/renderer-core/src/node-transform.ts";
it("improves a skinny diagonal without moving vertices or changing the boundary", () => {
  const points: Point[] = [
    [0, 0],
    [8, 0],
    [8, 1],
    [0, 6],
  ];
  const initial = [0, 1, 3, 1, 2, 3];
  const mesh = [...initial];
  const before = structuredClone(points);
  improveMeshTriangles(points, mesh);
  expect(mesh).not.toEqual(initial);
  expect(points).toEqual(before);
  const area = (indices: number[]) =>
    indices.reduce(
      (sum, _, i) =>
        i % 3
          ? sum
          : sum +
            Math.abs(
              triangleArea(
                points[indices[i]!]!,
                points[indices[i + 1]!]!,
                points[indices[i + 2]!]!,
              ),
            ),
      0,
    );
  expect(area(mesh)).toBe(area(initial));
  expect(triangleFlips(points, points, mesh)).toEqual([]);
  const repeated = [...initial];
  improveMeshTriangles(points, repeated);
  expect(repeated).toEqual(mesh);
  const boundary = (indices: number[]) => {
    const counts = new Map<string, number>();
    for (let i = 0; i < indices.length; i += 3)
      for (let j = 0; j < 3; j++) {
        const key = [indices[i + j], indices[i + ((j + 1) % 3)]]
          .sort()
          .join(":");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    return [...counts]
      .filter(([, count]) => count === 1)
      .map(([key]) => key)
      .sort();
  };
  expect(boundary(mesh)).toEqual(boundary(initial));
});
it("does not flip a concave boundary or replace equal-quality diagonals", () => {
  for (const points of [
    [
      [0, 0],
      [4, 0],
      [1, 1],
      [0, 4],
    ],
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
  ] as Point[][]) {
    const mesh = [0, 1, 2, 0, 2, 3];
    improveMeshTriangles(points, mesh);
    expect(mesh).toEqual([0, 1, 2, 0, 2, 3]);
  }
});
