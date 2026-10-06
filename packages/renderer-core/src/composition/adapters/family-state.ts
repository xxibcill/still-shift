import type {
  PreparedNode,
  PreparedPath,
} from "../../../../scene-contract/src/prepared.ts";
import type { NumericMotionProperty } from "../../../../scene-contract/src/motion-craft.ts";
import {
  sampleTrack,
  pointOnPath,
  type IllustratedScene,
  type Property,
} from "../../prepared-scene.ts";
import { projectCinematicNode } from "../../cinematic-scene.ts";
import { applyCommerceEffectMotion } from "../../commerce-effect-motion.ts";
import { applyMotionCraft } from "../../motion-craft.ts";
import { applyComponentState } from "../../component-state.ts";
import { applyComponentTravel } from "../../component-travel.ts";
import { applyComponentPin } from "../../component-pin.ts";
import { applyStoryPropAttachment } from "../../story-props.ts";
import { componentVisible } from "../../component-visibility.ts";
import { applyComponentValues } from "../../component-values.ts";

/** Continuous commerce sampling for exposure; public render/seek remains integer-frame. */
export function samplePreparedFamilyState(
  scene: IllustratedScene,
  node: PreparedNode,
  frame: number,
): Record<Property, number> &
  Partial<Record<NumericMotionProperty, number>> & {
    stateFrom?: number;
    stateMix?: number;
  } {
  if (
    !Number.isFinite(frame) ||
    frame < 0 ||
    frame > scene.timeline.frameCount - 1 ||
    (scene.schemaVersion !== "commerce-scene-1" &&
      !(scene.schemaVersion === "story-scene-1" && scene.motionModel) &&
      !(
        scene.schemaVersion === "illustrated-scene-2" && scene.effectsVersion
      ) &&
      !Number.isInteger(frame))
  )
    throw new Error("Sample time outside illustrated timeline");
  const time =
    scene.schemaVersion === "story-scene-1" ||
    scene.schemaVersion === "commerce-scene-1"
      ? frame
      : (frame * 1000) / scene.fps;
  const state = {
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    scaleX: 1,
    scaleY: 1,
    opacity: node.opacity,
    reveal: 1,
    gap: 0,
    state: 0,
    pulse: 0,
    pinch: 0,
  };
  if (scene.schemaVersion === "illustrated-scene-2") {
    if (node.type !== "image")
      throw new Error("Cinematic plane must be an image");
    const projected = projectCinematicNode(scene, node, frame);
    return {
      ...state,
      x: projected.left + (projected.scale - 1) * node.width * node.origin[0],
      y: projected.top + (projected.scale - 1) * node.height * node.origin[1],
      scaleX: projected.scale,
      scaleY: projected.scale,
    };
  }
  const tracks = Object.hasOwn(scene.tracks, node.id)
    ? scene.tracks[node.id]!
    : {};
  for (const [property, keys] of Object.entries(tracks))
    state[property as Property] = sampleTrack(keys, time, scene.fps);
  if (
    scene.schemaVersion === "commerce-scene-1" ||
    scene.schemaVersion === "story-scene-1"
  ) {
    if (!scene.motionModel) applyComponentValues(scene, node.id, frame, state);
    applyComponentState(scene, node.id, frame, state);
    applyComponentTravel(scene, node, frame, state);
    applyComponentPin(scene, node, frame, state);
    if (!componentVisible(scene, node.id, frame)) state.opacity = 0;
  }
  const follower = Object.hasOwn(scene.followers, node.id)
    ? scene.followers[node.id]
    : undefined;
  if (follower) {
    const path = scene.nodes.find(
      (item) => item.id === follower.path,
    ) as PreparedPath;
    const [x, y] = pointOnPath(path, sampleTrack(follower.keys, time));
    state.x = x + path.x - node.width / 2;
    state.y = y + path.y - node.height / 2;
  }
  if (scene.schemaVersion === "commerce-scene-1") {
    const visibility = scene.visibility?.find((v) => v.target === node.id);
    if (visibility && (frame < visibility.start || frame >= visibility.end))
      state.opacity = 0;
  }
  if (
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1") &&
    scene.motionModel
  ) {
    applyMotionCraft(scene, node, frame, state);
    // Visibility is a render envelope, including when an opacity driver is active.
    const visibility =
      scene.schemaVersion === "commerce-scene-1"
        ? scene.visibility?.find((v) => v.target === node.id)
        : undefined;
    if (
      !componentVisible(scene, node.id, frame) ||
      (visibility && (frame < visibility.start || frame >= visibility.end))
    )
      state.opacity = 0;
  }
  if (scene.schemaVersion === "commerce-scene-1" && scene.effects?.length)
    return applyCommerceEffectMotion(
      state,
      node.id,
      scene.effects,
      frame,
      (id) => {
        const source = scene.nodes.find((item) => item.id === id)!;
        return samplePreparedFamilyState(scene, source, frame).y;
      },
    );
  if (scene.schemaVersion === "story-scene-1")
    applyStoryPropAttachment(scene, node, frame, state);
  return state;
}
