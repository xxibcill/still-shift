import type { BezierPath } from "@still-shift/scene-contract";
import type { Point } from "../../node-transform.ts";
import type { ShapeDraw, ShapePaint, CompiledShapes } from "../shapes/types.ts";
import { cssColor } from "./canvas-color.ts";

function trace(ctx: CanvasRenderingContext2D, path: BezierPath) {
  const v = path.vertices;
  if (!v.length) return;
  ctx.moveTo(...v[0]!);
  for (let i = 0; i < v.length - (path.closed ? 0 : 1); i++) {
    const next = (i + 1) % v.length,
      a = v[i]!,
      b = v[next]!;
    const out = path.outTangents?.[i] ?? [0, 0],
      incoming = path.inTangents?.[next] ?? [0, 0];
    if (!out[0] && !out[1] && !incoming[0] && !incoming[1]) ctx.lineTo(...b);
    else
      ctx.bezierCurveTo(
        a[0] + out[0],
        a[1] + out[1],
        b[0] + incoming[0],
        b[1] + incoming[1],
        ...b,
      );
  }
  if (path.closed) ctx.closePath();
}
function contour(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  ctx.moveTo(...points[0]!);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}
function paintStyle(
  ctx: CanvasRenderingContext2D,
  paint: ShapePaint,
): string | CanvasGradient {
  if (paint.type === "fill" || paint.type === "stroke")
    return cssColor(paint.color);
  const stops = [...paint.stops].sort((a, b) => a.offset - b.offset);
  const [x, y] = paint.start,
    [ex, ey] = paint.end,
    radius = Math.hypot(ex - x, ey - y);
  if (!radius) return cssColor(stops.at(-1)!.color);
  const gradient =
    paint.gradient === "linear"
      ? ctx.createLinearGradient(x, y, ex, ey)
      : ctx.createRadialGradient(x, y, 0, x, y, radius);
  for (const stop of stops)
    gradient.addColorStop(stop.offset, cssColor(stop.color));
  return gradient;
}
function nibs(ctx: CanvasRenderingContext2D, draw: ShapeDraw) {
  const alpha = ctx.globalAlpha;
  for (const path of draw.paths)
    for (const nib of path.nibs ?? []) {
      if (nib.wash.length) {
        ctx.globalAlpha = alpha * 0.18;
        ctx.beginPath();
        contour(ctx, nib.wash);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      contour(ctx, nib.body);
      for (const cut of nib.cuts) contour(ctx, cut);
      ctx.fill(
        draw.paint.type === "stroke" || draw.paint.type === "gradient-stroke"
          ? draw.paint.style === "ink"
            ? "nonzero"
            : "evenodd"
          : "evenodd",
      );
    }
}

/** Native cubic traces keep open strokes open; brush cuts reveal the wash/backdrop. */
export function drawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: CompiledShapes,
) {
  for (const draw of shapes.draws) {
    ctx.save();
    try {
      ctx.transform(...draw.matrix);
      ctx.globalAlpha *= draw.opacity * draw.paint.opacity;
      const paint = draw.paint,
        style = paintStyle(ctx, paint);
      ctx.fillStyle = style;
      ctx.strokeStyle = style;
      if (paint.type === "stroke" || paint.type === "gradient-stroke") {
        if (!paint.width) continue;
        if (paint.style && paint.style !== "plain") {
          nibs(ctx, draw);
          continue;
        }
        ctx.lineWidth = paint.width;
        ctx.lineCap = paint.cap ?? "butt";
        ctx.lineJoin = paint.join ?? "miter";
        ctx.miterLimit = paint.miterLimit ?? 4;
        ctx.setLineDash(paint.dashes ?? []);
        ctx.lineDashOffset = paint.dashOffset;
        ctx.beginPath();
        for (const path of draw.paths) trace(ctx, path.path);
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (const path of draw.paths) trace(ctx, path.path);
        ctx.fill(paint.rule ?? "nonzero");
      }
    } finally {
      ctx.restore();
    }
  }
}
