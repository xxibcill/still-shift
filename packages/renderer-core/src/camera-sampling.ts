import type { Camera2d } from "@still-shift/scene-contract";
import { hermite, monotoneTangents, type Curve } from "./curve.ts";

type Axis = "x" | "y" | "zoom";
type CameraState = Record<Axis, number>;
const compiled = new WeakMap<Camera2d, Record<Axis, Curve>>();

export function cameraCurves(camera: Camera2d) {
  const existing = compiled.get(camera);
  if (existing) return existing;
  const curves = Object.fromEntries(
    (["x", "y", "zoom"] as const).map((axis) => {
      const frames = camera.keys.map((key) => key.frame),
        values = camera.keys.map((key) => key[axis]);
      const tangents = monotoneTangents(frames, values, {
        ...(camera.startTangent ? { start: camera.startTangent[axis] } : {}),
        ...(camera.endTangent ? { end: camera.endTangent[axis] } : {}),
      });
      return [axis, { frames, values, tangents }];
    }),
  ) as Record<Axis, Curve>;
  compiled.set(camera, curves);
  return curves;
}

function sampleCameraCurve(curve: Curve, camera: Camera2d, frame: number) {
  const { frames, values, tangents } = curve;
  if (frame <= frames[0]!) return values[0]!;
  if (frame >= frames.at(-1)!) return values.at(-1)!;
  const index = frames.findIndex((value, i) => i > 0 && value > frame) - 1;
  const duration = frames[index + 1]! - frames[index]!;
  let time = (frame - frames[index]!) / duration;
  const easeIn = index === 0 && camera.easeIn !== false;
  const easeOut = index === frames.length - 2 && camera.easeOut !== false;
  // Preserve derivative 1 at interior keys, retaining C1 continuity.
  if (easeIn && easeOut) time -= Math.sin(2 * Math.PI * time) / (2 * Math.PI);
  else if (easeIn) time -= ((1 - time) * Math.sin(Math.PI * time)) / Math.PI;
  else if (easeOut) time += (time * Math.sin(Math.PI * time)) / Math.PI;
  return hermite(
    values[index]!,
    values[index + 1]!,
    tangents[index]!,
    tangents[index + 1]!,
    duration,
    time,
  );
}

export function sampleCameraMotion(
  camera: Camera2d,
  frame: number,
): CameraState {
  const curves = cameraCurves(camera);
  let x = sampleCameraCurve(curves.x, camera, frame),
    y = sampleCameraCurve(curves.y, camera, frame);
  for (const jolt of camera.jolts ?? []) {
    if (frame < jolt.frame || frame >= jolt.frame + jolt.decayFrames) continue;
    const decay = (1 - (frame - jolt.frame) / jolt.decayFrames) ** 3;
    x += jolt.dx * decay;
    y += jolt.dy * decay;
  }
  return { x, y, zoom: sampleCameraCurve(curves.zoom, camera, frame) };
}

export function cameraProjection(
  viewport: { width: number; height: number },
  camera: CameraState,
  depth: number,
) {
  const cx = viewport.width / 2,
    cy = viewport.height / 2;
  const scale = 1 + (camera.zoom - 1) * depth;
  return {
    scale,
    x: cx - scale * (cx + (camera.x - cx) * depth),
    y: cy - scale * (cy + (camera.y - cy) * depth),
  };
}

/**
 * One-sided derivatives at a join, each measured a step away from it. A value
 * step within one step of the join (a held frame sample) is not velocity;
 * callers select property-specific normalization.
 */
export function boundaryVelocityJump(
  beforeOuter: readonly number[],
  before: readonly number[],
  after: readonly number[],
  afterOuter: readonly number[],
  step: number,
) {
  return Math.hypot(
    ...before.map(
      (value, i) =>
        (afterOuter[i]! - after[i]! - (value - beforeOuter[i]!)) / step,
    ),
  );
}
