import { expect, it } from "vitest";
import { evaluateComp } from "@still-shift/renderer-core";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { stackedMeshComposition } from "../helpers/composition-mesh-stack-reference.ts";

it.each([false, true])(
  "retains all intermediate owner meshes (group=%s)",
  (group) => {
    for (const delta of [-32, 32]) {
      const comp = stackedMeshComposition(
        ["distort.mesh-warp", "distort.puppet", "distort.mesh-warp"],
        [delta, delta, -2 * delta],
        group,
      );
      const graph = buildRenderGraph(comp, evaluateComp(comp, 0));
      const op = graph.root.ops[0]!;
      expect(op.kind).toBe("draw");
      if (op.kind !== "draw" || op.content.type !== "surface")
        throw Error("Expected extended owner mesh capture");
      expect(op.content.surface.width).toBe(delta < 0 ? 96 : 80);
      expect(op.matrix[4]).toBe(delta < 0 ? -64 : 0);
    }
  },
);

it("does not capture final offscreen output that cannot reenter through a later mesh", () => {
  const comp = stackedMeshComposition(["distort.puppet"], [10000]);
  expect(() => buildRenderGraph(comp, evaluateComp(comp, 0))).not.toThrow();
});

it("preserves the existing capture cap for intermediate mesh output", () => {
  const comp = stackedMeshComposition(
    ["distort.puppet", "distort.puppet"],
    [10000, -10000],
  );
  expect(() => buildRenderGraph(comp, evaluateComp(comp, 0))).toThrow(
    /exceed 8192 pixels/,
  );
});
