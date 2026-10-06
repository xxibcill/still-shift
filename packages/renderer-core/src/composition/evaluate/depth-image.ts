import type { CompositionLayer } from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import { scalar, vector } from "./sample.ts";

export type SampledDepthMotion = {
  scale: number;
  strength: number;
  offset: [number, number];
  roll: number;
};

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
