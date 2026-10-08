import type {
  PropHold,
  ResolvedPropTrack,
} from "../../scene-contract/src/character-actions.ts";
import type {
  PreparedImage,
  PreparedNode,
} from "../../scene-contract/src/prepared.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { samplePreparedFamilyState as evaluatePreparedNodeAtTime } from "./composition/adapters/family-state.ts";
import {
  imagePlacement,
  nodeMatrix,
  transformPoint,
  type Point,
} from "./node-transform.ts";
import { componentCapabilities } from "./component-capabilities.ts";

type State = ReturnType<typeof evaluatePreparedNodeAtTime>;
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
function localPoseAnchor(
  scene: StoryRenderScene,
  node: PreparedImage,
  index: number,
  name: string,
): Point {
  const pose = node.states[index],
    anchor = pose?.anchors?.[name];
  if (!pose || !anchor)
    throw new Error(
      `Missing pose anchor ${name} on ${node.id}:${pose?.pose ?? index}`,
    );
  const asset = scene.assets.find((a) => a.id === pose.asset)!;
  const p = imagePlacement(
    node,
    pose.crop ?? [0, 0, asset.width, asset.height],
    pose.registration?.anchor,
  );
  const point: Point = [p.x + anchor[0] * p.width, p.y + anchor[1] * p.height];
  if (
    point[0] < 0 ||
    point[1] < 0 ||
    point[0] > node.width ||
    point[1] > node.height
  )
    throw new Error(
      `Pose anchor ${name} is clipped on ${node.id}:${pose.pose ?? index}`,
    );
  return point;
}
/** Return a registered pose anchor in the shared parent coordinates. */
export function poseAnchorPoint(
  scene: StoryRenderScene,
  hold: PropHold,
  frame: number,
): Point {
  const actor = scene.nodes.find((n) => n.id === hold.actor);
  if (actor?.type !== "image")
    throw new Error("Prop anchor requires a character image: " + hold.actor);
  const state = evaluatePreparedNodeAtTime(scene, actor, frame);
  let point = localPoseAnchor(
    scene,
    actor,
    Math.round(state.state),
    hold.anchor,
  );
  if (state.stateFrom !== undefined && state.stateMix !== undefined)
    point = mix(
      localPoseAnchor(scene, actor, state.stateFrom, hold.anchor),
      point,
      state.stateMix,
    );
  const projected = transformPoint(nodeMatrix(actor, state), point);
  return [projected[0] + hold.offset[0], projected[1] + hold.offset[1]];
}
function contactAt(
  scene: StoryRenderScene,
  track: ResolvedPropTrack,
  index: number,
  frame: number,
  initial: Point,
): Point {
  if (index < 0)
    return track.initial
      ? poseAnchorPoint(scene, track.initial, frame)
      : initial;
  const cut = track.changes[index]!;
  if (!cut.hold)
    return contactAt(
      scene,
      track,
      index - 1,
      Math.max(0, cut.frame - 1),
      initial,
    );
  const to = poseAnchorPoint(scene, cut.hold, frame);
  if (!cut.transitionFrames || frame >= cut.frame + cut.transitionFrames)
    return to;
  const from = contactAt(scene, track, index - 1, frame, initial);
  return mix(from, to, (frame - cut.frame) / cut.transitionFrames);
}
export function applyStoryPropAttachment(
  scene: StoryRenderScene,
  node: PreparedNode,
  frame: number,
  state: State,
) {
  const track = scene.propAttachments?.find((p) => p.target === node.id);
  if (!track) return;
  let index = track.changes.findIndex((c) => c.frame > frame) - 1;
  if (index === -2) index = track.changes.length - 1;
  const grip: Point = [node.width * track.grip[0], node.height * track.grip[1]];
  const initial = transformPoint(nodeMatrix(node, state), grip);
  const point = contactAt(scene, track, index, frame, initial);
  const own = transformPoint(nodeMatrix(node, { ...state, x: 0, y: 0 }), grip);
  state.x = point[0] - own[0];
  state.y = point[1] - own[1];
}

export function validateStoryProps(scene: StoryRenderScene) {
  const tracks = scene.propAttachments ?? [],
    targets = new Set(tracks.map((t) => t.target));
  if (targets.size !== tracks.length)
    throw new Error("Duplicate prop track target");
  const components = componentCapabilities(scene.componentData);
  validatePropDependencies(scene);
  for (const track of tracks) {
    const prop = scene.nodes.find((n) => n.id === track.target);
    if (prop?.type !== "image")
      throw new Error("Prop track requires an image: " + track.target);
    if (
      ["x", "y"].some(
        (p) =>
          (scene.tracks[prop.id]?.[p as "x" | "y"]?.length ?? 0) > 1 ||
          components.bindings.some(
            (b) =>
              b.target === prop.id && b.kind === "property" && b.property === p,
          ) ||
          scene.compiledMotion?.layers.some(
            (l) => l.node === prop.id && l.property === p,
          ) ||
          scene.drivers?.some((d) => d.target === `${prop.id}.${p}`),
      ) ||
      components.pins.some((p) => p.target === prop.id) ||
      components.travels.some((p) => p.target === prop.id) ||
      scene.constraints?.some((c) => c.target === prop.id)
    )
      throw new Error("Conflicting prop position ownership: " + prop.id);
    for (const hold of [track.initial, ...track.changes.map((c) => c.hold)]) {
      if (!hold) continue;
      const actor = scene.nodes.find((n) => n.id === hold.actor);
      if (actor?.type !== "image" || actor.states.some((s) => !s.pose))
        throw new Error(
          "Prop hold requires named character poses: " + hold.actor,
        );
      if (targets.has(actor.id))
        throw new Error(
          "Prop attachment chains/cycles are unsupported: " + actor.id,
        );
      if (
        actor.parent !== prop.parent ||
        (!actor.parent &&
          (scene.camera?.depth[actor.id] ?? 1) !==
            (scene.camera?.depth[prop.id] ?? 1))
      )
        throw new Error(
          "Prop and character must share parent and camera space: " + prop.id,
        );
    }
    for (const [i, cut] of track.changes.entries()) {
      if (
        cut.frame >= scene.frameCount ||
        cut.frame + cut.transitionFrames >= scene.frameCount
      )
        throw new Error("Prop transition outside beat: " + cut.id);
      const previous = track.changes[i - 1];
      if (
        previous &&
        (previous.frame >= cut.frame ||
          previous.frame + previous.transitionFrames > cut.frame)
      )
        throw new Error("Overlapping prop changes: " + cut.id);
      if (!cut.hold && cut.transitionFrames)
        throw new Error(
          "Prop release must have zero transition frames: " + cut.id,
        );
    }
    for (let frame = 0; frame < scene.frameCount; frame++)
      evaluatePreparedNodeAtTime(scene, prop, frame);
  }
}

function validatePropDependencies(scene: StoryRenderScene) {
  if (!scene.propAttachments?.length) return;
  const edges = new Map<string, Set<string>>();
  const edge = (from: string, to: string) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };
  const components = componentCapabilities(scene.componentData);
  for (const node of scene.nodes) if (node.parent) edge(node.id, node.parent);
  for (const pin of components.pins) edge(pin.target, pin.anchor.node);
  for (const travel of components.travels) edge(travel.target, travel.path);
  for (const annotation of components.annotations)
    for (const point of annotation.points) edge(annotation.path, point.node);
  for (const track of scene.propAttachments)
    for (const hold of [track.initial, ...track.changes.map((c) => c.hold)])
      if (hold) edge(track.target, hold.actor);
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new Error(
        "Prop attachment dependency cycle: " + [...active, id].join(" → "),
      );
    if (done.has(id)) return;
    active.add(id);
    for (const dep of edges.get(id) ?? []) visit(dep);
    active.delete(id);
    done.add(id);
  };
  for (const id of edges.keys()) visit(id);
}
