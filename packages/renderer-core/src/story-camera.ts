import type { StoryScene } from "../../scene-contract/src/story.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";

type Axis = "x" | "y" | "zoom";
type Camera = NonNullable<StoryScene["camera"]>;
type Curve = { frames: number[]; values: number[]; tangents: number[] };
const curves = new WeakMap<Camera, Record<Axis, Curve>>();

function cameraCurves(camera: Camera) {
  const existing = curves.get(camera);
  if (existing) return existing;
  const result = Object.fromEntries(
    (["x", "y", "zoom"] as const).map((axis) => {
      const frames = camera.keys.map((k) => k.frame),
        values = camera.keys.map((k) => k[axis]);
      const slopes = values
        .slice(1)
        .map((v, i) => (v - values[i]!) / (frames[i + 1]! - frames[i]!));
      const tangents = values.map((_, i) => {
        if (i === 0) return slopes[0]!;
        if (i === values.length - 1) return slopes.at(-1)!;
        const left = slopes[i - 1]!,
          right = slopes[i]!;
        if (left * right <= 0) return 0;
        return (left + right) / 2;
      });
      // Fritsch–Carlson limits each interval without reversing its monotone direction.
      slopes.forEach((slope, i) => {
        if (slope === 0) {
          tangents[i] = 0;
          tangents[i + 1] = 0;
          return;
        }
        const a = tangents[i]! / slope,
          b = tangents[i + 1]! / slope;
        const radius = Math.hypot(a, b);
        if (radius > 3) {
          tangents[i] = (3 * a * slope) / radius;
          tangents[i + 1] = (3 * b * slope) / radius;
        }
      });
      if (camera.startTangent) tangents[0] = camera.startTangent[axis];
      if (camera.endTangent)
        tangents[tangents.length - 1] = camera.endTangent[axis];
      return [axis, { frames, values, tangents }];
    }),
  ) as Record<Axis, Curve>;
  curves.set(camera, result);
  return result;
}

function sampleCurve(curve: Curve, frame: number, camera: Camera) {
  const { frames, values, tangents } = curve;
  if (frame <= frames[0]!) return values[0]!;
  if (frame >= frames.at(-1)!) return values.at(-1)!;
  const i = frames.findIndex((f, i) => i > 0 && f > frame) - 1;
  const duration = frames[i + 1]! - frames[i]!;
  let t = (frame - frames[i]!) / duration;
  const easeIn = i === 0 && camera.easeIn !== false;
  const easeOut = i === frames.length - 2 && camera.easeOut !== false;
  // These time profiles have derivative 1 at an interior key, retaining C1 continuity.
  if (easeIn && easeOut) t = t - Math.sin(2 * Math.PI * t) / (2 * Math.PI);
  else if (easeIn) t = t - ((1 - t) * Math.sin(Math.PI * t)) / Math.PI;
  else if (easeOut) t = t + (t * Math.sin(Math.PI * t)) / Math.PI;
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * values[i]! +
    (t ** 3 - 2 * t ** 2 + t) * duration * tangents[i]! +
    (-2 * t ** 3 + 3 * t ** 2) * values[i + 1]! +
    (t ** 3 - t ** 2) * duration * tangents[i + 1]!
  );
}

export function sampleStoryCamera(scene: StoryScene, frame: number) {
  const camera = scene.camera;
  if (!camera) return { x: scene.width / 2, y: scene.height / 2, zoom: 1 };
  const prepared = cameraCurves(camera);
  let x = sampleCurve(prepared.x, frame, camera),
    y = sampleCurve(prepared.y, frame, camera);
  for (const jolt of camera.jolts ?? []) {
    if (frame < jolt.frame || frame >= jolt.frame + jolt.decayFrames) continue;
    const decay = (1 - (frame - jolt.frame) / jolt.decayFrames) ** 3;
    x += jolt.dx * decay;
    y += jolt.dy * decay;
  }
  return { x, y, zoom: sampleCurve(prepared.zoom, frame, camera) };
}

export function storyCameraTransform(
  scene: StoryScene,
  root: string,
  frame: number,
) {
  const depth = scene.connectors.some((c) => c.path === root)
    ? 0
    : (scene.camera?.depth[root] ?? 1);
  if (!scene.camera || depth === 0) return { scale: 1, x: 0, y: 0 };
  const camera = sampleStoryCamera(scene, frame),
    cx = scene.width / 2,
    cy = scene.height / 2;
  const scale = 1 + (camera.zoom - 1) * depth;
  return {
    scale,
    x: cx - scale * (cx + (camera.x - cx) * depth),
    y: cy - scale * (cy + (camera.y - cy) * depth),
  };
}

export function projectStoryPoint(
  scene: StoryScene,
  root: string,
  point: [number, number],
  frame: number,
): [number, number] {
  const { scale, x, y } = storyCameraTransform(scene, root, frame);
  return [point[0] * scale + x, point[1] * scale + y];
}

export function validateStoryCameraCoverage(scene: StoryRenderScene) {
  for (const id of scene.camera?.cover ?? []) {
    const node = scene.nodes.find((n) => n.id === id)!;
    for (let frame = 0; frame < scene.frameCount; frame++) {
      const state = evaluatePreparedNode(scene, node, frame);
      const ox = node.width * node.origin[0],
        oy = node.height * node.origin[1];
      const left = state.x + ox * (1 - state.scaleX),
        top = state.y + oy * (1 - state.scaleY);
      const a = projectStoryPoint(scene, id, [left, top], frame);
      const b = projectStoryPoint(
        scene,
        id,
        [left + node.width * state.scaleX, top + node.height * state.scaleY],
        frame,
      );
      if (
        state.rotation !== 0 ||
        state.opacity !== 1 ||
        a[0] > 1e-6 ||
        a[1] > 1e-6 ||
        b[0] < scene.width - 1e-6 ||
        b[1] < scene.height - 1e-6
      )
        throw new Error(
          `Camera exposes uncovered edge on ${id} at frame ${frame}`,
        );
    }
  }
}
