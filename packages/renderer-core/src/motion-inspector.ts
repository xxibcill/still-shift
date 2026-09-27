import type { StoryRenderScene } from "./story-scene.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";
import {
  sampleLayer,
  sampleDriver,
  defaultBlend,
  scalarKeys,
  layerOrder,
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
      samples: samples.map(({ frame }) => ({
        frame,
        value: sampleLayer(track, frame, scene.fps),
        weight: track.weight ? sampleCurve(track.weight, frame, scene.fps) : 1,
      })),
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
export const MOTION_LAYER_COLORS: Record<MotionLayer, string> = {
  action: "#a5c69e",
  response: "#e0a27a",
  current: "#84b4ce",
  carrier: "#d7c187",
};
export { layerOrder };
