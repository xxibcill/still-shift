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
    // Highest animator opacity of the decorated glyphs on this line (ET5a).
    const opacity = poses
      ? Math.max(
          0,
          ...indices
            .filter((i) => /\S/u.test(layout.clusters[i]!.text))
            .map((i) => poses[i]?.opacity ?? 1),
        )
      : 1;
    return [{ x: left, width: right - left, baseline, opacity }];
  });
}
/** Revealed share of a decoration at `frame`, 0–1. */
export function decorationReveal(
  mark: NonNullable<TextNode["decorations"]>[number],
  frame: number,
  fps: number,
) {
  return mark.reveal
    ? Math.max(0, Math.min(1, sampleCurve(scalarKeys(mark.reveal), frame, fps)))
    : 1;
}
/** ET5a: the mark follows its text's animator opacity (composition opt-in). */
export const decorationFadesWithText = (
  mark: NonNullable<TextNode["decorations"]>[number],
) => (mark as { fadeWithText?: boolean }).fadeWithText === true;
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
    const reveal = decorationReveal(mark, frame, fps);
    const fades = decorationFadesWithText(mark);
    let remaining =
      segments.reduce((sum, segment) => sum + segment.width, 0) * reveal;
    for (const [line, segment] of segments.entries()) {
      const width = Math.min(segment.width, Math.max(0, remaining));
      remaining -= segment.width;
      if (!width) continue;
      const alpha = fades ? Math.min(1, segment.opacity) : 1;
      if (alpha <= 0) continue;
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
      if (alpha < 1) ctx.globalAlpha *= alpha;
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
