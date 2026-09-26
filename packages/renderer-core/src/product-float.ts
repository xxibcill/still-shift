import { buildProductLayer } from "./product-layer.ts";
import { buildFloatMotion } from "./commerce-motion.ts";
import type { CommerceEvent } from "../../scene-contract/src/commerce.ts";
import {
  type PreparedNode,
  type PreparedScene,
} from "../../scene-contract/src/prepared.ts";

export type ProductFloatOptions = {
  /** Unique node prefix when several products share a scene. */
  id: string;
  /** Approved intact cutout; the component only references this asset. */
  product: PreparedScene["assets"][number];
  /** Position and width in canvas pixels; y is the lowest resting position. */
  x: number;
  y: number;
  width: number;
  /** Upward travel in canvas pixels. Zero produces a stationary product. */
  travel: number;
  cycleDurationSeconds: number;
  fps: 24 | 30;
  cycles?: number;
};

export type ProductFloatClip = {
  fps: 24 | 30;
  frameCount: number;
  assets: PreparedScene["assets"];
  nodes: PreparedNode[];
  events: CommerceEvent[];
  /** Full image rectangle swept over the motion, including transparent padding. */
  bounds: { x: number; y: number; width: number; height: number };
};

/** Build a background-independent, rigid product hover for an exact-frame scene. */
export function buildProductFloat(
  options: ProductFloatOptions,
): ProductFloatClip {
  const cycles = options.cycles ?? 1;
  const frameCount = Math.round(
    options.cycleDurationSeconds * options.fps * cycles,
  );
  validateMotion(options, cycles, frameCount);
  const layer = buildProductLayer(options);
  const events = buildFloatMotion(
    { fps: options.fps, frameCount },
    {
      target: layer.target,
      restY: options.y,
      travel: options.travel,
      start: 0,
      end: frameCount - 1,
      cycles,
    },
  );
  return {
    fps: options.fps,
    frameCount,
    assets: layer.assets,
    nodes: layer.nodes,
    events,
    bounds: {
      x: options.x,
      y: options.y - options.travel,
      width: options.width,
      height: layer.bounds.height + options.travel,
    },
  };
}

function validateMotion(
  options: ProductFloatOptions,
  cycles: number,
  frameCount: number,
) {
  if (!Number.isFinite(options.travel) || options.travel < 0)
    throw new Error(
      "Product Float travel must be a finite, nonnegative pixel distance",
    );
  if (options.fps !== 24 && options.fps !== 30)
    throw new Error("Product Float supports 24 or 30 fps");
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 50)
    throw new Error("Product Float requires 1–50 whole cycles");
  if (
    !Number.isFinite(frameCount) ||
    frameCount < cycles * 2 + 1 ||
    frameCount > 108000
  )
    throw new Error(
      "Product Float duration must allow two motion segments per cycle within 108000 frames",
    );
}
