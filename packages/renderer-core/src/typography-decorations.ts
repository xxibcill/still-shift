import type { ShapedLayout } from "./shaped-text.ts";
import type { TextNode } from "./typography-style.ts";
import type { TextPose } from "./typography-animation.ts";
import { scalarKeys } from "./motion-craft.ts";
import { sampleCurve } from "./curve.ts";
import { brushStroke } from "./brush-path.ts";
import { inkStrokeOutline } from "./ink-path.ts";
import type { PreparedPath } from "../../scene-contract/src/prepared.ts";

export function decorationSegments(
  node: TextNode,
  layout: ShapedLayout,
  span?: string,
  poses?: TextPose[],
) {
  return layout.lines.flatMap((line) => {
    const indices = line.clusters.filter(
      (i) => !span || node.spans?.[layout.clusters[i]!.spanIndex]?.id === span,
    );
    if (!indices.length) return [];
    const left = Math.min(
      ...indices.map((i) => layout.clusters[i]!.x + (poses?.[i]?.x ?? 0)),
    );
    const right = Math.max(
      ...indices.map(
        (i) =>
          layout.clusters[i]!.x +
          layout.clusters[i]!.advance +
          (poses?.[i]?.x ?? 0),
      ),
    );
    const baseline = line.baseline + (poses?.[indices[0]!]?.y ?? 0);
    return [{ x: left, width: right - left, baseline }];
  });
}
export function drawTextDecorations(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  layout: ShapedLayout,
  frame: number,
  fps: number,
  behind: boolean,
  poses?: TextPose[],
) {
  for (const [index, mark] of (node.decorations ?? []).entries()) {
    if ((mark.kind === "highlight") !== behind) continue;
    const segments = decorationSegments(node, layout, mark.span, poses);
    const reveal = mark.reveal
      ? Math.max(
          0,
          Math.min(1, sampleCurve(scalarKeys(mark.reveal), frame, fps)),
        )
      : 1;
    let remaining =
      segments.reduce((sum, segment) => sum + segment.width, 0) * reveal;
    for (const [line, segment] of segments.entries()) {
      const width = Math.min(segment.width, Math.max(0, remaining));
      remaining -= segment.width;
      if (!width) continue;
      const thickness =
        mark.thickness ??
        (mark.kind === "highlight"
          ? layout.capHeight * 1.25
          : Math.max(1, layout.underlineThickness));
      const y =
        segment.baseline +
        (mark.offset ?? 0) +
        (mark.kind === "underline"
          ? layout.underlinePosition
          : mark.kind === "strike" || mark.kind === "highlight"
            ? -layout.xHeight * 0.5
            : -layout.capHeight);
      ctx.save();
      ctx.fillStyle = mark.color;
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = thickness;
      if (mark.kind === "box") {
        ctx.beginPath();
        ctx.rect(segment.x, y, width, layout.capHeight + layout.descent);
        ctx.stroke();
      } else if (!mark.lineStyle || mark.lineStyle === "uniform")
        ctx.fillRect(segment.x, y - thickness / 2, width, thickness);
      else {
        const path: PreparedPath = {
          id: `${node.id}-decoration-${index}-${line}`,
          type: "path",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          opacity: 1,
          rotation: 0,
          origin: [0, 0],
          gapAt: 0.6,
          gapSize: 0.1,
          stroke: mark.color,
          lineWidth: thickness,
          points: [
            [segment.x, y],
            [segment.x + segment.width, y],
          ],
        };
        const trace = (points: [number, number][]) => {
          if (!points.length) return;
          ctx.beginPath();
          ctx.moveTo(...points[0]!);
          points.slice(1).forEach((p) => ctx.lineTo(...p));
          ctx.closePath();
          ctx.fill();
        };
        if (mark.lineStyle === "ink")
          trace(inkStrokeOutline(path, 0, width / segment.width));
        else {
          const brush = brushStroke(path, 0, width / segment.width);
          ctx.globalAlpha *= 0.18;
          trace(brush.wash);
          ctx.globalAlpha /= 0.18;
          trace(brush.body);
        }
      }
      ctx.restore();
    }
  }
}
