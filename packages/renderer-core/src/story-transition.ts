import type { Handoff } from "../../scene-contract/src/story-authoring.ts";
import { easeMotion } from "./motion-easing.ts";
export function isStoryTransition(handoff?: Handoff) {
  return (
    !!handoff &&
    ["overlap", "crossfade", "push", "match"].includes(handoff.mode)
  );
}
export function sampleStoryTransition(
  handoff: Handoff,
  frame: number,
  width: number,
  height: number,
  fps = 30,
) {
  const progress = easeMotion(
    frame / Math.max(1, (handoff.frames ?? 2) - 1),
    handoff.easing ?? "in-out-cubic",
    Math.max(1, (handoff.frames ?? 2) - 1) / fps,
  );
  const direction = handoff.direction ?? "left",
    horizontal = direction === "left" || direction === "right",
    sign = direction === "left" || direction === "up" ? -1 : 1;
  const extent = horizontal ? width : height;
  return {
    progress,
    outgoingAlpha: 1 - progress,
    incomingAlpha: progress,
    outgoingX: horizontal ? Math.round(sign * extent * progress) : 0,
    outgoingY: horizontal ? 0 : Math.round(sign * extent * progress),
    incomingX: horizontal ? Math.round(-sign * extent * (1 - progress)) : 0,
    incomingY: horizontal ? 0 : Math.round(-sign * extent * (1 - progress)),
  };
}
export function drawStoryTransition(
  ctx: CanvasRenderingContext2D,
  outgoing: CanvasImageSource,
  incoming: CanvasImageSource,
  handoff: Handoff,
  frame: number,
  width: number,
  height: number,
  fps = 30,
) {
  const pose = sampleStoryTransition(handoff, frame, width, height, fps);
  ctx.save();
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  if (handoff.mode === "push") {
    ctx.drawImage(outgoing, pose.outgoingX, pose.outgoingY);
    ctx.drawImage(incoming, pose.incomingX, pose.incomingY);
  } else {
    ctx.globalAlpha = pose.outgoingAlpha;
    ctx.drawImage(outgoing, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = pose.incomingAlpha;
    ctx.drawImage(incoming, 0, 0);
  }
  ctx.restore();
}
