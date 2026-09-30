import type { TextContainer } from "../../scene-contract/src/story-acting.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { measureStoryText } from "./story-text-layout.ts";

import { containerTail, type Rect } from "./text-container-layout.ts";
export { textContainerBounds } from "./text-container-layout.ts";
type TextNode = Extract<PreparedNode, { type: "text" }>;

export function textContainerContent(
  node: TextNode,
  text: string,
  measure: (value: string) => number,
): Rect {
  if (node.textBox)
    return { x: 0, y: 0, width: node.width, height: node.height };
  const layout = measureStoryText(node, text, measure);
  const width = Math.min(layout.width, node.textLayout?.width ?? Infinity);
  return {
    x:
      node.align === "center"
        ? -width / 2
        : node.align === "right"
          ? -width
          : 0,
    y: 0,
    width,
    height: Math.min(layout.height, node.textLayout?.height ?? Infinity),
  };
}

function cloudOutline(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  padding: number,
) {
  const { x, y, width: w, height: h } = box;
  const r = Math.min(18, h / 3, w / 4);
  const wave = Math.min(8, padding / 2);
  ctx.moveTo(x + r, y);
  const scallops = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    dx: number,
    dy: number,
  ) => {
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 55));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        end = (i + 1) / count;
      ctx.quadraticCurveTo(
        ax + (bx - ax) * t + dx,
        ay + (by - ay) * t + dy,
        ax + (bx - ax) * end,
        ay + (by - ay) * end,
      );
    }
  };
  scallops(x + r, y, x + w - r, y, 0, wave);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  scallops(x + w, y + r, x + w, y + h - r, -wave, 0);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  scallops(x + w - r, y + h, x + r, y + h, 0, -wave);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  scallops(x, y + h - r, x, y + r, wave, 0);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  container: TextContainer,
) {
  const tail = containerTail(container);
  if (!tail) return;
  const horizontal = tail.side === "top" || tail.side === "bottom";
  const available = horizontal ? box.width : box.height;
  const position = Math.max(
    12,
    Math.min(available - 12, available * tail.position),
  );
  const x = horizontal
    ? box.x + position
    : box.x + (tail.side === "right" ? box.width : 0);
  const y = horizontal
    ? box.y + (tail.side === "bottom" ? box.height : 0)
    : box.y + position;
  const dx = tail.side === "left" ? -1 : tail.side === "right" ? 1 : 0;
  const dy = tail.side === "top" ? -1 : tail.side === "bottom" ? 1 : 0;
  ctx.beginPath();
  if (container.kind === "thought") {
    for (const [fraction, radius] of [
      [0.35, 0.16],
      [0.78, 0.1],
    ] as const) {
      const r = tail.length * radius;
      ctx.moveTo(
        x + dx * tail.length * fraction + r,
        y + dy * tail.length * fraction,
      );
      ctx.arc(
        x + dx * tail.length * fraction,
        y + dy * tail.length * fraction,
        r,
        0,
        Math.PI * 2,
      );
    }
  } else {
    const base = Math.min(12, available / 6);
    ctx.moveTo(x + (horizontal ? -base : -dx), y + (horizontal ? -dy : -base));
    ctx.lineTo(x + dx * tail.length, y + dy * tail.length);
    ctx.lineTo(x + (horizontal ? base : -dx), y + (horizontal ? -dy : base));
    ctx.closePath();
  }
  ctx.fill();
  if (container.strokeWidth) ctx.stroke();
}

export function drawTextContainer(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  text: string,
) {
  drawTextContainerShape(
    ctx,
    node.container!,
    textContainerContent(node, text, (value) => ctx.measureText(value).width),
  );
}

/** Draws a caption, speech or thought container around an already measured content box. */
export function drawTextContainerShape(
  ctx: CanvasRenderingContext2D,
  container: TextContainer,
  content: Rect,
) {
  const box = {
    x: content.x - container.padding,
    y: content.y - container.padding,
    width: content.width + 2 * container.padding,
    height: content.height + 2 * container.padding,
  };
  ctx.save();
  ctx.fillStyle = container.fill;
  ctx.strokeStyle = container.stroke;
  ctx.lineWidth = container.strokeWidth;
  ctx.lineJoin = "round";
  drawTail(ctx, box, container);
  ctx.beginPath();
  if (container.kind === "thought") cloudOutline(ctx, box, container.padding);
  else
    ctx.roundRect(
      box.x,
      box.y,
      box.width,
      box.height,
      Math.min(container.radius, box.width / 2, box.height / 2),
    );
  ctx.fill();
  if (container.strokeWidth) ctx.stroke();
  ctx.restore();
}
