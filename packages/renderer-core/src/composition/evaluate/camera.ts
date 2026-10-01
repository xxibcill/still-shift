import type { Camera2d, Composition } from "@still-shift/scene-contract";
import { hermite, monotoneTangents, type Curve } from "../../curve.ts";
import type { Matrix } from "../../node-transform.ts";

type Axis = "x" | "y" | "zoom";
const compiled = new WeakMap<Camera2d, Record<Axis, Curve>>();
function cameraCurves(camera: Camera2d) {
  let curves = compiled.get(camera);
  if (!curves) {
    curves = Object.fromEntries(
      (["x", "y", "zoom"] as const).map((axis) => {
        const frames = camera.keys.map((k) => k.frame),
          values = camera.keys.map((k) => k[axis]);
        return [
          axis,
          {
            frames,
            values,
            tangents: monotoneTangents(frames, values, {
              ...(camera.startTangent
                ? { start: camera.startTangent[axis] }
                : {}),
              ...(camera.endTangent ? { end: camera.endTangent[axis] } : {}),
            }),
          },
        ];
      }),
    ) as Record<Axis, Curve>;
    compiled.set(camera, curves);
  }
  return curves;
}

function sample(curve: Curve, camera: Camera2d, frame: number) {
  const { frames, values, tangents } = curve;
  if (frame <= frames[0]!) return values[0]!;
  if (frame >= frames.at(-1)!) return values.at(-1)!;
  const i = frames.findIndex((f, i) => i > 0 && f > frame) - 1;
  const duration = frames[i + 1]! - frames[i]!;
  let t = (frame - frames[i]!) / duration;
  const easeIn = i === 0 && camera.easeIn !== false;
  const easeOut = i === frames.length - 2 && camera.easeOut !== false;
  if (easeIn && easeOut) t -= Math.sin(2 * Math.PI * t) / (2 * Math.PI);
  else if (easeIn) t -= ((1 - t) * Math.sin(Math.PI * t)) / Math.PI;
  else if (easeOut) t += (t * Math.sin(Math.PI * t)) / Math.PI;
  return hermite(
    values[i]!,
    values[i + 1]!,
    tangents[i]!,
    tangents[i + 1]!,
    duration,
    t,
  );
}

export function sampleCamera(comp: Composition, frame: number) {
  const camera = comp.camera2d;
  if (!camera) return { x: comp.width / 2, y: comp.height / 2, zoom: 1 };
  const curves = cameraCurves(camera);
  let x = sample(curves.x, camera, frame),
    y = sample(curves.y, camera, frame);
  for (const jolt of camera.jolts ?? []) {
    if (frame < jolt.frame || frame >= jolt.frame + jolt.decayFrames) continue;
    const decay = (1 - (frame - jolt.frame) / jolt.decayFrames) ** 3;
    x += jolt.dx * decay;
    y += jolt.dy * decay;
  }
  return { x, y, zoom: sample(curves.zoom, camera, frame) };
}

export function cameraMatrix(
  comp: Composition,
  frame: number,
  depth: number,
): Matrix {
  const camera = sampleCamera(comp, frame),
    cx = comp.width / 2,
    cy = comp.height / 2;
  const scale = 1 + (camera.zoom - 1) * depth;
  return [
    scale,
    0,
    0,
    scale,
    cx - scale * (cx + (camera.x - cx) * depth),
    cy - scale * (cy + (camera.y - cy) * depth),
  ];
}
