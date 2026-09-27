import type { ComponentSceneData } from "../../scene-contract/src/component-data.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { worldMatrix, parentWorldMatrix } from "./commerce-geometry.ts";
import { inverseMatrix, transformPoint } from "./node-transform.ts";
import { pointOnPath } from "./prepared-scene.ts";
import { easeMotion } from "./motion-easing.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export function applyComponentTravel(
  scene: CommerceRenderScene | StoryRenderScene,
  node: PreparedNode,
  frame: number,
  state: { x: number; y: number },
) {
  if (!scene.componentData) return;
  const travel = componentCapabilities(scene.componentData).travels.find(
    (t) => t.target === node.id,
  );
  if (!travel) return;
  const path = scene.nodes.find((n) => n.id === travel.path);
  if (path?.type !== "path")
    throw new Error("Missing component travel path: " + travel.path);
  const { start, end, easing } = travel.window;
  const progress =
    frame <= start
      ? travel.from
      : frame >= end
        ? travel.to
        : travel.from +
          (travel.to - travel.from) *
            easeMotion(
              (frame - start) / (end - start),
              easing,
              (end - start) / scene.fps,
            );
  const local = pointOnPath(path, progress);
  const canvas = transformPoint(worldMatrix(scene, path, frame), local);
  const point = transformPoint(
    inverseMatrix(parentWorldMatrix(scene, node, frame)),
    canvas,
  );
  state.x = point[0] - node.width * node.origin[0];
  state.y = point[1] - node.height * node.origin[1];
  if (![state.x, state.y].every(Number.isFinite))
    throw new Error("Component travel projection must be finite: " + travel.id);
}
export function validateTravelOwnership(
  scene: ComponentSceneData & {
    tracks: Record<string, Partial<Record<string, unknown[]>>>;
    followers?: Record<string, unknown>;
    effects?:
      | {
          type: string;
          target?: string | undefined;
          source?: string | undefined;
        }[]
      | undefined;
    attachments?: { path: string }[] | undefined;
    connectors?: { path: string }[] | undefined;
  },
) {
  const features = componentCapabilities(scene.componentData);
  if (!features.travels.length && !features.pins.length) return;
  const dependencies = new Map(
    scene.nodes.map((n) => [n.id, n.parent ? [n.parent] : []]),
  );
  for (const travel of features.travels)
    dependencies.get(travel.target)?.push(travel.path);
  for (const pin of features.pins)
    dependencies.get(pin.target)?.push(pin.anchor.node);
  for (const effect of scene.effects ?? [])
    if (effect.type === "height-shadow" && effect.target && effect.source)
      dependencies.get(effect.target)?.push(effect.source);
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error("Component position dependency cycle: " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of dependencies.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const travel of features.travels) visit(travel.target);
  for (const pin of features.pins) visit(pin.target);
  for (const travel of features.travels) {
    if (
      ["x", "y"].some(
        (p) =>
          scene.tracks[travel.target]?.[p]?.length ||
          features.bindings.some(
            (b) =>
              b.target === travel.target &&
              b.kind === "property" &&
              b.property === p,
          ),
      ) ||
      Object.hasOwn(scene.followers ?? {}, travel.target) ||
      scene.effects?.some((e) => e.target === travel.target)
    )
      throw new Error(
        "Conflicting component travel ownership: " + travel.target,
      );
    if (
      [
        ...(scene.attachments ?? []),
        ...(scene.connectors ?? []),
        ...features.annotations,
      ].some((a) => a.path === travel.path)
    )
      throw new Error(
        "Component travel requires an authored route, not a generated path: " +
          travel.path,
      );
  }
}

/** Preflight every render frame; bounded positive ancestor scales keep fractional exposure invertible. */
export function validateTravelTransforms(
  scene: CommerceRenderScene | StoryRenderScene,
) {
  for (const travel of componentCapabilities(scene.componentData).travels) {
    const node = scene.nodes.find((n) => n.id === travel.target)!;
    validatePositionParents(scene, node);
    for (let frame = 0; frame < scene.frameCount; frame++)
      applyComponentTravel(scene, node, frame, { x: 0, y: 0 });
  }
}
export function validatePositionParents(
  scene: CommerceRenderScene | StoryRenderScene,
  node: PreparedNode,
) {
  let ancestor = node.parent
    ? scene.nodes.find((n) => n.id === node.parent)
    : undefined;
  while (ancestor) {
    for (const property of ["scaleX", "scaleY"] as const)
      if (
        scene.tracks[ancestor.id]?.[property]?.some(
          (k) => k.value <= 0 || k.easing === "out-back-soft",
        )
      )
        throw new Error(
          "Position parent scale must stay positive with bounded easing: " +
            ancestor.id,
        );
    ancestor = ancestor.parent
      ? scene.nodes.find((n) => n.id === ancestor!.parent)
      : undefined;
  }
}
