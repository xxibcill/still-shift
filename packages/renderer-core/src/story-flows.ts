import type { StoryFlow } from "../../scene-contract/src/story-motion.ts";
import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import { pathLength, pointOnPath, sampleTrack } from "./prepared-scene.ts";

export const storyBump = (t: number) =>
  Math.abs(t) < 1 ? (1 - t * t) ** 2 : 0;
const SAMPLES = 512;
export type CompiledStoryFlow = StoryFlow & {
  offsets: Float64Array;
  warp?: Float64Array;
};

/** Inverse of a cumulative density, normalized to keep endpoints and token count fixed. */
export function pinchWarp(pinch: NonNullable<StoryFlow["pinch"]>) {
  const cumulative = new Float64Array(SAMPLES);
  for (let i = 1; i < SAMPLES; i++) {
    const at = (i - 0.5) / (SAMPLES - 1);
    cumulative[i] =
      cumulative[i - 1]! +
      1 / (1 - pinch.strength * storyBump((at - pinch.at) / pinch.width));
  }
  const total = cumulative[SAMPLES - 1]!;
  const inverse = new Float64Array(SAMPLES);
  let index = 1;
  for (let i = 1; i < SAMPLES - 1; i++) {
    const target = (i / (SAMPLES - 1)) * total;
    while (cumulative[index]! < target) index++;
    const fraction =
      (target - cumulative[index - 1]!) /
      (cumulative[index]! - cumulative[index - 1]!);
    inverse[i] = (index - 1 + fraction) / (SAMPLES - 1);
  }
  inverse[SAMPLES - 1] = 1;
  return inverse;
}

export function compileStoryFlows(
  flows: StoryFlow[],
  frameCount: number,
): CompiledStoryFlow[] {
  return flows.map((flow) => {
    const speed = flow.speed.map((k) => ({
      time: k.frame,
      value: k.pxPerFrame,
      ...(k.easing ? { easing: k.easing } : { easing: "linear" as const }),
    }));
    const offsets = new Float64Array(frameCount);
    for (let f = 1; f < frameCount; f++)
      offsets[f] = offsets[f - 1]! + sampleTrack(speed, f - 1);
    return {
      ...flow,
      offsets,
      ...(flow.pinch ? { warp: pinchWarp(flow.pinch) } : {}),
    };
  });
}

export function sampleStoryFlow(
  flow: CompiledStoryFlow,
  path: PreparedPath,
  state: { reveal: number; gap: number },
  frame: number,
  frameCount: number,
) {
  if (frame < flow.window.start || frame >= flow.window.end) return [];
  const length = pathLength(path.points);
  if (length === 0) return [];
  const gap = (path.gapSize * state.gap) / 2;
  const opacity = Math.min(
    1,
    (frame - flow.window.start) / 12,
    flow.window.end < frameCount ? (flow.window.end - frame) / 12 : 1,
  );
  let color = flow.color;
  for (const key of flow.colorStates ?? [])
    if (frame >= key.frame) color = key.color;
  return Array.from({ length: flow.count }, (_, i) => {
    const offset =
      flow.direction * flow.offsets[frame]! + (i * length) / flow.count;
    let progress = (((offset % length) + length) % length) / length;
    if (flow.warp) {
      const index = progress * (SAMPLES - 1),
        low = Math.floor(index),
        high = Math.min(SAMPLES - 1, low + 1);
      progress =
        flow.warp[low]! + (flow.warp[high]! - flow.warp[low]!) * (index - low);
    }
    const point = pointOnPath(path, progress),
      next = pointOnPath(path, Math.min(1, progress + 0.001));
    return {
      progress,
      point,
      angle: Math.atan2(next[1] - point[1], next[0] - point[0]),
      color,
      opacity,
    };
  }).filter(
    (token) =>
      token.progress <= state.reveal &&
      !(gap > 0 && Math.abs(token.progress - path.gapAt) <= gap),
  );
}

export function drawStoryFlow(
  ctx: CanvasRenderingContext2D,
  flow: CompiledStoryFlow,
  path: PreparedPath,
  state: { reveal: number; gap: number },
  frame: number,
  frameCount: number,
) {
  for (const token of sampleStoryFlow(flow, path, state, frame, frameCount)) {
    ctx.save();
    ctx.globalAlpha *= token.opacity;
    ctx.fillStyle = token.color;
    ctx.translate(...token.point);
    ctx.rotate(token.angle);
    ctx.beginPath();
    if (flow.shape === "dot") ctx.arc(0, 0, flow.size, 0, 2 * Math.PI);
    else
      ctx.roundRect(
        -flow.size,
        -Math.min(2, flow.size),
        flow.size * 2,
        Math.min(4, flow.size * 2),
        Math.min(2, flow.size),
      );
    ctx.fill();
    ctx.restore();
  }
}
