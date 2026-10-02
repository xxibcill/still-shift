import assert from "node:assert/strict";
import type { Composition } from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  multiplyMatrix,
  nodeMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { storyCameraTransform } from "../../packages/renderer-core/src/story-camera.ts";
import type { StoryRenderScene } from "../../packages/renderer-core/src/story-scene.ts";

/** Compare every source node in reverse frame order, independently of pixel parity. */
export function assertStoryCompositionState(
  scene: StoryRenderScene,
  composition: Composition,
) {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
    const tree = evaluateComp(composition, frame);
    assert.deepEqual(
      tree.diagnostics.filter((d) => d.severity === "error"),
      [],
    );
    const actual = new Map(tree.layers.map((layer) => [layer.id, layer]));
    const expected = new Map<string, { matrix: Matrix; opacity: number }>();
    const visit = (id: string): { matrix: Matrix; opacity: number } => {
      const cached = expected.get(id);
      if (cached) return cached;
      const node = nodes.get(id)!;
      const state = evaluatePreparedNode(scene, node, frame);
      const parent = node.parent ? visit(node.parent) : undefined;
      const camera = storyCameraTransform(scene, id, frame);
      const result = {
        matrix: multiplyMatrix(
          parent?.matrix ?? [
            camera.scale,
            0,
            0,
            camera.scale,
            camera.x,
            camera.y,
          ],
          nodeMatrix(node, state),
        ),
        opacity: (parent?.opacity ?? 1) * state.opacity,
      };
      const layer = actual.get(id)!;
      const location = `${id} at frame ${frame}`;
      result.matrix.forEach((value, axis) =>
        assert.ok(
          Math.abs(layer.screenMatrix[axis]! - value) <= 0.001,
          `${location}: matrix[${axis}]`,
        ),
      );
      assert.ok(
        Math.abs(layer.opacity - result.opacity) <= 1e-10,
        `${location}: opacity`,
      );
      if (node.type === "image") {
        assert.equal(
          layer.state,
          Math.round(state.state),
          `${location}: state`,
        );
        if (layer.stateFrom !== undefined) {
          assert.equal(
            layer.stateFrom,
            Math.round(state.stateFrom ?? state.state),
            `${location}: stateFrom`,
          );
          assert.equal(
            layer.stateMix,
            state.stateMix ?? 1,
            `${location}: stateMix`,
          );
        }
      }
      expected.set(id, result);
      return result;
    };
    for (const node of scene.nodes) visit(node.id);
  }
}
