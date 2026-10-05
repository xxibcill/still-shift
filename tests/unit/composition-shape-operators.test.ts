import { describe, expect, it } from "vitest";
import { SHAPE_LIMITS, type BezierPath } from "@still-shift/scene-contract";
import { ShapeGeometryBudget } from "../../packages/renderer-core/src/composition/shapes/budget.ts";
import {
  shapeMatrix,
  transformedGeometry,
  type GeometryPath,
} from "../../packages/renderer-core/src/composition/shapes/geometry.ts";
import { trimGeometry } from "../../packages/renderer-core/src/composition/shapes/trim.ts";
import { repeaterCopies } from "../../packages/renderer-core/src/composition/shapes/repeater.ts";
import {
  mergePaths,
  offsetPaths,
} from "../../packages/renderer-core/src/composition/shapes/polygons.ts";
import {
  roundCorners,
  puckerBloat,
  twistPath,
  wigglePath,
  zigzagPath,
} from "../../packages/renderer-core/src/composition/shapes/deform.ts";
import {
  bezierBounds,
  flattenBezier,
} from "../../packages/renderer-core/src/composition/shapes/path.ts";
import { rectanglePath } from "../../packages/renderer-core/src/composition/shapes/primitives.ts";
import {
  transformPoint,
  type Point,
} from "../../packages/renderer-core/src/node-transform.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const budget = () => new ShapeGeometryBudget();
const line = (vertices: Point[]): BezierPath => ({ closed: false, vertices });
const geometry = (path: BezierPath, id = "path"): GeometryPath => ({
  id,
  path,
  opacity: 1,
});
const box = (x = 0, size = 10) =>
  rectanglePath({ size: [size, size], position: [x + size / 2, size / 2] })!;
const area = (paths: BezierPath[]) =>
  Math.abs(
    paths.reduce(
      (total, path) =>
        total +
        path.vertices.reduce((sum, p, i) => {
          const q = path.vertices[(i + 1) % path.vertices.length]!;
          return sum + (p[0] * q[1] - q[0] * p[1]) / 2;
        }, 0),
      0,
    ),
  );
const transform = {
  anchor: [0, 0] as Point,
  position: [10, 0] as Point,
  scale: [2, 1] as Point,
  rotation: 0,
  skewX: 0,
  skewY: 0,
};
const copies = {
  copies: 3,
  offset: 0,
  transform,
  startOpacity: 1,
  endOpacity: 0.2,
  order: "above" as const,
};

describe("native trim and copy geometry", () => {
  it("trims unequal contours by simultaneous or accumulated arc length", () => {
    const paths = [
      geometry(
        line([
          [0, 0],
          [10, 0],
        ]),
      ),
      geometry(
        line([
          [0, 20],
          [30, 20],
        ]),
      ),
    ];
    const base = { start: 0, end: 0.5, offset: 0 };
    expect(
      trimGeometry(paths, { ...base, mode: "simultaneous" }, budget()).map(
        (p) => p.path.vertices,
      ),
    ).toEqual([
      [
        [0, 0],
        [5, 0],
      ],
      [
        [0, 20],
        [15, 20],
      ],
    ]);
    expect(
      trimGeometry(paths, { ...base, mode: "individual" }, budget()).map(
        (p) => p.path.vertices,
      ),
    ).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 20],
        [10, 20],
      ],
    ]);
  });
  it("wraps closed paths and clamps open paths without phantom close edges", () => {
    const closed = geometry(box());
    const trim = {
      start: 0.75,
      end: 1,
      offset: 45,
      mode: "simultaneous" as const,
    };
    const wrapped = trimGeometry([closed], trim, budget());
    expect(wrapped.map((p) => p.source!.span)).toEqual([
      [0.875, 1],
      [0, 0.125],
    ]);
    expect(wrapped.every((p) => !p.path.closed)).toBe(true);
    const open = geometry(
      line([
        [0, 0],
        [10, 0],
      ]),
    );
    expect(
      trimGeometry([open], { ...trim, offset: -360 }, budget())[0]!.path
        .vertices,
    ).toEqual([
      [7.5, 0],
      [10, 0],
    ]);
    expect(trimGeometry([open], { ...trim, offset: 180 }, budget())).toEqual(
      [],
    );
  });
  it("keeps zero/full/reversed intervals and source spans through chained trims", () => {
    const paths = [
      geometry(
        line([
          [0, 0],
          [10, 0],
        ]),
      ),
    ];
    const options = {
      start: 0,
      end: 1,
      offset: 37,
      mode: "simultaneous" as const,
    };
    expect(trimGeometry(paths, options, budget())).toBe(paths);
    expect(trimGeometry(paths, { ...options, end: 0 }, budget())).toEqual([]);
    const first = trimGeometry(
      paths,
      { ...options, start: 0.8, end: 0.2, offset: 0 },
      budget(),
    );
    const second = trimGeometry(
      first,
      { ...options, end: 0.5, offset: 0 },
      budget(),
    );
    expect(second[0]!.source!.points).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(second[0]!.source!.span[0]).toBeCloseTo(0.2);
    expect(second[0]!.source!.span[1]).toBeCloseTo(0.5);
  });
  it("remaps retained nib spans when geometry receives an anisotropic transform", () => {
    const path = geometry(
      line([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    );
    const trimmed = trimGeometry(
      [path],
      { start: 0, end: 0.5, offset: 0, mode: "simultaneous" },
      budget(),
    )[0]!;
    const scaled = transformedGeometry(trimmed, [2, 0, 0, 1, 0, 0], budget());
    expect(scaled.source!.span[1]).toBeCloseTo(2 / 3);
    expect(scaled.source!.points).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
    ]);
  });
  it("applies position, scale powers, anchors, offsets and fractional-copy opacity", () => {
    const result = repeaterCopies({ ...copies, copies: 2.5 }, budget());
    expect(result.map((c) => c.opacity)).toEqual([1, 0.6, 0.09999999999999998]);
    expect(result.map((c) => transformPoint(c.matrix, [1, 0]))).toEqual([
      [1, 0],
      [12, 0],
      [24, 0],
    ]);
    expect(
      repeaterCopies({ ...copies, order: "below" }, budget()).map(
        (c) => c.index,
      ),
    ).toEqual([2, 1, 0]);
    expect(repeaterCopies({ ...copies, copies: 0 }, budget())).toEqual([]);
    expect(
      transformPoint(
        repeaterCopies(
          { ...copies, offset: 1, transform: { ...transform, anchor: [3, 0] } },
          budget(),
        )[0]!.matrix,
        [3, 0],
      ),
    ).toEqual([13, 0]);
    expect(
      shapeMatrix({
        ...transform,
        anchor: [3, 0],
        position: [3, 0],
        scale: [1, 1],
      }),
    ).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it("rejects undefined scale powers with property/frame diagnostics", () => {
    try {
      repeaterCopies(
        { ...copies, offset: 0.5, transform: { ...transform, scale: [-1, 1] } },
        new ShapeGeometryBudget({
          node: "shape",
          frame: 12,
          path: "contents[repeat]",
        }),
      );
      throw Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)[0]).toMatchObject({
        code: "comp-shape-repeater-scale",
        node: "shape",
        frame: 12,
        path: "contents[repeat]",
      });
    }
    expect(() =>
      repeaterCopies(
        { ...copies, offset: -1, transform: { ...transform, scale: [0, 1] } },
        budget(),
      ),
    ).toThrow(/undefined/);
  });
});

describe("native quantized polygon operations", () => {
  it("computes all Boolean areas and preserves holes", () => {
    const a = box(),
      b = box(5);
    for (const [mode, expected] of [
      ["union", 150],
      ["subtract", 50],
      ["intersect", 50],
      ["exclude", 100],
    ] as const)
      expect(area(mergePaths([[a], [b]], mode, budget()))).toBe(expected);
    const hole = rectanglePath({ size: [10, 10], position: [10, 10] })!;
    const paths = mergePaths([[box(0, 20)], [hole]], "subtract", budget());
    expect(paths).toHaveLength(2);
    expect(area(paths)).toBe(300);
  });
  it("retains empty operands and folds intersection/XOR across three operands", () => {
    expect(mergePaths([[], [box()]], "subtract", budget())).toEqual([]);
    expect(mergePaths([[box()], []], "intersect", budget())).toEqual([]);
    expect(
      area(mergePaths([[box()], [box(2)], [box(5)]], "intersect", budget())),
    ).toBe(50);
    expect(
      area(mergePaths([[box()], [box()], [box()]], "exclude", budget())),
    ).toBe(100);
    expect(mergePaths([], "union", budget())).toEqual([]);
  });
  it("expands/contracts closed contours and quantizes fractional offsets", () => {
    expect(area(offsetPaths([box()], 2, "miter", 4, budget()))).toBe(196);
    expect(area(offsetPaths([box()], -2, "miter", 4, budget()))).toBe(36);
    expect(offsetPaths([box()], -6, "miter", 4, budget())).toEqual([]);
    expect(area(offsetPaths([box(0, 1)], 0.125, "miter", 4, budget()))).toBe(
      1.5625,
    );
    const paths = [box()];
    expect(offsetPaths(paths, 0, "round", 4, budget())).toBe(paths);
  });
  it("offsets open paths to the signed left normal, retaining endpoints/topology", () => {
    const open = line([
      [0, 0],
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const output = offsetPaths([open], 2, "miter", 4, budget())[0]!;
    expect(output.closed).toBe(false);
    expect(output.vertices).toEqual([
      [0, 2],
      [8, 2],
      [8, 10],
    ]);
    expect(
      offsetPaths(
        [
          line([
            [0, 0],
            [0, 10],
          ]),
        ],
        -2,
        "bevel",
        4,
        budget(),
      )[0]!.vertices,
    ).toEqual([
      [2, 0],
      [2, 10],
    ]);
    const outer = offsetPaths([open], -2, "round", 4, budget())[0]!;
    expect(outer.vertices.length).toBeGreaterThan(4);
    expect(outer.vertices[0]).toEqual([0, -2]);
    expect(outer.vertices.at(-1)).toEqual([12, 10]);
  });
  it("rejects clipping complexity and oversized round-offset work before library execution", () => {
    const many = Array.from({ length: 257 }, (_, i) => [box(i * 20)]);
    expect(() => mergePaths(many, "union", budget())).toThrow(
      /complexity budget/,
    );
    expect(() => offsetPaths([box()], 1e9, "round", 4, budget())).toThrow(
      /work budget/,
    );
    expect(SHAPE_LIMITS.polygonVertices).toBe(1024);
  });
});

describe("native deterministic path deformation", () => {
  it("rounds open corners with circular handles while retaining endpoints", () => {
    const rounded = roundCorners(
      line([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
      2,
      budget(),
    );
    expect(rounded.vertices[0]).toEqual([0, 0]);
    expect(rounded.vertices[1]![0]).toBeCloseTo(8);
    expect(rounded.vertices[2]![1]).toBeCloseTo(2);
    expect(rounded.vertices.at(-1)).toEqual([10, 10]);
    expect(rounded.outTangents![1]![0]).toBeGreaterThan(1);
  });
  it("puckers vertices inward and moves absolute cubic controls outward", () => {
    const source: BezierPath = {
      ...line([
        [-10, 0],
        [10, 0],
      ]),
      outTangents: [
        [0, 10],
        [0, 0],
      ],
    };
    const result = puckerBloat(source, 0.5, budget());
    expect(result.vertices).toEqual([
      [-5, 0],
      [5, 0],
    ]);
    expect(result.outTangents![0]).toEqual([-10, 15]);
    expect(puckerBloat(source, -1, budget()).vertices).toEqual([
      [-20, 0],
      [20, 0],
    ]);
    expect(source.vertices).toEqual([
      [-10, 0],
      [10, 0],
    ]);
  });
  it("twists interior path samples clockwise with center-to-edge falloff", () => {
    const source = line([
      [10, 0],
      [5, 0],
    ]);
    const result = twistPath(source, 180, [0, 0], budget());
    expect(result.vertices[0]).toEqual([10, 0]);
    expect(result.vertices.at(-1)![0]).toBeCloseTo(0);
    expect(result.vertices.at(-1)![1]).toBeCloseTo(5);
    expect(result.vertices.length).toBeGreaterThan(2);
    expect(bezierBounds(result)!.bottom).toBeGreaterThanOrEqual(5);
    expect(() => twistPath(source, 1e9, [0, 0], budget())).toThrow(
      /work budget/,
    );
  });
  it("wiggles repeatably across reverse seeks, with declared identity and smooth handles", () => {
    const source = box(),
      options = {
        size: 3,
        detail: 2,
        frequency: 1,
        evolution: 0,
        seed: 42,
        smooth: true,
      };
    const first = wigglePath(source, "a", options, 0.75, budget());
    wigglePath(source, "a", options, 8, budget());
    expect(wigglePath(source, "a", options, 0.75, budget())).toEqual(first);
    expect(wigglePath(source, "b", options, 0.75, budget())).not.toEqual(first);
    expect(wigglePath(source, "a", options, 0.25, budget())).not.toEqual(first);
    expect(first.vertices).toHaveLength(8);
    expect(first.inTangents).toHaveLength(8);
    expect(flattenBezier(first).length).toBeGreaterThan(8);
  });
  it("zigzags by original segment arc length, retaining endpoints and optional smoothness", () => {
    const source = line([
      [0, 0],
      [8, 0],
    ]);
    const result = zigzagPath(source, 2, 1, false, budget());
    expect(result.vertices).toEqual([
      [0, 0],
      [2, 2],
      [4, 0],
      [6, -2],
      [8, 0],
    ]);
    expect(zigzagPath(source, 2, 1, true, budget()).outTangents).toHaveLength(
      5,
    );
    const closed = zigzagPath(box(), 1, 1, false, budget());
    expect(closed.closed).toBe(true);
    expect(closed.vertices).toHaveLength(16);
  });
  it("returns original geometry for zero operators and handles degenerate paths", () => {
    const source = box();
    expect(roundCorners(source, 0, budget())).toBe(source);
    expect(puckerBloat(source, 0, budget())).toBe(source);
    expect(twistPath(source, 0, [0, 0], budget())).toBe(source);
    expect(zigzagPath(source, 0, 3, false, budget())).toBe(source);
    const degenerate = line([
      [0, 0],
      [0, 0],
    ]);
    expect(twistPath(degenerate, 30, [0, 0], budget())).toBe(degenerate);
    expect(
      wigglePath(
        degenerate,
        "a",
        {
          size: 1,
          detail: 1,
          frequency: 1,
          evolution: 0,
          seed: 0,
          smooth: false,
        },
        1,
        budget(),
      ),
    ).toBe(degenerate);
  });
});
