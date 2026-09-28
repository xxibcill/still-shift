import { componentVisibilityCuts } from "./component-visibility.ts";
import { componentStateCuts } from "./component-state.ts";
import type { ComponentAnchor } from "../../scene-contract/src/component-data.ts";
import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { assertProtectedPathClear, worldMatrix } from "./commerce-geometry.ts";
import {
  imagePlacement,
  inverseMatrix,
  transformPoint,
  type Point,
} from "./node-transform.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";

type Scene = CommerceRenderScene | StoryRenderScene;

export function resolveComponentAnchor(
  scene: Scene,
  anchor: ComponentAnchor,
  frame: number,
): Point {
  const node = scene.nodes.find((n) => n.id === anchor.node);
  if (!node) throw new Error("Missing annotation target: " + anchor.node);
  let point = anchor.point;
  if (anchor.space === "source") {
    if (node.type !== "image" || node.states.length !== 1)
      throw new Error("Source anchor needs one image state: " + node.id);
    const asset = scene.assets.find((a) => a.id === node.states[0]!.asset)!;
    const p = imagePlacement(
      node,
      node.states[0]!.crop ?? [0, 0, asset.width, asset.height],
      node.states[0]!.registration?.anchor,
    );
    point = [
      p.x + ((point[0] - p.sx) * p.width) / p.sw,
      p.y + ((point[1] - p.sy) * p.height) / p.sh,
    ];
    if (
      anchor.point[0] < p.sx ||
      anchor.point[0] > p.sx + p.sw ||
      anchor.point[1] < p.sy ||
      anchor.point[1] > p.sy + p.sh ||
      point[0] < 0 ||
      point[0] > node.width ||
      point[1] < 0 ||
      point[1] > node.height
    )
      throw new Error(
        "Annotation anchor lies outside visible crop: " + node.id,
      );
  }
  const world = transformPoint(worldMatrix(scene, node, frame), point);
  return [world[0] + anchor.offset[0], world[1] + anchor.offset[1]];
}

export function evaluateComponentAnnotation(
  scene: Scene,
  path: PreparedPath,
  frame: number,
): PreparedPath {
  const annotation = scene.componentData?.annotations.find(
    (a) => a.path === path.id,
  );
  if (!annotation) return path;
  const world = annotation.points.map((p) =>
    resolveComponentAnchor(scene, p, frame),
  );
  if (annotation.protect.length && scene.schemaVersion !== "commerce-scene-1")
    throw new Error("Protected source regions require commerce geometry");
  if (scene.schemaVersion === "commerce-scene-1")
    for (const source of annotation.protect)
      assertProtectedPathClear(scene, source, world, frame, path.id);
  const inverse = inverseMatrix(worldMatrix(scene, path, frame));
  return {
    ...path,
    points: world.map((point) => transformPoint(inverse, point)),
  };
}

/** Validate the same exposure windows the commerce renderer samples; direct seeks validate again. */
export function validateComponentAnnotations(scene: Scene) {
  const paths = scene.nodes.filter(
    (n): n is PreparedPath =>
      n.type === "path" &&
      !!scene.componentData?.annotations.some((a) => a.path === n.id),
  );
  if (!paths.length) return;
  const commerce =
    scene.schemaVersion === "commerce-scene-1" ? scene : undefined;
  const blur = commerce?.effects?.find((e) => e.type === "motion-blur");
  const cuts = [
    0,
    scene.frameCount,
    ...componentVisibilityCuts(scene),
    ...componentStateCuts(scene),
    ...(commerce?.visibility ?? []).flatMap((v) => [v.start, v.end]),
    ...(commerce?.effects ?? []).flatMap((e) =>
      e.active ? [e.active.start, e.active.end] : [],
    ),
  ];
  for (let frame = 0; frame < scene.frameCount; frame++) {
    const lower = Math.max(...cuts.filter((c) => c <= frame)),
      upper = Math.min(...cuts.filter((c) => c > frame));
    const times = [
      frame,
      ...(blur
        ? Array.from({ length: blur.samples }, (_, i) =>
            Math.max(
              lower,
              Math.min(
                scene.frameCount - 1,
                upper - 1e-7,
                frame +
                  (((i + 0.5) / blur.samples - 0.5) * blur.shutterAngle) / 360,
              ),
            ),
          )
        : []),
    ];
    for (const time of times)
      for (const path of paths) {
        if (evaluatePreparedNodeAtTime(scene, path, time).opacity > 0)
          evaluateComponentAnnotation(scene, path, time);
      }
  }
}
