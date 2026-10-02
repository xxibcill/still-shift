import { nodeMatrix, transformPoint } from "./node-transform.ts";
import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import { projectStoryPoint } from "./story-camera.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { connectorPoints } from "./connector-points.ts";

export function storyAnchorPosition(
  scene: StoryRenderScene,
  id: string,
  point: [number, number],
  frame: number,
): [number, number] {
  const node = scene.nodes.find((node) => node.id === id)!;
  const state = evaluatePreparedNodeAtTime(scene, node, frame);
  if (scene.motionModel) {
    const result = transformPoint(nodeMatrix(node, state), point);
    return node.parent
      ? storyAnchorPosition(scene, node.parent, result, frame)
      : projectStoryPoint(scene, node.id, result, frame);
  }
  const ox = node.width * node.origin[0],
    oy = node.height * node.origin[1];
  const x = (point[0] - ox) * state.scaleX,
    y = (point[1] - oy) * state.scaleY;
  const angle = (state.rotation * Math.PI) / 180;
  const result: [number, number] = [
    state.x + ox + x * Math.cos(angle) - y * Math.sin(angle),
    state.y + oy + x * Math.sin(angle) + y * Math.cos(angle),
  ];
  return node.parent
    ? storyAnchorPosition(scene, node.parent, result, frame)
    : projectStoryPoint(scene, node.id, result, frame);
}

export function evaluateStoryPath(
  scene: StoryRenderScene,
  path: PreparedPath,
  frame: number,
): PreparedPath {
  const binding = scene.connectors.find((binding) => binding.path === path.id);
  if (!binding) return path;
  const from = storyAnchorPosition(
    scene,
    binding.from.node,
    binding.from.point,
    frame,
  );
  const to = storyAnchorPosition(
    scene,
    binding.to.node,
    binding.to.point,
    frame,
  );
  return { ...path, points: connectorPoints(from, to, binding.bend) };
}
