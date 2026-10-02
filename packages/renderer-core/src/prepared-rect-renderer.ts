import type { PreparedNode } from "@still-shift/scene-contract";

export function drawPreparedRect(
  ctx: CanvasRenderingContext2D,
  node: Extract<PreparedNode, { type: "rect" }>,
  reveal: number,
) {
  if (reveal < 1) {
    ctx.beginPath();
    ctx.rect(0, 0, node.width * reveal, node.height);
    ctx.clip();
  }
  ctx.fillStyle = node.fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, node.width, node.height, node.radius);
  ctx.fill();
  if (node.stroke && node.lineWidth) {
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.lineWidth;
    ctx.stroke();
  }
}
