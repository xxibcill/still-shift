import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";

export function storyAnchorPosition(
  scene: StoryRenderScene,
  id: string,
  point: [number, number],
  frame: number,
): [number, number] {
  const node = scene.nodes.find((node) => node.id === id)!;
  const state = evaluatePreparedNode(scene, node, frame);
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
    : result;
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
  if (!binding.bend) return { ...path, points: [from, to] };
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...path, points: [from, to] };
  const bend = Math.max(-length * 0.22, Math.min(length * 0.22, binding.bend));
  const points: [number, number][] = Array.from({ length: 65 }, (_, index) => {
    const t = index / 64;
    const offset = 4 * t * (1 - t) * bend;
    return [
      from[0] + dx * t - (dy / length) * offset,
      from[1] + dy * t + (dx / length) * offset,
    ];
  });
  points[0] = from;
  points[64] = to;
  return { ...path, points };
}
