import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type PreparedPath,
} from "@still-shift/scene-contract";
import { connectorPoints } from "../../connector-points.ts";
import { storyAnchorPosition } from "../../story-geometry.ts";
import type { StoryRenderScene } from "../../story-scene.ts";

const point = z.tuple([z.number().finite(), z.number().finite()]);
export const StoryPathGeometrySchema = z
  .object({
    bend: z.number().finite().min(-120).max(120),
    endpoints: z
      .array(z.tuple([point, point]))
      .min(1)
      .max(COMPOSITION_LIMITS.maxKeys),
  })
  .strict();
type Geometry = z.infer<typeof StoryPathGeometrySchema>;

/** Bake only moving endpoints; the shared bend primitive reproduces the 65 vertices. */
export function compileStoryPathGeometry(
  scene: StoryRenderScene,
  node: PreparedPath,
): Geometry | undefined {
  const binding = scene.connectors.find((c) => c.path === node.id);
  if (!binding) return undefined;
  const endpoints: Geometry["endpoints"] = Array.from(
    { length: scene.frameCount },
    (_, frame) => [
      storyAnchorPosition(scene, binding.from.node, binding.from.point, frame),
      storyAnchorPosition(scene, binding.to.node, binding.to.point, frame),
    ],
  );
  const last = JSON.stringify(endpoints.at(-1));
  while (endpoints.length > 1 && JSON.stringify(endpoints.at(-2)) === last)
    endpoints.pop();
  return { bend: binding.bend ?? 0, endpoints };
}

export function sampleStoryPath(
  node: PreparedPath,
  geometry: Geometry | undefined,
  time: number,
): PreparedPath {
  if (!geometry) return node;
  const [from, to] =
    geometry.endpoints[
      Math.max(0, Math.min(geometry.endpoints.length - 1, Math.floor(time)))
    ]!;
  return { ...node, points: connectorPoints(from, to, geometry.bend) };
}
