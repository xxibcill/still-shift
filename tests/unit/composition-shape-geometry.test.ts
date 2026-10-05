import { describe, expect, it } from "vitest";
import {
  AnimatablePathSchema,
  BezierPathSchema,
  PathMorphSchema,
  PreparedNodeSchema,
  SHAPE_LIMITS,
  type BezierPath,
} from "@still-shift/scene-contract";
import { ShapeGeometryBudget } from "../../packages/renderer-core/src/composition/shapes/budget.ts";
import {
  arcLengths,
  bezierBounds,
  cubicAt,
  flattenBezier,
  pathCubics,
  pathSection,
  pointAtLength,
  transformBezier,
} from "../../packages/renderer-core/src/composition/shapes/path.ts";
import {
  ellipsePath,
  polystarPath,
  rectanglePath,
  roundedPolyline,
} from "../../packages/renderer-core/src/composition/shapes/primitives.ts";
import { path as samplePath } from "../../packages/renderer-core/src/composition/evaluate/sample.ts";
import { sampleMotionPath } from "../../packages/renderer-core/src/motion-appearance.ts";
import type { Point } from "../../packages/renderer-core/src/node-transform.ts";

const arch: BezierPath = {
  closed: false,
  vertices: [
    [0, 0],
    [100, 0],
  ],
  outTangents: [
    [0, 100],
    [0, 0],
  ],
  inTangents: [
    [0, 0],
    [0, 100],
  ],
};
const preparedPath = PreparedNodeSchema.parse({
  id: "line",
  type: "path",
  points: [
    [0, 0],
    [100, 0],
  ],
  stroke: "#ffffff",
  lineWidth: 2,
});
if (preparedPath.type !== "path") throw new Error("Expected path fixture");

describe("native cubic geometry", () => {
  it("bounds the actual interior cubic maximum", () => {
    expect(bezierBounds(arch)).toEqual({
      left: 0,
      top: 0,
      right: 100,
      bottom: 75,
    });
    expect(cubicAt([...pathCubics(arch)][0]!, 0.5)).toEqual([50, 75]);
    expect(bezierBounds({ closed: false, vertices: [] })).toBeNull();
  });

  it("flattens curves with fixed tolerance and preserves collinear reversals", () => {
    const points = flattenBezier(arch);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([100, 0]);
    expect(Math.max(...points.map((point) => point[1]))).toBe(75);
    expect(points.length).toBeGreaterThan(8);
    const reversed = flattenBezier({
      closed: false,
      vertices: [
        [0, 0],
        [10, 0],
      ],
      outTangents: [
        [100, 0],
        [0, 0],
      ],
      inTangents: [
        [0, 0],
        [-100, 0],
      ],
    });
    expect(Math.max(...reversed.map((p) => p[0]))).toBeGreaterThan(10);
    expect(Math.min(...reversed.map((p) => p[0]))).toBeLessThan(0);
  });

  it("transforms control offsets without adding translation to tangents", () => {
    const transformed = transformBezier(arch, [2, 0, 0, 3, 5, 7]);
    expect(transformed.vertices).toEqual([
      [5, 7],
      [205, 7],
    ]);
    expect(transformed.outTangents).toEqual([
      [0, 300],
      [0, 0],
    ]);
    expect(bezierBounds(transformed)).toEqual({
      left: 5,
      top: 7,
      right: 205,
      bottom: 232,
    });
    expect(arch.vertices).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it("sections open polylines by distance without a phantom closing edge", () => {
    const points: Point[] = [
        [0, 0],
        [10, 0],
        [10, 30],
      ],
      lengths = arcLengths(points);
    expect(lengths).toEqual([0, 10, 40]);
    expect(pointAtLength(points, lengths, 20)).toEqual([10, 10]);
    expect(pathSection(points, lengths, 5, 20)).toEqual([
      [5, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(pathSection(points, lengths, 5, 5)).toEqual([]);
  });

  it("budgets siblings together and preserves source/frame diagnostics", () => {
    const root = new ShapeGeometryBudget({ node: "art", frame: 12 });
    root.vertices(SHAPE_LIMITS.generatedVertices);
    let failure: unknown;
    try {
      root.located({ path: "art.contents[copies]" }).vertices(1);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      diagnostics: [
        {
          code: "comp-shape-work-limit",
          path: "art.contents[copies]",
          node: "art",
          frame: 12,
        },
      ],
    });
    const paths = new ShapeGeometryBudget();
    paths.paths(SHAPE_LIMITS.paths);
    expect(() => paths.paths()).toThrow("generated-path work budget");
    expect(() => new ShapeGeometryBudget().point([Infinity, 0])).toThrow(
      "finite",
    );
    expect(() =>
      new ShapeGeometryBudget().point([
        SHAPE_LIMITS.maxGeneratedCoordinate + 1,
        0,
      ]),
    ).toThrow("finite");
  });
});

describe("native primitives", () => {
  it("uses cubic ellipse arcs with cardinal extrema and the exact quarter midpoint", () => {
    const ellipse = ellipsePath({ size: [10, 20] })!;
    expect(ellipse.vertices.length).toBe(4);
    expect(bezierBounds(ellipse)).toEqual({
      left: -5,
      top: -10,
      right: 5,
      bottom: 10,
    });
    const middle = cubicAt([...pathCubics(ellipse)][0]!, 0.5);
    expect(middle[0]).toBeCloseTo(5 / Math.SQRT2, 10);
    expect(middle[1]).toBeCloseTo(10 / Math.SQRT2, 10);
  });

  it("clamps rounded rectangles and leaves zero-sized primitives empty", () => {
    const rounded = rectanglePath({
      size: [20, 10],
      position: [15, 20],
      roundness: 100,
    })!;
    expect(rounded.vertices.length).toBe(8);
    expect(bezierBounds(rounded)).toEqual({
      left: 5,
      top: 15,
      right: 25,
      bottom: 25,
    });
    expect(rectanglePath({ size: [0, 10] })).toBeNull();
    expect(ellipsePath({ size: [10, 0] })).toBeNull();
    expect(
      polystarPath({ kind: "star", points: 5, outerRadius: 0 }),
    ).toBeNull();
    expect(() => rectanglePath({ size: [-1, 10] })).toThrow("negative");
  });

  it("distinguishes polygons/stars and rounds open corners without moving endpoints", () => {
    expect(
      polystarPath({ kind: "polygon", points: 5, outerRadius: 20 })!.vertices
        .length,
    ).toBe(5);
    expect(
      polystarPath({
        kind: "star",
        points: 5,
        outerRadius: 20,
        innerRadius: 8,
      })!.vertices.length,
    ).toBe(10);
    const rounded = polystarPath({
      kind: "star",
      points: 5,
      outerRadius: 20,
      innerRadius: 8,
      outerRoundness: 0.5,
      innerRoundness: 0.5,
    })!;
    expect(rounded.vertices.length).toBe(20);
    const open = roundedPolyline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      false,
      2,
    );
    expect(open.vertices[0]).toEqual([0, 0]);
    expect(open.vertices.at(-1)).toEqual([10, 10]);
    expect(open.vertices[1]![0]).toBeCloseTo(8, 12);
    expect(open.vertices[2]![1]).toBeCloseTo(2, 12);
  });
});

describe("native and legacy rich morph correspondence", () => {
  it("rotates vertices and both tangent arrays together across forward/reverse seeks", () => {
    const first: BezierPath = {
      closed: true,
      vertices: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      inTangents: [
        [-1, 0],
        [0, -2],
        [3, 0],
        [0, 4],
      ],
      outTangents: [
        [1, 0],
        [0, 2],
        [-3, 0],
        [0, -4],
      ],
    };
    const rotate = (points: Point[]) => [...points.slice(1), points[0]!];
    const second = {
      closed: true,
      firstVertex: 3,
      vertices: rotate(first.vertices),
      inTangents: rotate(first.inTangents!),
      outTangents: rotate(first.outTangents!),
    };
    const curve = AnimatablePathSchema.parse({
      keys: [
        { frame: 0, value: first },
        { frame: 10, value: second },
      ],
    });
    for (const frame of [0, 5, 10, 2, 9, 1])
      expect(samplePath(curve, frame, 24)).toEqual(first);
    expect(samplePath(second, 0, 24)).toEqual(first);
    expect(second.firstVertex).toBe(3);
  });

  it("rejects invalid alignment and mismatched morph tangent counts", () => {
    expect(
      BezierPathSchema.safeParse({ ...arch, firstVertex: 1 }).success,
    ).toBe(false);
    expect(
      BezierPathSchema.safeParse({ ...arch, closed: true, firstVertex: 2 })
        .success,
    ).toBe(false);
    expect(
      PathMorphSchema.safeParse({
        node: "line",
        keys: [
          {
            frame: 0,
            points: [
              [0, 0],
              [10, 0],
            ],
            inTangents: [[0, 0]],
          },
          {
            frame: 10,
            points: [
              [0, 0],
              [10, 0],
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("renders newly authored rich legacy curves and preserves point-only arithmetic", () => {
    const rich = PathMorphSchema.parse({
      node: "line",
      keys: [0, 10].map((frame) => ({
        frame,
        points: arch.vertices,
        inTangents: arch.inTangents,
        outTangents: arch.outTangents,
      })),
    });
    const result = sampleMotionPath(preparedPath, undefined, rich, 5, 24);
    expect(Math.max(...result.points.map((p) => p[1]))).toBe(75);
    expect(
      sampleMotionPath(preparedPath, undefined, rich, 1, 24).points,
    ).toEqual(result.points);
    const plain = PathMorphSchema.parse({
      node: "line",
      keys: [
        {
          frame: 0,
          points: [
            [0, 0],
            [100, 0],
          ],
        },
        {
          frame: 10,
          points: [
            [20, 10],
            [120, 30],
          ],
        },
      ],
    });
    expect(
      sampleMotionPath(preparedPath, undefined, plain, 5, 24).points,
    ).toEqual([
      [10, 5],
      [110, 15],
    ]);
    expect(
      sampleMotionPath(preparedPath, undefined, plain, -1, 24).points,
    ).toBe(plain.keys[0]!.points);
  });
});
