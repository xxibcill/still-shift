import { describe, expect, it } from "vitest";
import {
  ShapeContentsSchema,
  type ShapeContent,
} from "@still-shift/scene-contract";
import { ShapeGeometryBudget } from "../../packages/renderer-core/src/composition/shapes/budget.ts";
import {
  sampleShapes,
  clampShapes,
} from "../../packages/renderer-core/src/composition/shapes/sample.ts";
import { compileShapes } from "../../packages/renderer-core/src/composition/shapes/compile.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";

const rect = { id: "rect", type: "rect", size: [10, 10] } as const;
const fill = { id: "fill", type: "fill", color: "#ff0000" } as const;
const repeat = {
  id: "repeat",
  type: "repeater",
  copies: 3,
  transform: { position: [5, 0] },
  startOpacity: 1,
  endOpacity: 0.5,
  order: "above",
} as const;
const gradient = {
  id: "gradient",
  type: "gradient-fill",
  gradient: "linear",
  start: [0, 0],
  end: [10, 0],
  stops: [
    { id: "a", offset: 0, color: "#000000" },
    { id: "b", offset: 1, color: "#ffffff" },
  ],
} as const;
function compile(contents: unknown[], time = 0) {
  const budget = new ShapeGeometryBudget({
    node: "shape",
    frame: time,
    path: "shape",
  });
  return compileShapes(
    sampleShapes(ShapeContentsSchema.parse(contents), time, 24, budget),
    time / 24,
    budget,
  );
}

describe("native sampled shape state", () => {
  it("preserves smooth zig-zag handles through sampling and compilation", () => {
    const contents = [
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [100, 0],
          ],
        },
      },
      { id: "zig", type: "zig-zag", size: 10, ridges: 2 },
      { id: "stroke", type: "stroke", width: 2, color: "#ff0000" },
    ];
    const smooth = compile([
      contents[0],
      { ...contents[1], points: "smooth" },
      contents[2],
    ]).draws[0]!.paths[0]!.path;
    const corner = compile([
      contents[0],
      { ...contents[1], points: "corner" },
      contents[2],
    ]).draws[0]!.paths[0]!.path;
    expect(smooth.vertices).toEqual(corner.vertices);
    expect(smooth.inTangents?.some(([x, y]) => x !== 0 || y !== 0)).toBe(true);
    expect(smooth.outTangents?.some(([x, y]) => x !== 0 || y !== 0)).toBe(true);
    expect(corner.inTangents).toBeUndefined();
    expect(corner.outTangents).toBeUndefined();
  });
  it("still samples animated polystar point counts as numeric fields", () => {
    const sampled = sampleShapes(
      ShapeContentsSchema.parse([
        {
          id: "star",
          type: "polystar",
          kind: "star",
          points: {
            keys: [
              { frame: 0, value: 5 },
              { frame: 10, value: 7 },
            ],
          },
          outerRadius: 20,
          innerRadius: 10,
        },
      ]),
      5,
      24,
      new ShapeGeometryBudget(),
    );
    expect(sampled[0]).toMatchObject({ points: 6 });
  });
  it("samples explicit vectors, nested transforms/stops and defaults without traversing metadata", () => {
    const authored = ShapeContentsSchema.parse([
      {
        id: "group",
        type: "group",
        metadata: { keyed: { keys: [{ frame: 0, value: 8 }] } },
        contents: [
          {
            ...rect,
            position: {
              x: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 10, value: 10 },
                ],
              },
              y: 7,
            },
          },
          gradient,
        ],
      },
    ]);
    const sampled = sampleShapes(authored, 5, 24, new ShapeGeometryBudget());
    const group = sampled[0]!;
    expect(group.type).toBe("group");
    if (group.type !== "group") throw Error("group");
    expect(group.transform).toEqual({
      anchor: [0, 0],
      position: [0, 0],
      scale: [1, 1],
      rotation: 0,
      skewX: 0,
      skewY: 0,
      opacity: 1,
    });
    expect(group.contents[0]).toMatchObject({ position: [5, 7], roundness: 0 });
    expect(group.contents[1]).toMatchObject({
      stops: [
        { id: "a", offset: 0, color: [0, 0, 0, 1] },
        { id: "b", offset: 1, color: [1, 1, 1, 1] },
      ],
    });
    expect(group).not.toHaveProperty("metadata");
    expect(authored[0]).toHaveProperty("metadata");
  });
  it("clamps driven native fields and rejects nonfinite geometry inputs", () => {
    const sampled = sampleShapes(
      ShapeContentsSchema.parse([rect, fill]),
      0,
      24,
      new ShapeGeometryBudget(),
    );
    const shape = sampled[0]!;
    if (shape.type !== "rect") throw Error("rect");
    shape.size = [-10, 2e6];
    clampShapes(sampled, new ShapeGeometryBudget());
    expect(shape.size).toEqual([0, 1e6]);
    shape.roundness = NaN;
    expect(() => clampShapes(sampled, new ShapeGeometryBudget())).toThrow(
      /finite/,
    );
  });
  it("reserves path work before allocating sampled vertex arrays", () => {
    const budget = new ShapeGeometryBudget();
    budget.vertices(262143);
    const source: ShapeContent[] = [
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [10, 0],
          ],
        },
      },
    ];
    expect(() => sampleShapes(source, 0, 24, budget)).toThrow(/work budget/);
  });
});

describe("native shape paint compilation", () => {
  it.each(["stroke", "gradient-stroke"] as const)(
    "includes diagonal square-cap corners in %s bounds for every join",
    (type) => {
      const paint =
        type === "stroke"
          ? { id: "paint", type, color: "#ff0000" }
          : { ...gradient, id: "paint", type };
      for (const join of ["round", "bevel", "miter"] as const) {
        const compiled = compile([
          {
            id: "path",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [0, 0],
                [10, 10],
              ],
            },
          },
          { ...paint, width: 10, cap: "square", join, miterLimit: 1 },
        ]);
        const extension = Math.sqrt(50);
        expect(compiled.bounds!.left).toBeLessThanOrEqual(-extension);
        expect(compiled.bounds!.top).toBeLessThanOrEqual(-extension);
        expect(compiled.bounds!.right).toBeGreaterThanOrEqual(10 + extension);
        expect(compiled.bounds!.bottom).toBeGreaterThanOrEqual(10 + extension);
      }
    },
  );
  it("paints only preceding paths, executes paints bottom-to-top and applies later operators", () => {
    const compiled = compile([
      fill,
      rect,
      { ...fill, id: "blue", color: "#0000ff" },
      { ...fill, id: "red" },
      { id: "trim", type: "trim-paths", end: 0.25 },
    ]);
    expect(compiled.draws.map((draw) => draw.paint.id)).toEqual([
      "red",
      "blue",
    ]);
    expect(
      compiled.draws.every((draw) => draw.paths[0]!.path.closed === false),
    ).toBe(true);
    expect(compiled.draws[0]!.paths[0]!.path.vertices).toEqual([
      [-5, -5],
      [5, -5],
    ]);
    expect(compile([fill, rect]).draws).toEqual([]);
  });
  it("keeps child paint transforms separate from outer fixed stroke width", () => {
    const compiled = compile([
      {
        id: "group",
        type: "group",
        transform: { scale: [2, 2], opacity: 0.25 },
        contents: [rect, fill],
      },
      {
        id: "stroke",
        type: "stroke",
        width: 2,
        color: "#000000",
        join: "bevel",
      },
    ]);
    expect(compiled.draws.map((draw) => draw.paint.id)).toEqual([
      "stroke",
      "fill",
    ]);
    expect(compiled.draws[0]!.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(compiled.draws[0]!.paths[0]!.path.vertices[0]).toEqual([-10, -10]);
    expect(compiled.draws[0]!.opacity).toBe(1);
    expect(compiled.draws[1]!.matrix).toEqual([2, 0, 0, 2, 0, 0]);
    expect(compiled.draws[1]!.paths[0]!.path.vertices[0]).toEqual([-5, -5]);
    expect(compiled.draws[1]!.opacity).toBe(0.25);
    expect(compiled.bounds).toEqual({
      left: -11,
      top: -11,
      right: 11,
      bottom: 11,
    });
  });
  it("keeps parent operators connected to painted descendants through nested groups", () => {
    const contents = [
      {
        id: "outer",
        type: "group",
        transform: { position: [20, 0] },
        contents: [
          {
            id: "inner",
            type: "group",
            transform: { scale: [2, 1] },
            contents: [
              {
                id: "path",
                type: "path",
                path: {
                  closed: false,
                  vertices: [
                    [0, 0],
                    [10, 0],
                  ],
                },
              },
              fill,
            ],
          },
        ],
      },
      { id: "trim", type: "trim-paths", end: 0.5 },
    ];
    const compiled = compile(contents);
    expect(compiled.draws).toHaveLength(1);
    expect(compiled.draws[0]!.paths[0]!.path.vertices).toEqual([
      [0, 0],
      [5, 0],
    ]);
    expect(compiled.bounds).toEqual({ left: 20, top: 0, right: 30, bottom: 0 });
    const repeated = compile([
      ...contents,
      { ...repeat, copies: 2, startOpacity: 1, endOpacity: 1 },
    ]);
    expect(repeated.draws).toHaveLength(2);
    expect(repeated.draws.map((draw) => draw.paths[0]!.path.vertices)).toEqual([
      [
        [0, 0],
        [5, 0],
      ],
      [
        [0, 0],
        [5, 0],
      ],
    ]);
    expect(repeated.draws.map((draw) => draw.matrix[4])).toEqual([20, 25]);
  });
  it("retains local gradients for painted copies and compound coordinates for later paint", () => {
    const painted = compile([rect, gradient, repeat]);
    expect(painted.draws).toHaveLength(3);
    expect(painted.draws.map((draw) => draw.opacity)).toEqual([1, 0.75, 0.5]);
    expect(painted.draws.map((draw) => draw.paths.length)).toEqual([1, 1, 1]);
    expect(
      painted.draws.map((draw) => draw.paths[0]!.path.vertices[0]),
    ).toEqual([
      [-5, -5],
      [-5, -5],
      [-5, -5],
    ]);
    expect(
      painted.draws.map((draw) => transformPoint(draw.matrix, [0, 0])),
    ).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
    ]);
    const compound = compile([
      rect,
      { ...repeat, startOpacity: 1, endOpacity: 1 },
      gradient,
    ]);
    expect(compound.draws).toHaveLength(1);
    expect(
      compound.draws[0]!.paths.map((path) => path.path.vertices[0]),
    ).toEqual([
      [-5, -5],
      [0, -5],
      [5, -5],
    ]);
    expect(compound.draws[0]!.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it("orders below/above overlapping copies and applies fractional opacity once", () => {
    const compiled = compile([
      rect,
      fill,
      { ...repeat, order: "below", copies: 2.5 },
    ]);
    expect(compiled.draws.map((draw) => draw.matrix[4])).toEqual([10, 5, 0]);
    expect(compiled.draws.map((draw) => draw.opacity)).toEqual([0.25, 0.75, 1]);
    expect(compile([rect, fill, { ...repeat, copies: 0 }]).draws).toEqual([]);
  });
  it("does not square copies when paint precedes repeat and another paint follows", () => {
    const compiled = compile([
      rect,
      fill,
      { ...repeat, startOpacity: 1, endOpacity: 1 },
      { id: "stroke", type: "stroke", width: 1, color: "#000000" },
    ]);
    expect(compiled.draws.map((draw) => draw.paths.length)).toEqual([
      3, 1, 1, 1,
    ]);
  });
  it("keeps repeated declared IDs attached to their own paints during individual trim", () => {
    const compiled = compile([
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [10, 0],
          ],
        },
      },
      fill,
      { ...repeat, copies: 2, startOpacity: 1, endOpacity: 1 },
      { id: "trim", type: "trim-paths", mode: "individual", end: 0.75 },
    ]);
    expect(compiled.draws.map((draw) => draw.paths[0]!.id)).toEqual([
      "path",
      "path",
    ]);
    expect(compiled.draws.map((draw) => draw.paths[0]!.path.vertices)).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 0],
        [5, 0],
      ],
    ]);
  });
  it("paints merged contours once, preserves holes, and keeps collapsed geometry empty", () => {
    const compiled = compile([
      { ...rect, size: [20, 20] },
      { ...rect, id: "hole" },
      fill,
      { id: "merge", type: "merge-paths", mode: "subtract" },
    ]);
    expect(compiled.draws).toHaveLength(1);
    expect(compiled.draws[0]!.paths).toHaveLength(2);
    expect(
      compile([rect, fill, { id: "offset", type: "offset-path", amount: -6 }])
        .draws,
    ).toEqual([]);
    expect(compile([{ ...rect, size: [0, 0] }, fill]).bounds).toBeNull();
  });
  it("retains collapsed child geometry for outer stroke and tiny invertible child paints", () => {
    const collapsed = compile([
      {
        id: "group",
        type: "group",
        transform: { scale: [0, 1] },
        contents: [rect, fill],
      },
      { id: "stroke", type: "stroke", width: 2, color: "#000000" },
    ]);
    expect(collapsed.draws.map((draw) => draw.paint.id)).toEqual(["stroke"]);
    const tiny = compile([
      {
        id: "group",
        type: "group",
        transform: { scale: [1e-8, 1e-8] },
        contents: [rect, fill],
      },
    ]);
    expect(tiny.draws).toHaveLength(1);
    expect(tiny.draws[0]!.paths[0]!.path.vertices[0]![0]).toBeCloseTo(-5);
  });
  it("bounds empty virtual binding/copy work instead of exponentially allocating", () => {
    const contents = [
      { ...rect, size: [0, 0] },
      ...Array.from({ length: 4 }, (_, i) => ({
        ...repeat,
        id: `repeat${i}`,
        copies: 256,
      })),
    ];
    expect(() => compile(contents)).toThrow(/work budget/);
  });
});
