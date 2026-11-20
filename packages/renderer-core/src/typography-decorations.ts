import type { ShapedLayout } from "./shaped-text.ts";
import type { TextNode } from "./typography-style.ts";
import type { TextPose } from "./typography-animation.ts";
import { scalarKeys } from "./motion-craft.ts";
import { sampleCurve } from "./curve.ts";
import { brushStroke } from "./brush-path.ts";
import { inkStrokeOutline } from "./ink-path.ts";
import type { PreparedPath } from "../../scene-contract/src/prepared.ts";

/**
 * A decoration as drawn: the prepared shape plus the composition-only
 * opt-ins `fadeWithText` (ET5a) and `growWithText` (editorial titles
 * Phase 1), which `textNode` carries through.
 */
export type DrawnTextDecoration = NonNullable<
  TextNode["decorations"]
>[number] & {
  fadeWithText?: boolean;
  growWithText?: boolean;
  padding?: DecorationPaddingInput;
};

/**
 * `padding` as the composition schema accepts it, in CSS order: one value
 * for every side, `[vertical, horizontal]` or `[top, right, bottom, left]`.
 */
export type DecorationPaddingInput =
  | number
  | readonly [number, number]
  | readonly [number, number, number, number];

export type DecorationPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
/** A decoration's `padding` in CSS order (Phase 1); zero when unset. */
export function decorationPadding(
  mark: DrawnTextDecoration,
): DecorationPadding {
  const p = mark.padding;
  if (p === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  if (p.length === 2)
    return { top: p[0], right: p[1], bottom: p[0], left: p[1] };
  return { top: p[0], right: p[1], bottom: p[2], left: p[3] };
}
/** A decoration segment widened by the horizontal padding. */
export function padSegment<T extends { x: number; width: number }>(
  segment: T,
  padding: DecorationPadding,
): T {
  return {
    ...segment,
    x: segment.x - padding.left,
    width: segment.width + padding.left + padding.right,
  };
}
/**
 * The band a highlight, underline or strike paints around centre line `y`:
 * `thickness` grown by the vertical padding, about the unpadded centre.
 * Unpadded, `top` and `bottom` are exactly `y ∓ thickness / 2`.
 */
export function decorationBand(
  y: number,
  thickness: number,
  padding: DecorationPadding,
) {
  return {
    top: y - thickness / 2 - padding.top,
    bottom: y + thickness / 2 + padding.bottom,
    height: thickness + padding.top + padding.bottom,
  };
}
/**
 * The rectangle a box decoration strokes from cap line `y`, through the
 * descent, grown by the vertical padding (stroke width not included).
 */
export function decorationBoxBand(
  y: number,
  layout: { capHeight: number; descent: number },
  padding: DecorationPadding,
) {
  return {
    top: y - padding.top,
    bottom: y + layout.capHeight + layout.descent + padding.bottom,
    height: layout.capHeight + layout.descent + padding.top + padding.bottom,
  };
}

/** A glyph a text animator has revealed: opacity and scale above 0. */
const revealedPose = (pose: TextPose | undefined) =>
  !pose || (pose.opacity > 0 && pose.scale !== 0);

/**
 * Which glyphs a decoration covers: its `span` (all text when unset), and
 * with `growWithText` only those revealed so far. A decoration is one;
 * bounds that must cover every frame pass `{ span }` alone.
 */
export type DecorationSelection = {
  span?: string | undefined;
  growWithText?: boolean | undefined;
};

/**
 * Per line, the selected glyphs' extent. With `growWithText` and poses, only
 * non-blank glyphs the animators have revealed count (a space is not an
 * animator unit and keeps its rest pose), so a line with none revealed has
 * no segment.
 */
export function decorationSegments(
  node: TextNode,
  layout: ShapedLayout,
  { span, growWithText }: DecorationSelection,
  poses?: TextPose[],
) {
  const grow = growWithText === true;
  return layout.lines.flatMap((line) => {
    const indices = line.clusters.filter(
      (i) =>
        (!span || node.spans?.[layout.clusters[i]!.spanIndex]?.id === span) &&
        (!grow ||
          !poses ||
          (/\S/u.test(layout.clusters[i]!.text) && revealedPose(poses[i]))),
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
    // A growing mark follows its most-revealed glyph (the first on ties), so
    // a glyph still entering does not drag the band; fully revealed, that is
    // the first glyph, as without `grow`.
    const anchor =
      grow && poses
        ? indices.reduce((best, i) =>
            (poses[i]?.opacity ?? 1) > (poses[best]?.opacity ?? 1) ? i : best,
          )
        : indices[0]!;
    const baseline = line.baseline + (poses?.[anchor]?.y ?? 0);
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
export const decorationFadesWithText = (mark: DrawnTextDecoration) =>
  mark.fadeWithText === true;
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
    const padding = decorationPadding(mark);
    const segments = decorationSegments(node, layout, mark, poses).map(
      (segment) => padSegment(segment, padding),
    );
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
      const band = decorationBand(y, thickness, padding);
      if (mark.kind === "box") {
        const box = decorationBoxBand(y, layout, padding);
        ctx.beginPath();
        ctx.rect(segment.x, box.top, width, box.height);
        ctx.stroke();
      } else if (!mark.lineStyle || mark.lineStyle === "uniform")
        ctx.fillRect(segment.x, band.top, width, band.height);
      else {
        // Exactly `y` when unpadded, so existing paths are unchanged.
        const bandY = y + (padding.bottom - padding.top) / 2;
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
          lineWidth: band.height,
          points: [
            [segment.x, bandY],
            [segment.x + segment.width, bandY],
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
