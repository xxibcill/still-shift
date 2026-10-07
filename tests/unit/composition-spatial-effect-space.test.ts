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

function scene(transform: CompositionTransform, source = transform) {
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
        type: "solid",
        threeD: true,
        size: [20, 20],
        color: "#ffffff",
        transform: source,
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
