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
import { componentVisible } from "../../packages/renderer-core/src/component-visibility.ts";
import type { CommerceRenderScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import type { StoryRenderScene } from "../../packages/renderer-core/src/story-scene.ts";

/** Compare every source node in reverse frame order, independently of pixel parity. */
export function assertCompositionAdapterState(
  scene: StoryRenderScene | CommerceRenderScene,
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
    type Expected = { matrix: Matrix; opacity: number; visible: boolean };
    const expected = new Map<string, Expected>();
    const visit = (id: string): Expected => {
      const cached = expected.get(id);
      if (cached) return cached;
      const node = nodes.get(id)!;
      const state = evaluatePreparedNode(scene, node, frame);
      const parent = node.parent ? visit(node.parent) : undefined;
      const camera =
        scene.schemaVersion === "story-scene-1"
          ? storyCameraTransform(scene, id, frame)
          : { scale: 1, x: 0, y: 0 };
      const gate =
        scene.schemaVersion === "commerce-scene-1"
          ? scene.visibility?.find((gate) => gate.target === id)
          : undefined;
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
        opacity: componentVisible(scene, id, frame)
          ? (parent?.opacity ?? 1) * state.opacity
          : 0,
        visible:
          (parent?.visible ?? true) &&
          componentVisible(scene, id, frame) &&
          (!gate || (frame >= gate.start && frame < gate.end)),
      };
      const layer = actual.get(id)!;
      const location = `${id} at frame ${frame}`;
      assert.equal(layer.visible, result.visible, `${location}: visibility`);
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
