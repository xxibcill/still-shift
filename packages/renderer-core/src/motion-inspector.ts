import type { StoryRenderScene } from "./story-scene.ts";
import { type Property } from "./prepared-scene.ts";
import { samplePreparedFamilyState as evaluatePreparedNodeAtTime } from "./composition/adapters/family-state.ts";
import {
  sampleLayer,
  isLayerActive,
  sampleDriver,
  defaultBlend,
  scalarKeys,
  layerOrder,
  motionError,
} from "./motion-craft.ts";
import { sampleCurve } from "./curve.ts";
import { storyAnchorPosition } from "./story-geometry.ts";
import type { MotionLayer } from "../../scene-contract/src/motion-craft.ts";

export function motionGraph(
  scene: StoryRenderScene,
  id: string,
  property: string,
) {
  const node = scene.nodes.find((n) => n.id === id);
  if (!node) throw new Error("motion-missing-target: " + id);
  const samples = Array.from({ length: scene.frameCount }, (_, frame) => {
    const state = evaluatePreparedNodeAtTime(scene, node, frame) as Record<
      string,
      number
    >;
    return { frame, value: state[property] ?? 0, speed: 0 };
  });
  samples.forEach((sample, i) => {
    sample.speed = i ? sample.value - samples[i - 1]!.value : 0;
  });
  const layers = (scene.compiledMotion?.layers ?? [])
    .filter((t) => t.node === id && t.property === property)
    .map((track) => ({
      layer: track.layer,
      blend: track.blend,
      path: track.path,
      keys: track.keys ?? [],
      samples: samples.map(({ frame }) => {
        const active = isLayerActive(track, frame);
        return {
          frame,
          active,
          value: active
            ? sampleLayer(track, frame, scene.fps)
            : track.blend === "multiply"
              ? 1
              : 0,
          weight: active
            ? track.weight
              ? sampleCurve(track.weight, frame, scene.fps)
              : 1
            : 0,
        };
      }),
    }));
  for (const [index, driver] of (scene.drivers ?? []).entries()) {
    if (driver.target !== `${id}.${property}`) continue;
    const layer = driver.layer ?? "action";
    const signal = scene.signals?.find((s) => s.id === driver.signal);
    layers.push({
      layer,
      blend: driver.blend ?? defaultBlend(layer, property),
      path: `/drivers/${index}`,
      keys: signal ? scalarKeys(signal.keys) : [],
      samples: samples.map(({ frame }) => ({
        frame,
        active: true,
        value: sampleDriver(scene, driver, frame),
        weight: driver.weight
          ? sampleCurve(scalarKeys(driver.weight), frame, scene.fps)
          : 1,
      })),
    });
  }
  return { samples, layers };
}
export function motionPath(
  scene: StoryRenderScene,
  id: string,
  frames: number[],
) {
  const node = scene.nodes.find((n) => n.id === id)!;
  return frames.map((frame) => ({
    frame,
    point: storyAnchorPosition(
      scene,
      id,
      [node.width * node.origin[0], node.height * node.origin[1]],
      frame,
    ),
    bounds: [
      [0, 0],
      [node.width, 0],
      [node.width, node.height],
      [0, node.height],
    ].map((p) => storyAnchorPosition(scene, id, p as [number, number], frame)),
  }));
}
export function withoutMotionLayer(
  source: StoryRenderScene,
  layer: MotionLayer,
): StoryRenderScene {
  const scene = structuredClone(source);
  if (scene.compiledMotion)
    scene.compiledMotion.layers = scene.compiledMotion.layers.filter(
      (t) => t.layer !== layer,
    );
  scene.drivers = scene.drivers?.filter((d) => (d.layer ?? "action") !== layer);
  scene.constraints = scene.constraints?.filter(
    (c) => (c.layer ?? "response") !== layer,
  );
  if (layer === "carrier") delete scene.camera;
  if (layer === "current") {
    scene.flows = [];
    scene.compiledFlows = [];
  }
  const removed = new Set(
    scene.motionEvents.filter((e) => e.role === layer).map((e) => e.node),
  );
  for (const id of removed)
    if (!scene.motionEvents.some((e) => e.node === id && e.role !== layer))
      delete scene.tracks[id];
  return scene;
}
function constraintControlsProperty(
  constraint: NonNullable<StoryRenderScene["constraints"]>[number],
  property: string,
): boolean {
  switch (constraint.type) {
    case "look-at":
      return property === "rotation";
    case "attach":
      return property === "x" || property === "y";
    case "contact":
      return constraint.solve.some((candidate) => candidate === property);
    case "follow-path":
      return (
        property === "x" ||
        property === "y" ||
        (property === "rotation" && !!constraint.orient)
      );
    case "keep-in-safe-area":
      return !!constraint.clamp && (property === "x" || property === "y");
  }
}

function focalPropertyChanges(
  scene: StoryRenderScene,
  nodeId: string,
  property: string,
  start: number,
  end: number,
): boolean {
  const node = scene.nodes.find((item) => item.id === nodeId)!;
  const valueAt = (frame: number) =>
    evaluatePreparedNodeAtTime(scene, node, frame)[
      property as keyof ReturnType<typeof evaluatePreparedNodeAtTime>
    ];
  let previous = valueAt(start);
  for (let frame = start + 1; frame <= end; frame++) {
    const current = valueAt(frame);
    if (
      Number.isFinite(current) &&
      Number.isFinite(previous) &&
      Math.abs(current! - previous!) > 1e-9
    )
      return true;
    previous = current;
  }
  return false;
}

export function focalMotionEvents(scene: StoryRenderScene) {
  const targets = scene.review?.focalEvents ?? [];
  const seen = new Set<string>();
  return targets.map((target, index) => {
    const path = `/review/focalEvents/${index}`;
    const key = `${target.node}.${target.property}`;
    if (seen.has(key))
      motionError(
        "focal-event-ambiguous",
        path,
        `Only one focal event may control ${key}`,
      );
    seen.add(key);
    const matching = scene.motionEvents.filter(
      (event) => event.node === target.node && event.window.cue === target.cue,
    );
    if (
      matching.length !== 1 ||
      matching[0]!.role !== "action" ||
      !matching[0]!.properties?.includes(target.property)
    )
      motionError(
        "focal-event-ambiguous",
        path,
        `${key} must name one action event whose cue is ${target.cue}`,
      );
    const event = matching[0]!;
    const overlapping = scene.motionEvents.some(
      (other) =>
        other !== event &&
        other.node === target.node &&
        other.window.start < event.window.end &&
        other.window.end > event.window.start &&
        (!other.properties || other.properties.includes(target.property)),
    );
    if (overlapping)
      motionError(
        "focal-event-ambiguous",
        path,
        `${key} has another event on the same property during ${target.cue}`,
      );
    const animated =
      !!scene.tracks[target.node]?.[target.property as Property] ||
      !!scene.compiledMotion?.layers.some(
        (track) =>
          track.node === target.node && track.property === target.property,
      ) ||
      !!scene.drivers?.some((driver) => driver.target === key);
    const constrained = scene.constraints?.some(
      (constraint) =>
        constraint.target === target.node &&
        constraintControlsProperty(constraint, target.property),
    );
    const start = Math.max(0, Math.ceil(event.window.start));
    const end = Math.min(scene.frameCount - 1, Math.floor(event.window.end));
    if (
      !animated ||
      constrained ||
      !focalPropertyChanges(scene, target.node, target.property, start, end)
    )
      motionError(
        "focal-event-ambiguous",
        path,
        `${key} needs an independently moving property during ${target.cue}`,
      );
    return { ...target, window: event.window, path };
  });
}

/** Freeze each declared focal property at its event start for a pixel counterfactual. */
export function withoutFocalMotion(source: StoryRenderScene): StoryRenderScene {
  const targets = focalMotionEvents(source);
  if (!targets.length)
    motionError(
      "focal-event-missing",
      "/review/focalEvents",
      "Declare at least one focal event before measuring it",
    );
  const scene = structuredClone(source);
  for (const target of targets) {
    const node = source.nodes.find((item) => item.id === target.node)!;
    const value = evaluatePreparedNodeAtTime(source, node, target.window.start)[
      target.property
    ];
    if (!Number.isFinite(value))
      motionError(
        "focal-event-ambiguous",
        target.path,
        `${target.node}.${target.property} has no finite start value`,
      );
    const tracks = scene.tracks[target.node];
    if (tracks?.[target.property as Property])
      tracks[target.property as Property] = [{ time: 0, value: value! }];
    if (scene.compiledMotion) {
      scene.compiledMotion.layers = scene.compiledMotion.layers.filter(
        (track) =>
          track.node !== target.node || track.property !== target.property,
      );
      scene.compiledMotion.layers.push({
        node: target.node,
        property: target.property,
        layer: "action",
        blend: "replace",
        keys: [{ time: 0, value: value! }],
        start: 0,
        end: scene.frameCount - 1,
        path: target.path,
      });
    }
    scene.drivers = scene.drivers?.filter(
      (driver) => driver.target !== `${target.node}.${target.property}`,
    );
  }
  return scene;
}

export const MOTION_LAYER_COLORS: Record<MotionLayer, string> = {
  action: "#a5c69e",
  response: "#e0a27a",
  current: "#84b4ce",
  carrier: "#d7c187",
};
export { layerOrder };
