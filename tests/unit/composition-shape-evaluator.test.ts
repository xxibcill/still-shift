import { describe, expect, it } from "vitest";
import {
  validateComposition,
  resolvePropertyPath,
  type Composition,
  type ShapeContent,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
  evaluateStageProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import {
  shapeNibs,
  nibSampler,
} from "../../packages/renderer-core/src/composition/shapes/nib.ts";
import { pointOnPath } from "../../packages/renderer-core/src/prepared-scene.ts";
import { ShapeGeometryBudget } from "../../packages/renderer-core/src/composition/shapes/budget.ts";
import { inkStrokeOutline } from "../../packages/renderer-core/src/ink-path.ts";
import { brushStroke } from "../../packages/renderer-core/src/brush-path.ts";
import { sampleShapes } from "../../packages/renderer-core/src/composition/shapes/sample.ts";

const comp = (contents: ShapeContent[]): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 200,
  height: 100,
  fps: 24,
  frameCount: 180,
  assets: [],
  layers: [{ id: "shape", type: "shape", contents }],
});
const rect: ShapeContent = { id: "rect", type: "rect", size: [20, 10] };
const fill: ShapeContent = { id: "fill", type: "fill", color: "#ff0000" };
function failed(run: () => unknown) {
  try {
    run();
    throw Error("expected failure");
  } catch (error) {
    return passageDiagnostics(error);
  }
}

describe("native shape evaluation and property integration", () => {
  it("keeps square-cap coverage visible when the centerline is offscreen", () => {
    const doc = comp([
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: [
            [75, 25],
            [100, 50],
          ],
        },
      },
      {
        id: "stroke",
        type: "stroke",
        width: 20,
        color: "#ff0000",
        cap: "square",
        join: "round",
      },
    ]);
    doc.width = 64;
    const graph = buildRenderGraph(doc, evaluateComp(doc, 0));
    expect(graph.culled).toEqual([]);
    expect(graph.root.ops).toHaveLength(1);
  });
  it("accepts empty shapes and samples cubic bounds, culling and immutable source", () => {
    expect(validateComposition(comp([])).ok).toBe(true);
    const doc = comp([rect, fill]);
    doc.layers[0]!.transform = { position: [60, 40] };
    const before = JSON.stringify(doc),
      tree = evaluateComp(doc, 12),
      state = tree.layers[0]!;
    expect(state.shapes!.bounds).toEqual({
      left: -10,
      top: -5,
      right: 10,
      bottom: 5,
    });
    expect(state.bounds).toEqual({ left: 50, top: 35, right: 70, bottom: 45 });
    expect(state.drawable).toBe(true);
    expect(buildRenderGraph(doc, tree).root.ops[0]).toMatchObject({
      kind: "draw",
      content: { type: "shape" },
    });
    expect(JSON.stringify(doc)).toBe(before);
    const off = structuredClone(doc);
    off.layers[0]!.transform!.position = [400, 40];
    expect(buildRenderGraph(off, evaluateComp(off, 12)).culled).toEqual([
      "shape",
    ]);
    expect(evaluateComp(comp([]), 0).layers[0]!.bounds).toBeNull();
  });
  it("resolves nested selectors and reads/writes vector, color and gradient-stop components", () => {
    const doc = comp([
      {
        id: "g",
        type: "group",
        contents: [
          rect,
          {
            id: "gradient",
            type: "gradient-fill",
            gradient: "linear",
            start: [0, 0],
            end: [20, 0],
            stops: [
              { id: "a", offset: 0, color: "#000000" },
              { id: "b", offset: 1, color: "#ffffff" },
            ],
          },
        ],
      },
    ]);
    doc.expressions = {
      "shape.contents[g].contents[rect].position.x": { source: "7" },
      "shape.contents[g].contents[gradient].stops[a].color": {
        source: "rgba(1,0,0,1)",
      },
    };
    expect(validateComposition(doc).ok).toBe(true);
    expect(
      evaluateProperty(doc, "shape.contents[g].contents[rect].position.x", 8),
    ).toBe(7);
    expect(
      evaluateProperty(
        doc,
        "shape.contents[g].contents[gradient].stops[a].color.r",
        8,
      ),
    ).toBe(1);
    expect(
      resolvePropertyPath(doc, "shape.contents[g].contents[rect].metadata.x"),
    ).toMatchObject({ code: "comp-path-property" });
    expect(
      resolvePropertyPath(doc, "shape.contents[g].transform.position.y"),
    ).toMatchObject({ type: "scalar" });
  });
  it("samples shape drivers and keyed loop helpers through the actual evaluator", () => {
    const doc = comp([
      {
        ...rect,
        position: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 10, value: [10, 0], interpolation: "linear" },
          ],
        },
      },
      fill,
    ]);
    doc.signals = [
      {
        id: "growth",
        keys: [
          { frame: 0, value: 20 },
          { frame: 20, value: 40, interpolation: "linear" },
        ],
      },
    ];
    doc.drivers = [
      {
        target: "shape.contents[rect].size.x",
        signal: "growth",
        blend: "replace",
      },
    ];
    doc.expressions = {
      "shape.contents[rect].position": { source: "loopOut('cycle')" },
    };
    expect(
      evaluateProperty(doc, "shape.contents[rect].size.x", 10),
    ).toBeCloseTo(30);
    expect(
      evaluateStageProperty(doc, "shape.contents[rect].position", 15).value,
    ).toEqual([5, 0]);
    expect(evaluateComp(doc, 15).layers[0]!.shapes!.bounds!.left).toBeCloseTo(
      -12.5,
    );
  });
  it("shares geometry work across historical expression reads and reports the root frame", () => {
    const doc = comp([
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: Array.from({ length: 1024 }, (_, i) => [i, i % 3]),
        },
      },
      rect,
    ]);
    doc.layers.push(
      ...Array.from({ length: 90 }, (_, i) => ({
        id: `n${i}`,
        type: "null" as const,
      })),
    );
    doc.expressions = Object.fromEntries(
      Array.from({ length: 90 }, (_, i) => [
        `n${i}.transform.rotation`,
        { source: `valueAtTime('shape.contents[rect].size.x', ${i}/24)` },
      ]),
    );
    const diagnostics = failed(() => evaluateComp(doc, 50));
    expect(diagnostics[0]).toMatchObject({
      code: "comp-shape-work-limit",
      frame: 50,
      node: "shape",
    });
  });
  it("shares work across visible sibling/precomp shape instances", () => {
    const content: ShapeContent[] = [
      rect,
      fill,
      { id: "repeat", type: "repeater", copies: 256 },
    ];
    const doc = comp([]);
    doc.precomps = [
      {
        id: "nested",
        width: 200,
        height: 100,
        frameCount: 180,
        layers: [{ id: "shape", type: "shape", contents: content }],
      },
    ];
    doc.layers = Array.from({ length: 12 }, (_, i) => ({
      id: `instance${i}`,
      type: "precomp",
      comp: "nested",
    }));
    expect(failed(() => evaluateComp(doc, 36))[0]).toMatchObject({
      code: "comp-shape-work-limit",
      frame: 36,
    });
  });
  it.each(["layer", "ancestor"] as const)(
    "keeps a scaled curved follower on its rendered contour through the %s transform",
    (scaleOwner) => {
      const doc = comp([
        { id: "ellipse", type: "ellipse", size: [0.1, 0.1] },
        { id: "stroke", type: "stroke", width: 0.002, color: "#ff0000" },
      ]);
      const placement = {
        position: [100, 100] as [number, number],
        scale: [1000, 1000] as [number, number],
      };
      if (scaleOwner === "layer") doc.layers[0]!.transform = placement;
      else {
        doc.layers[0]!.parent = "source-parent";
        doc.layers.push({
          id: "source-parent",
          type: "null",
          transform: placement,
        });
      }
      doc.layers.push({
        id: "target",
        type: "solid",
        size: [2, 2],
        color: "#ffffff",
      });
      doc.signals = [
        {
          id: "progress",
          keys: [
            { frame: 0, value: 0.125 },
            { frame: 1, value: 0.375 },
            { frame: 2, value: 0.625 },
            { frame: 3, value: 0.875 },
          ],
        },
      ];
      doc.constraints = [
        {
          type: "follow-path",
          target: "target",
          path: "shape",
          progress: "progress",
          orient: "tangent",
        },
      ];
      expect(validateComposition(doc).ok).toBe(true);
      const before = JSON.stringify(doc);
      for (const frame of [0, 1, 2, 3, 2, 1, 0]) {
        const target = evaluateComp(doc, frame).layers.find(
          (layer) => layer.id === "target",
        )!;
        const point = transformPoint(
          target.worldMatrix,
          target.constraintReference,
        );
        const degrees = 45 + frame * 90;
        const radians = (degrees * Math.PI) / 180;
        // Each key lands halfway through a quarter of the radius-50 cubic circle.
        expect(point[0]).toBeCloseTo(100 + 50 * Math.cos(radians), 6);
        expect(point[1]).toBeCloseTo(100 + 50 * Math.sin(radians), 6);
        expect(target.transform.rotation).toBeCloseTo(
          ((degrees + 270) % 360) - 180,
          6,
        );
      }
      expect(JSON.stringify(doc)).toBe(before);
    },
  );
  it("follows the first transformed contour by world arc length and compensates target parenting", () => {
    const doc = comp([
      {
        id: "path",
        type: "path",
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
        },
      },
    ]);
    doc.layers[0]!.transform = { position: [20, 20], scale: [2, 1] };
    doc.layers.push(
      {
        id: "parent",
        type: "null",
        transform: { position: [10, 0], rotation: 90 },
      },
      {
        id: "target",
        type: "solid",
        size: [2, 2],
        color: "#ffffff",
        parent: "parent",
      },
    );
    doc.signals = [
      {
        id: "progress",
        keys: [
          { frame: 0, value: 0.5 },
          { frame: 179, value: 0.5 },
        ],
      },
    ];
    doc.constraints = [
      {
        type: "follow-path",
        target: "target",
        path: "shape",
        progress: "progress",
        orient: "tangent",
      },
    ];
    const target = evaluateComp(doc, 0).layers.find(
      (layer) => layer.id === "target",
    )!;
    expect(
      transformPoint(target.worldMatrix, target.constraintReference)[0],
    ).toBeCloseTo(35);
    expect(
      transformPoint(target.worldMatrix, target.constraintReference)[1],
    ).toBeCloseTo(20);
    expect(target.transform.rotation).toBeCloseTo(-90);
    const empty = structuredClone(doc);
    (
      empty.layers[0] as Extract<
        Composition["layers"][number],
        { type: "shape" }
      >
    ).contents = [];
    expect(failed(() => evaluateComp(empty, 0))[0]).toMatchObject({
      code: "comp-shape-follow-empty",
      frame: 0,
    });
    const bad = structuredClone(doc);
    bad.constraints![0] = {
      type: "follow-path",
      target: "target",
      path: "parent",
      progress: "progress",
    };
    expect(
      validateComposition(bad).diagnostics.some(
        (d) => d.code === "comp-constraint-path",
      ),
    ).toBe(true);
  });
});

describe("native ink/brush geometry reuse", () => {
  it("retains legacy nib arithmetic on unequal segments and charges every lookup", () => {
    const points: [number, number][] = [
        [20, 40],
        [80, 20],
        [80, 20],
        [141, 43],
        [155, 47],
      ],
      sample = nibSampler(points, new ShapeGeometryBudget());
    for (let i = -1; i <= 513; i++)
      expect(sample(i / 512)).toEqual(pointOnPath({ points }, i / 512));
    const limited = new ShapeGeometryBudget({}, { vertices: 262144, paths: 0 });
    expect(() => nibSampler(points, limited)(1)).toThrow(
      /generated-vertex work budget/,
    );
  });
  it("uses original source coordinates and IDs for nib reveals, including dashed spans", () => {
    const points: [number, number][] = [
        [0, 0],
        [50, 0],
        [50, 50],
      ],
      source = {
        id: "connector",
        points,
        lineWidth: 10,
        pinchAt: 0.5,
        pinchWidth: 0.15,
      };
    for (const style of ["ink", "brush"] as const) {
      const paint = sampleShapes(
        [{ id: "stroke", type: "stroke", style, color: "#ffffff", width: 10 }],
        0,
        24,
        new ShapeGeometryBudget(),
      )[0]!;
      if (paint.type !== "stroke") throw Error("stroke");
      const geometry = {
        id: source.id,
        path: {
          closed: false,
          vertices: [
            [0, 0],
            [50, 0],
          ] as [number, number][],
        },
        opacity: 1,
        source: { points, span: [0, 0.5] as [number, number] },
      };
      const result = shapeNibs(geometry, paint, new ShapeGeometryBudget())![0]!;
      const legacy =
        style === "ink"
          ? { wash: [], body: inkStrokeOutline(source, 0, 0.5), cuts: [] }
          : brushStroke(source, 0, 0.5);
      const actualPoints = [result.wash, result.body, ...result.cuts],
        expectedPoints = [legacy.wash, legacy.body, ...legacy.cuts];
      expect(actualPoints.map((points) => points.length)).toEqual(
        expectedPoints.map((points) => points.length),
      );
      expect(actualPoints).toEqual(expectedPoints);
      const dashed = shapeNibs(
        geometry,
        { ...paint, dashes: [10, 10] },
        new ShapeGeometryBudget(),
      )!;
      expect(dashed).toHaveLength(3);
      expect(() =>
        shapeNibs(
          geometry,
          { ...paint, dashes: [1e-12, 1e-12] },
          new ShapeGeometryBudget(),
        ),
      ).toThrow(/work budget/);
    }
  });
});
