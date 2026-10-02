import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  PreparedNodeSchema,
  type PreparedNode,
  type PreparedPath,
} from "@still-shift/scene-contract";
import type { CommerceRenderScene } from "../../commerce-scene.ts";
import { evaluateAttachedPath } from "../../commerce-geometry.ts";
import { evaluateComponentAnnotation } from "../../component-annotations.ts";
import { evaluatePreparedNode } from "../../prepared-scene.ts";

export const CommercePathGeometrySchema = z
  .object({
    points: z
      .array(PreparedNodeSchema.options[1].shape.points)
      .min(1)
      .max(COMPOSITION_LIMITS.maxKeys),
  })
  .strict();

function visible(
  scene: CommerceRenderScene,
  node: PreparedNode,
  frame: number,
) {
  let current: PreparedNode | undefined = node;
  while (current) {
    if (evaluatePreparedNode(scene, current, frame).opacity <= 0) return false;
    const parentId: string | undefined = current.parent;
    current = parentId
      ? scene.nodes.find((node) => node.id === parentId)
      : undefined;
  }
  return true;
}

/** Bake local vertices after legacy validation; hidden paths never need an inverse transform. */
export function compileCommercePathGeometry(
  scene: CommerceRenderScene,
  node: PreparedPath,
) {
  if (
    !scene.attachments?.some((attachment) => attachment.path === node.id) &&
    !scene.componentData?.annotations.some(
      (annotation) => annotation.path === node.id,
    )
  )
    return undefined;
  const points = Array.from({ length: scene.frameCount }, (_, frame) =>
    visible(scene, node, frame)
      ? evaluateComponentAnnotation(
          scene,
          evaluateAttachedPath(scene, node, frame),
          frame,
        ).points
      : node.points,
  );
  const last = JSON.stringify(points.at(-1));
  while (points.length > 1 && JSON.stringify(points.at(-2)) === last)
    points.pop();
  return { points };
}
