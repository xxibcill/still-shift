import type { Composition } from "@still-shift/scene-contract";
import { cameraProjection, sampleCameraMotion } from "../../camera-sampling.ts";
import type { Matrix } from "../../node-transform.ts";

export function sampleCamera(comp: Composition, frame: number) {
  if (!comp.camera2d) return { x: comp.width / 2, y: comp.height / 2, zoom: 1 };
  return sampleCameraMotion(comp.camera2d, frame);
}

export function cameraMatrix(
  comp: Composition,
  frame: number,
  depth: number,
): Matrix {
  const { scale, x, y } = cameraProjection(
    comp,
    sampleCamera(comp, frame),
    depth,
  );
  return [scale, 0, 0, scale, x, y];
}
