import type { PreparedPath } from "@still-shift/scene-contract";
import { pathLength, pointOnPath } from "./prepared-scene.ts";
import { inkStrokeOutline } from "./ink-path.ts";
import { brushStroke } from "./brush-path.ts";

export type PathDrawingState = {
  reveal: number;
  gap: number;
  pinch: number;
  pulse: number;
  trimStart?: number;
  trimEnd?: number;
  trimOffset?: number;
};

const traceOutline = (
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
) => {
  if (!points.length) return;
  ctx.moveTo(...points[0]!);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
};

const strokeInterval = (
  ctx: CanvasRenderingContext2D,
  node: PreparedPath & { textureWidth?: number },
  start: number,
  end: number,
  pinch = 0,
) => {
  if (end <= start) return;
  if (node.lineStyle === "brush") {
    const mark = brushStroke(node, start, end, pinch, node.textureWidth);
    ctx.save();
    ctx.fillStyle = node.stroke;
    const opacity = ctx.globalAlpha;
    ctx.globalAlpha = opacity * 0.18;
    ctx.beginPath();
    traceOutline(ctx, mark.wash);
    ctx.fill();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    traceOutline(ctx, mark.body);
    for (const cut of mark.cuts) traceOutline(ctx, cut);
    ctx.fill("evenodd");
    ctx.restore();
    return;
  }
  if (node.lineStyle === "ink") {
    const outline = inkStrokeOutline(node, start, end);
    if (outline.length === 0) return;
    ctx.beginPath();
    traceOutline(ctx, outline);
    ctx.fillStyle = node.stroke;
    ctx.fill();
    return;
  }
  const total = pathLength(node.points);
  const first = pointOnPath(node, start);
  ctx.beginPath();
  ctx.moveTo(...first);
  let distance = 0;
  for (let i = 1; i < node.points.length; i++) {
    const a = node.points[i - 1]!;
    const b = node.points[i]!;
    distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance / total > start && distance / total < end) ctx.lineTo(...b);
  }
  ctx.lineTo(...pointOnPath(node, end));
  ctx.stroke();
};

export const drawPreparedPath = (
  ctx: CanvasRenderingContext2D,
  node: PreparedPath,
  state: PathDrawingState,
) => {
  ctx.strokeStyle = node.stroke;
  ctx.lineWidth = node.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (state.pulse > 0) {
    ctx.shadowColor = "#8B3F36";
    ctx.shadowOffsetX = 5 * state.pulse;
    ctx.shadowOffsetY = -3 * state.pulse;
  }
  const gap = (node.gapSize * state.gap) / 2;
  if (
    state.trimStart !== undefined ||
    state.trimEnd !== undefined ||
    state.trimOffset !== undefined
  ) {
    const start = state.trimStart ?? 0,
      end = Math.min(state.reveal, state.trimEnd ?? 1),
      offset = (((state.trimOffset ?? 0) % 1) + 1) % 1;
    if (end - start >= 1) strokeInterval(ctx, node, 0, 1, state.pinch);
    else if (end > start) {
      const a = (start + offset) % 1,
        b = (end + offset) % 1;
      if (b > a) strokeInterval(ctx, node, a, b, state.pinch);
      else {
        strokeInterval(ctx, node, a, 1, state.pinch);
        strokeInterval(ctx, node, 0, b, state.pinch);
      }
    }
  } else if (gap === 0) strokeInterval(ctx, node, 0, state.reveal, state.pinch);
  else {
    strokeInterval(
      ctx,
      node,
      0,
      Math.min(state.reveal, node.gapAt - gap),
      state.pinch,
    );
    if (state.reveal > node.gapAt + gap)
      strokeInterval(ctx, node, node.gapAt + gap, state.reveal, state.pinch);
  }
  if (node.endArrow && state.reveal === 1) {
    const tip = pointOnPath(node, 1);
    const before = pointOnPath(node, 0.97);
    const angle = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
    const length = node.lineWidth * 2.2;
    const wing = node.lineWidth * 0.95;
    const bx = tip[0] - Math.cos(angle) * length;
    const by = tip[1] - Math.sin(angle) * length;
    if (node.lineStyle === "brush") {
      for (const side of [-1, 1]) {
        strokeInterval(
          ctx,
          {
            ...node,
            id: `${node.id}-wing-${side}`,
            lineWidth: node.lineWidth * 0.55,
            points: [
              [
                bx - Math.sin(angle) * wing * side,
                by + Math.cos(angle) * wing * side,
              ],
              tip,
            ],
          },
          0,
          1,
        );
      }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(bx - Math.sin(angle) * wing, by + Math.cos(angle) * wing);
    ctx.lineTo(...tip);
    ctx.lineTo(bx + Math.sin(angle) * wing, by - Math.cos(angle) * wing);
    ctx.lineWidth = node.lineWidth * 0.45;
    ctx.stroke();
  }
};
