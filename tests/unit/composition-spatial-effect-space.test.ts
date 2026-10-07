import { expect, it } from "vitest";
import {
  CompositionSchema,
  type CompositionTransform,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  buildRenderGraph,
  type ProjectOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

function scene(
  transform: CompositionTransform,
  source = transform,
  sourceType: "solid" | "null" = "solid",
) {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "effect-space",
    width: 100,
    height: 100,
    fps: 24,
    frameCount: 24,
    assets: [],
    layers: [
      {
        id: "owner",
        type: "solid",
        threeD: true,
        size: [20, 20],
        color: "#ffffff",
        transform,
        effects: [{ id: "sweep", effect: "light.sweep", space: "source" }],
      },
      {
        id: "source",
        type: sourceType,
        threeD: true,
        transform: source,
        ...(sourceType === "solid" ? { size: [20, 20], color: "#ffffff" } : {}),
      },
    ],
  });
}

it.each([
  { rotationX: 25, rotationY: 30, rotation: 20 },
  { rotationX: -40, rotationY: 65, rotation: 33 },
])("accepts identical rotated effect planes: %o", (rotation) => {
  const doc = scene({ position: [50, 50, 0], ...rotation });
  const tree = evaluateComp(doc, 5.5);
  expect(tree.layers[0]!.worldMatrix3d).toEqual(tree.layers[1]!.worldMatrix3d);
  const op = buildRenderGraph(doc, tree).root.ops.find(
    (op) => op.layer === "owner",
  ) as ProjectOp;
  expect(op.kind).toBe("project");
  const local = op.surface.ops[0]!;
  expect(local.kind).toBe("isolate");
  if (local.kind !== "isolate") throw Error("Expected local sweep");
  const matrix = local.effects[0]!.placement!.matrix;
  for (const [index, value] of [1, 0, 0, 1, 0, 0].entries())
    expect(matrix[index]).toBeCloseTo(value, 12);
});

it("retains affine source anchor offsets on a common perspective plane", () => {
  const transform: CompositionTransform = {
    anchor: [10, 10, 0],
    position: [50, 50, 0],
    rotationY: 25,
  };
  const doc = scene(transform, { ...transform, anchor: [0, 0, 0] });
  const op = buildRenderGraph(doc, evaluateComp(doc, 0)).root.ops.find(
    (op) => op.layer === "owner",
  ) as ProjectOp;
  const local = op.surface.ops[0]!;
  if (local.kind !== "isolate") throw Error("Expected local sweep");
  for (const [index, value] of [1, 0, 0, 1, 10, 10].entries())
    expect(local.effects[0]!.placement!.matrix[index]).toBeCloseTo(value, 12);
});

it("continues rejecting genuinely projective effect-space relations", () => {
  const doc = scene(
    { position: [50, 50, 0], rotationY: 25 },
    { position: [50, 50, 0] },
  );
  expect(() => buildRenderGraph(doc, evaluateComp(doc, 0))).toThrow(
    /affine relation/,
  );
});

it.each([
  { anchor: [0, 0, 0], position: [50, 50, 100] },
  { anchor: [10, 10, 0], position: [50, 50, 0], rotationY: 25 },
  {
    anchor: [10, 10, 0],
    position: [50, 50, 0],
    rotationX: 25,
    rotationY: 30,
    rotation: 20,
  },
] satisfies CompositionTransform[])(
  "uses projected null-guide coordinates on a common plane: %o",
  (transform) => {
    const doc = scene(transform, transform, "null");
    doc.layers[1]!.enabled = false;
    doc.layers[1]!.guide = true;
    const tree = evaluateComp(doc, 5.5);
    expect(tree.layers[0]!.worldMatrix3d).toEqual(
      tree.layers[1]!.worldMatrix3d,
    );
    const op = buildRenderGraph(doc, tree).root.ops[0] as ProjectOp;
    expect(op.kind).toBe("project");
    const local = op.surface.ops[0]!;
    if (local.kind !== "isolate") throw Error("Expected local sweep");
    for (const [index, value] of [1, 0, 0, 1, 0, 0].entries())
      expect(local.effects[0]!.placement!.matrix[index]).toBeCloseTo(value, 12);
  },
);

it("projects a 2D null guide inheriting its parent's spatial world", () => {
  const transform: CompositionTransform = {
    anchor: [0, 0],
    position: [10, 10],
  };
  const doc = scene(transform, transform, "null");
  doc.layers[0]!.parent = doc.layers[1]!.parent = "pivot";
  doc.layers[1]!.threeD = false;
  doc.layers.push({
    id: "pivot",
    type: "null",
    threeD: true,
    transform: { position: [50, 50, 100], rotationY: 25 },
  });
  const parsed = CompositionSchema.parse(doc);
  const tree = evaluateComp(parsed, 0);
  expect(tree.layers[0]!.worldMatrix3d).toEqual(tree.layers[1]!.worldMatrix3d);
  const op = buildRenderGraph(parsed, tree).root.ops[0] as ProjectOp;
  const local = op.surface.ops[0]!;
  if (local.kind !== "isolate") throw Error("Expected local sweep");
  for (const [index, value] of [1, 0, 0, 1, 0, 0].entries())
    expect(local.effects[0]!.placement!.matrix[index]).toBeCloseTo(value, 12);
});

it("uses a null guide's owning precomp camera", () => {
  const transform: CompositionTransform = {
    anchor: [0, 0, 0],
    position: [50, 50, 100],
  };
  const child = scene(transform, transform, "null");
  child.layers.push({
    id: "child-camera",
    type: "camera",
    zoom: 100,
    transform: { position: [50, 50, -200] },
  });
  const doc = CompositionSchema.parse({
    ...child,
    layers: [
      {
        id: "root-camera",
        type: "camera",
        zoom: 200,
        transform: { position: [50, 50, -50] },
      },
      { id: "instance", type: "precomp", comp: "inner" },
    ],
    precomps: [
      {
        id: "inner",
        width: 100,
        height: 100,
        frameCount: 24,
        layers: child.layers,
      },
    ],
  });
  const root = buildRenderGraph(doc, evaluateComp(doc, 0)).root.ops[0]!;
  if (root.kind !== "draw" || root.content.type !== "surface")
    throw Error("Expected flat precomp");
  const op = root.content.surface.ops[0] as ProjectOp;
  const local = op.surface.ops[0]!;
  if (local.kind !== "isolate") throw Error("Expected local sweep");
  for (const [index, value] of [1, 0, 0, 1, 0, 0].entries())
    expect(local.effects[0]!.placement!.matrix[index]).toBeCloseTo(value, 12);
});

it("rejects genuinely projective null-guide coordinate relations", () => {
  const doc = scene(
    { position: [50, 50, 0], rotationY: 25 },
    { position: [50, 50, 0] },
    "null",
  );
  expect(() => buildRenderGraph(doc, evaluateComp(doc, 0))).toThrow(
    /affine relation/,
  );
});
