import type { CompositionLayer } from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import { scalar, vector } from "./sample.ts";

export type SampledDepthMotion = {
  scale: number;
  strength: number;
  offset: [number, number];
  roll: number;
};
export type SampledImagePlane = Omit<SampledDepthMotion, "strength"> & {
  revealProgress: number;
};

export function sampleImagePlane(
  layer: Extract<CompositionLayer, { type: "image" }>,
  time: number,
  fps: number,
): SampledImagePlane {
  return {
    scale: scalar(layer.plane?.motion?.scale, time, fps, 1),
    offset: vector(layer.plane?.motion?.offset, time, fps, [0, 0]),
    roll: scalar(layer.plane?.motion?.roll, time, fps, 0),
    revealProgress: scalar(layer.plane?.reveal?.progress, time, fps, 1),
  };
}

export function validateImagePlane(
  plane: SampledImagePlane,
  node: string,
  frame: number,
) {
  if (
    !Number.isFinite(plane.scale) ||
    plane.scale < 0.5 ||
    plane.scale > 4 ||
    !Number.isFinite(plane.roll) ||
    Math.abs(plane.roll) > 360 ||
    !plane.offset.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 2,
    ) ||
    !Number.isFinite(plane.revealProgress) ||
    plane.revealProgress < 0 ||
    plane.revealProgress > 1
  )
    passageError(
      "comp-image-plane",
      "Image-plane controls exceed their bounded local envelope",
      { node, frame, path: `${node}.plane` },
    );
}

export function sampleDepthMotion(
  layer: Extract<CompositionLayer, { type: "depth-image" }>,
  time: number,
  fps: number,
): SampledDepthMotion {
  return {
    scale: scalar(layer.motion?.scale, time, fps, 1),
    strength: scalar(layer.motion?.strength, time, fps, 0),
    offset: vector(layer.motion?.offset, time, fps, [0, 0]),
    roll: scalar(layer.motion?.roll, time, fps, 0),
  };
}

/** Drivers and expressions obey the same envelope as authored keys. */
export function validateDepthMotion(
  motion: SampledDepthMotion,
  node: string,
  frame: number,
) {
  const valid =
    Number.isFinite(motion.scale) &&
    motion.scale >= 1 &&
    motion.scale <= 1.035 &&
    Number.isFinite(motion.strength) &&
    motion.strength >= 0 &&
    motion.strength <= 0.035 &&
    Number.isFinite(motion.roll) &&
    Math.abs(motion.roll) <= 0.3 &&
    motion.offset.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 0.07,
    );
  if (!valid)
    passageError(
      "comp-depth-motion",
      "Depth motion exceeds its bounded local displacement envelope",
      { node, frame, path: `${node}.motion` },
    );
}
