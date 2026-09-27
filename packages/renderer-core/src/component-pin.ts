import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { resolveComponentAnchor } from "./component-annotations.ts";
import { parentWorldMatrix } from "./commerce-geometry.ts";
import { inverseMatrix, transformPoint } from "./node-transform.ts";
import { validatePositionParents } from "./component-travel.ts";
import { componentCapabilities } from "./component-capabilities.ts";

type Scene = CommerceRenderScene | StoryRenderScene;
export function applyComponentPin(
  scene: Scene,
  node: PreparedNode,
  frame: number,
  state: { x: number; y: number },
) {
  if (!scene.componentData) return;
  const pin = componentCapabilities(scene.componentData).pins.find(
    (p) => p.target === node.id,
  );
  if (!pin) return;
  const point = transformPoint(
    inverseMatrix(parentWorldMatrix(scene, node, frame)),
    resolveComponentAnchor(scene, pin.anchor, frame),
  );
  state.x = point[0] - node.width * node.origin[0];
  state.y = point[1] - node.height * node.origin[1];
  if (![state.x, state.y].every(Number.isFinite))
    throw new Error("Pin projection must be finite: " + pin.id);
}
export function validatePinTransforms(scene: Scene) {
  for (const pin of componentCapabilities(scene.componentData).pins) {
    const node = scene.nodes.find((n) => n.id === pin.target)!;
    validatePositionParents(scene, node);
    for (let frame = 0; frame < scene.frameCount; frame++)
      applyComponentPin(scene, node, frame, { x: 0, y: 0 });
  }
}
