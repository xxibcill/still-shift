import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  PreparedNodeSchema,
  type PreparedNode,
  type PreparedPath,
} from "@still-shift/scene-contract";
import type { StoryRenderScene } from "../../story-scene.ts";
import type { CommerceRenderScene } from "../../commerce-scene.ts";
import { evaluateAttachedPath } from "../../commerce-geometry.ts";
import { evaluateComponentAnnotation } from "../../component-annotations.ts";
import { componentVisible } from "../../component-visibility.ts";
import { samplePreparedFamilyState as evaluatePreparedNodeAtTime } from "./family-state.ts";

export const CommercePathGeometrySchema = z
  .object({
    points: z
      .array(PreparedNodeSchema.options[1].shape.points)
      .min(1)
      .max(COMPOSITION_LIMITS.maxKeys),
  })
  .strict();

function visible(
  scene: CommerceRenderScene | StoryRenderScene,
  node: PreparedNode,
  frame: number,
) {
  const hasFlow =
    scene.schemaVersion === "story-scene-1" &&
    scene.flows?.some((flow) => flow.path === node.id);
  let current: PreparedNode | undefined = node;
  while (current) {
    if (!componentVisible(scene, current.id, frame)) return false;
    if (
      !(hasFlow && current === node) &&
      evaluatePreparedNodeAtTime(scene, current, frame).opacity <= 0
    )
      return false;
    const parentId: string | undefined = current.parent;
    current = parentId
      ? scene.nodes.find((node) => node.id === parentId)
      : undefined;
  }
  return true;
}

/** Bake local vertices after legacy validation; hidden paths never need an inverse transform. */
export function compileAttachedPathGeometry(
  scene: CommerceRenderScene | StoryRenderScene,
  node: PreparedPath,
  times?: readonly number[],
) {
  if (
    !(
      scene.schemaVersion === "commerce-scene-1" &&
      scene.attachments?.some((attachment) => attachment.path === node.id)
    ) &&
    !scene.componentData?.annotations.some(
      (annotation) => annotation.path === node.id,
    )
  )
    return undefined;
  const points = (
    times ?? Array.from({ length: scene.frameCount }, (_, frame) => frame)
  ).map((frame) =>
    visible(scene, node, frame)
      ? evaluateComponentAnnotation(
          scene,
          scene.schemaVersion === "commerce-scene-1"
            ? evaluateAttachedPath(scene, node, frame)
            : node,
          frame,
        ).points
      : node.points,
  );
  const last = JSON.stringify(points.at(-1));
  while (points.length > 1 && JSON.stringify(points.at(-2)) === last)
    points.pop();
  return { points };
}
