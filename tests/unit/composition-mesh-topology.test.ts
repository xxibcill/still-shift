import { expect, it } from "vitest";
import {
  alphaMesh,
  traceAlphaContours,
} from "../../packages/renderer-core/src/composition/mesh/topology.ts";
import {
  triangleArea,
  triangleFlips,
} from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
function pixels(rows: string[]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    rows.flatMap((row) =>
      [...row].flatMap((cell) => [50, 100, 200, cell === "#" ? 255 : 0]),
    ),
  );
}
const area = (mesh: ReturnType<typeof alphaMesh>) =>
  mesh.indices.reduce(
    (sum, _, i) =>
      i % 3
        ? sum
        : sum +
          Math.abs(
            triangleArea(
              mesh.vertices[mesh.indices[i]!]!,
              mesh.vertices[mesh.indices[i + 1]!]!,
              mesh.vertices[mesh.indices[i + 2]!]!,
            ),
          ) /
            2,
    0,
  );
it("traces the actual alpha boundary, including holes and disconnected islands", () => {
  const bytes = pixels([
    "######..##",
    "######..##",
    "##..##....",
    "##..##....",
    "######....",
    "######....",
  ]);
  const mesh = alphaMesh(bytes, 10, 6, { refinement: 0 });
  expect(mesh.contours).toHaveLength(3);
  expect(area(mesh)).toBe(36);
  expect(triangleFlips(mesh.vertices, mesh.vertices, mesh.indices)).toEqual([]);
});
it("keeps diagonal contacts as independent islands", () => {
  const mesh = alphaMesh(pixels(["#.", ".#"]), 2, 2, { refinement: 0 });
  expect(mesh.contours).toHaveLength(2);
  expect(area(mesh)).toBe(2);
});
it("simplifies collinear outline edges without changing coverage", () => {
  const contours = traceAlphaContours(
    pixels(["####", "####", "####"]),
    4,
    3,
    1,
  );
  expect(contours).toHaveLength(1);
  expect(contours[0]).toHaveLength(4);
});
it("inserts pins inside triangles and on shared edges without cracks or flipped faces", () => {
  const mesh = alphaMesh(pixels(["####", "####", "####", "####"]), 4, 4, {
    refinement: 1,
    pins: [
      [2, 2],
      [1, 2],
      [0, 0],
    ],
  });
  expect(area(mesh)).toBe(16);
  expect(mesh.pinVertices.map((i) => mesh.vertices[i])).toEqual([
    [2, 2],
    [1, 2],
    [0, 0],
  ]);
  expect(triangleFlips(mesh.vertices, mesh.vertices, mesh.indices)).toEqual([]);
  for (const pin of mesh.pinVertices) expect(mesh.indices).toContain(pin);
});
it("rejects pins in transparent holes and outside the alpha silhouette", () => {
  const bytes = pixels(["####", "#..#", "#..#", "####"]);
  for (const pin of [
    [2, 2],
    [-1, 0],
    [5, 1],
  ] as [number, number][])
    expect(() => alphaMesh(bytes, 4, 4, { pins: [pin] })).toThrow(
      /outside.*alpha/,
    );
});
it("preserves area and shared topology through fixed refinement passes", () => {
  const bytes = pixels(["##", "##"]);
  const coarse = alphaMesh(bytes, 2, 2, { refinement: 0 });
  for (const refinement of [1, 2, 3]) {
    const mesh = alphaMesh(bytes, 2, 2, { refinement });
    expect(mesh.indices.length).toBe(coarse.indices.length * 4 ** refinement);
    expect(area(mesh)).toBe(4);
    expect(triangleFlips(mesh.vertices, mesh.vertices, mesh.indices)).toEqual(
      [],
    );
    expect(alphaMesh(bytes, 2, 2, { refinement })).toEqual(mesh);
  }
});
it("handles transparent artwork and alpha thresholds, with bounded input validation", () => {
  expect(alphaMesh(pixels(["..", ".."]), 2, 2, {}).indices).toEqual([]);
  const bytes = pixels(["##"]);
  bytes[3] = 50;
  expect(
    area(alphaMesh(bytes, 2, 1, { alphaThreshold: 128, refinement: 0 })),
  ).toBe(1);
  for (const refinement of [-1, 4, 0.5])
    expect(() => alphaMesh(bytes, 2, 1, { refinement })).toThrow();
  expect(() => alphaMesh(bytes, 3, 1, {})).toThrow();
});
it("fails explicitly when highly fragmented artwork exceeds the contour budget", () => {
  const rows = Array.from({ length: 256 }, (_, y) =>
    Array.from({ length: 256 }, (_, x) => ((x + y) % 2 ? "." : "#")).join(""),
  );
  expect(() => alphaMesh(pixels(rows), 256, 256, {})).toThrow(/budget/);
});
it("matches every 3x3 binary alpha mask against independent pixel-cell coverage", () => {
  for (let bits = 0; bits < 512; bits++) {
    const bytes = Uint8Array.from(
      Array.from({ length: 9 }, (_, i) => [
        0,
        0,
        0,
        (bits >> i) & 1 ? 255 : 0,
      ]).flat(),
    );
    const mesh = alphaMesh(bytes, 3, 3, { refinement: 0 });
    const count = Array.from({ length: 9 }, (_, i) => (bits >> i) & 1).reduce(
      (a, b) => a + b,
      0,
    );
    expect(area(mesh), `mask ${bits}`).toBe(count);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        const point: [number, number] = [x + 0.5, y + 0.5];
        let covered = false;
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const a = mesh.vertices[mesh.indices[i]!]!,
            b = mesh.vertices[mesh.indices[i + 1]!]!,
            c = mesh.vertices[mesh.indices[i + 2]!]!;
          const total = triangleArea(a, b, c);
          if (
            [
              triangleArea(point, b, c),
              triangleArea(a, point, c),
              triangleArea(a, b, point),
            ].every((part) => part / total >= -1e-10)
          )
            covered = true;
        }
        expect(covered, `mask ${bits} pixel ${x},${y}`).toBe(
          Boolean((bits >> (y * 3 + x)) & 1),
        );
      }
  }
});
it("preserves opaque islands nested within transparent holes", () => {
  const mesh = alphaMesh(
    pixels([
      "#######",
      "#.....#",
      "#.....#",
      "#..#..#",
      "#.....#",
      "#.....#",
      "#######",
    ]),
    7,
    7,
    { refinement: 0 },
  );
  expect(mesh.contours).toHaveLength(3);
  expect(area(mesh)).toBe(25);
});
