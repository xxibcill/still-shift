/**
 * ET6a: measured text geometry, read from the same shaped layout, prepared
 * typography and render-time bounds that drawing uses
 * (docs/editorial-typography-improvement-plan.md#et6a--text-measurement-command).
 *
 * Everything here is in layer-local pixels (origin at the layer's position,
 * y down), so a text layer's measurement does not depend on where the layer
 * is placed: a planner can measure, then compute positions. Measurement adds
 * no taste: it reports geometry and never chooses a size or a position.
 */
import type {
  Composition,
  CompositionLayer,
  CompositionScope,
} from "@still-shift/scene-contract";
import type { LoadedFont } from "../prepared-fonts.ts";
import type { GlyphCluster, ShapedLayout } from "../shaped-text.ts";
import {
  evaluateTextPoses,
  textAnimationFrames,
} from "../typography-animation.ts";
import { decorationSegments } from "../typography-decorations.ts";
import {
  quantizeStrokeWidth,
  type PreparedTypography,
} from "../typography-renderer.ts";
import { applyTextStyle, type TextNode } from "../typography-style.ts";
import type { TextStyle } from "../../../scene-contract/src/typography.ts";
import type { Bounds } from "./evaluate/types.ts";

export const COMPOSITION_TEXT_MEASURE_VERSION = "composition-text-measure-1";

/** A box in layer-local pixels; `width` and `height` are given for convenience. */
export type MeasureBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/** Font metrics at the size used, in pixels, from the font's own tables. */
export type TextFontMetrics = {
  fontAsset: string;
  size: number;
  /** hhea/OS/2 ascent and descent the layout uses for line boxes. */
  ascent: number;
  descent: number;
  /** OS/2 cap height and x-height, scaled to `size`. */
  capHeight: number;
  xHeight: number;
};

export type TextLineMeasure = {
  index: number;
  text: string;
  /** Baseline y. */
  baseline: number;
  /**
   * Line box: advance from `x` to `x + width` (the advance width the renderer
   * aligns, including tracking after the last glyph), ascent to descent of the
   * tallest font on the line.
   */
  advance: MeasureBox;
  /** Union of the line's glyph ink; null for a line without ink. */
  ink: MeasureBox | null;
  /** Cap-height and x-height lines of the layer's base font. */
  capTop: number;
  xTop: number;
};

/** Text of one span (or of the text outside every span) on one line. */
export type TextSpanLineMeasure = {
  line: number;
  text: string;
  advance: MeasureBox;
  ink: MeasureBox | null;
  /** Cap-height and x-height lines of this span's own font. */
  capTop: number;
  xTop: number;
};

export type TextSpanMeasure = {
  /** Index into the layer's `spans`; null for text outside every span. */
  span: number | null;
  id?: string;
  style?: string;
  metrics: TextFontMetrics;
  lines: TextSpanLineMeasure[];
};

/**
 * One word unit as `unit: "word"` text animators move it: Unicode word
 * segmentation, with punctuation joined to the word before it. Whitespace is
 * not part of a word's boxes.
 */
export type TextWordMeasure = {
  index: number;
  text: string;
  line: number;
  /** Span indices the word's glyphs belong to (null: outside every span). */
  spans: (number | null)[];
  advance: MeasureBox;
  ink: MeasureBox | null;
};

export type TextDecorationSegmentMeasure = {
  line: number;
  /** Area the mark paints at full reveal (for `box`, including its stroke). */
  paint: MeasureBox;
  /** Band centre y (highlight, strike, underline) or rectangle top (box). */
  y: number;
  /**
   * `offset` values that would centre a highlight or strike band on this
   * segment: `cap` on the layer's cap band (baseline − capHeight / 2), `ink`
   * on the decorated glyphs' ink. Absent for underline and box.
   */
  centredOffset?: { cap: number; ink: number | null };
};

export type TextDecorationMeasure = {
  index: number;
  kind: "underline" | "strike" | "highlight" | "box";
  span?: string;
  thickness: number;
  offset: number;
  /** Brush and ink line styles paint inside about this band, not exactly it. */
  approximate: boolean;
  segments: TextDecorationSegmentMeasure[];
  paint: MeasureBox | null;
};

/**
 * The outline a `stroke`/`strokeWidth` text animator draws: the stroke is
 * centred on the glyph outline with round joins, so it adds half its width
 * outside the ink on every side.
 */
export type TextOutlineMeasure = {
  /** Largest outline width any visible glyph reaches, as drawn (0.25 px grid). */
  strokeWidth: number;
  /** Extra extent outside the ink: strokeWidth / 2. */
  extent: number;
  /** Ink plus the outline, for the layer and per line. */
  ink: MeasureBox | null;
  lines: { line: number; ink: MeasureBox | null }[];
};

export type TextStateMeasure = {
  state: number;
  text: string;
  /**
   * The render-time `textBounds` for this state: settled layout united with
   * every reachable text-animator pose, decoration reach and container.
   * Renderers use it for culling and surfaces; it is not the settled look.
   */
  motionBounds: MeasureBox;
  /** Settled layout box: union of the line boxes. */
  advance: MeasureBox;
  /** Settled glyph ink of the whole state. */
  ink: MeasureBox | null;
  /** The layer's base font. */
  metrics: TextFontMetrics & { lineHeight: number; tracking: number };
  lines: TextLineMeasure[];
  spans: TextSpanMeasure[];
  words: TextWordMeasure[];
  decorations: TextDecorationMeasure[];
  outline?: TextOutlineMeasure;
};

export type TextLayerMeasure = {
  /** Layer id, prefixed `precompId/` inside a precomp. */
  key: string;
  layer: string;
  scope: string | null;
  align: "left" | "center" | "right";
  anchor: "top" | "cap" | "baseline";
  locale: string;
  /**
   * Composition position of the layer-local origin when the layer is placed
   * by a static translation alone (no anchor, scale, rotation, skew, parent
   * or camera): composition = local + origin. Otherwise null, with the reason.
   */
  origin: [number, number] | null;
  originReason?: string;
} & (
  | { measured: true; states: TextStateMeasure[] }
  | { measured: false; reason: string }
);

export type CompositionTextMeasure = {
  version: typeof COMPOSITION_TEXT_MEASURE_VERSION;
  coordinates: "layer-local";
  layers: TextLayerMeasure[];
};

const box = (b: Bounds): MeasureBox => ({
  left: b.left,
  top: b.top,
  right: b.right,
  bottom: b.bottom,
  width: b.right - b.left,
  height: b.bottom - b.top,
});
const unionBounds = (boxes: Bounds[]): Bounds | null =>
  boxes.length
    ? {
        left: Math.min(...boxes.map((b) => b.left)),
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
      }
    : null;
const maybeBox = (b: Bounds | null) => (b ? box(b) : null);
const padBounds = (b: Bounds, by: number): Bounds => ({
  left: b.left - by,
  top: b.top - by,
  right: b.right + by,
  bottom: b.bottom + by,
});

function clusterInk(cluster: GlyphCluster): Bounds | null {
  const ink = cluster.ink;
  return ink && ink.width > 0 && ink.height > 0
    ? {
        left: ink.x,
        top: ink.y,
        right: ink.x + ink.width,
        bottom: ink.y + ink.height,
      }
    : null;
}
const inkOf = (layout: ShapedLayout, indices: number[]) =>
  unionBounds(
    indices.flatMap((i) => {
      const ink = clusterInk(layout.clusters[i]!);
      return ink ? [ink] : [];
    }),
  );
const advanceOf = (layout: ShapedLayout, indices: number[]): Bounds => {
  const clusters = indices.map((i) => layout.clusters[i]!);
  return {
    left: Math.min(...clusters.map((c) => c.x)),
    right: Math.max(...clusters.map((c) => c.x + c.advance)),
    top: Math.min(...clusters.map((c) => c.baseline - c.ascent)),
    bottom: Math.max(...clusters.map((c) => c.baseline + c.descent)),
  };
};

function styleMetrics(
  ctx: CanvasRenderingContext2D,
  style: TextStyle,
  fonts: Map<string, LoadedFont>,
): TextFontMetrics {
  const font = applyTextStyle(ctx, style, fonts);
  const metrics = font.metrics;
  if (!metrics)
    throw new Error(
      `font-metadata: ${style.fontAsset} requires measured font metrics`,
    );
  const size = style.size!,
    scale = size / metrics.unitsPerEm;
  return {
    fontAsset: style.fontAsset ?? "",
    size,
    ascent: metrics.ascent * scale,
    descent: metrics.descent * scale,
    capHeight: metrics.capHeight * scale,
    xHeight: metrics.xHeight * scale,
  };
}

const whitespace = (text: string) => !/\S/u.test(text);

/** Largest drawn outline width per cluster over the layer's reachable frames. */
function outlineWidths(
  node: TextNode,
  layout: ShapedLayout,
  prepared: PreparedTypography,
): number[] {
  const animators = (prepared.scene.textAnimators ?? []).filter(
    (animator) =>
      animator.node === node.id &&
      (animator.from.strokeWidth !== undefined ||
        animator.to?.strokeWidth !== undefined),
  );
  const widths = layout.clusters.map(() => 0);
  if (!animators.length) return widths;
  const all = (prepared.scene.textAnimators ?? []).filter(
    (animator) => animator.node === node.id,
  );
  for (const frame of textAnimationFrames(prepared.scene, node)) {
    const poses = evaluateTextPoses(node, layout, all, frame, prepared.scene);
    for (const [index, pose] of poses.entries()) {
      if (pose.opacity <= 0) continue;
      widths[index] = Math.max(
        widths[index]!,
        quantizeStrokeWidth(Math.max(0, pose.strokeWidth)),
      );
    }
  }
  return widths;
}

function decorationMeasures(
  node: TextNode,
  layout: ShapedLayout,
): TextDecorationMeasure[] {
  return (node.decorations ?? []).map((mark, index) => {
    const thickness =
      mark.thickness ??
      (mark.kind === "highlight"
        ? layout.capHeight * 1.25
        : Math.max(1, layout.underlineThickness));
    const offset = mark.offset ?? 0;
    const segments = decorationSegments(node, layout, mark.span).map(
      (segment): TextDecorationSegmentMeasure => {
        const line = layout.lines.findIndex(
          (l) => l.baseline === segment.baseline,
        );
        const y =
          segment.baseline +
          offset +
          (mark.kind === "underline"
            ? layout.underlinePosition
            : mark.kind === "strike" || mark.kind === "highlight"
              ? -layout.xHeight * 0.5
              : -layout.capHeight);
        const paint: Bounds =
          mark.kind === "box"
            ? padBounds(
                {
                  left: segment.x,
                  right: segment.x + segment.width,
                  top: y,
                  bottom: y + layout.capHeight + layout.descent,
                },
                thickness / 2,
              )
            : {
                left: segment.x,
                right: segment.x + segment.width,
                top: y - thickness / 2,
                bottom: y + thickness / 2,
              };
        const band = mark.kind === "highlight" || mark.kind === "strike";
        // Band centre with no offset; an offset moves it one for one.
        const centre = segment.baseline - layout.xHeight * 0.5;
        const decorated = (layout.lines[line]?.clusters ?? []).filter(
          (i) =>
            !mark.span ||
            node.spans?.[layout.clusters[i]!.spanIndex]?.id === mark.span,
        );
        const ink = inkOf(layout, decorated);
        return {
          line,
          paint: box(paint),
          y,
          ...(band
            ? {
                centredOffset: {
                  cap: segment.baseline - layout.capHeight / 2 - centre,
                  ink: ink ? (ink.top + ink.bottom) / 2 - centre : null,
                },
              }
            : {}),
        };
      },
    );
    return {
      index,
      kind: mark.kind,
      ...(mark.span ? { span: mark.span } : {}),
      thickness,
      offset,
      approximate: mark.lineStyle === "ink" || mark.lineStyle === "brush",
      segments,
      paint: maybeBox(unionBounds(segments.map((s) => s.paint))),
    };
  });
}

/** Measure one prepared text state from its shaped layout. */
export function measureTextState(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  prepared: PreparedTypography,
  fonts: Map<string, LoadedFont>,
  state: number,
  text: string,
  motionBounds: Bounds,
): TextStateMeasure {
  const layout = prepared.nodes.get(node.id)!.get(text)!.layout;
  const base = layout.runs[0]?.style;
  const baseMetrics: TextFontMetrics = {
    fontAsset: base?.fontAsset ?? node.fontAsset ?? "",
    size: base?.size ?? node.fontSize,
    ascent: layout.ascent,
    descent: layout.descent,
    capHeight: layout.capHeight,
    xHeight: layout.xHeight,
  };
  const lines = layout.lines.map(
    (line, index): TextLineMeasure => ({
      index,
      text: line.text,
      baseline: line.baseline,
      advance: box({
        left: line.x,
        right: line.x + line.width,
        top: line.baseline - line.ascent,
        bottom: line.baseline + line.descent,
      }),
      ink: maybeBox(inkOf(layout, line.clusters)),
      capTop: line.baseline - layout.capHeight,
      xTop: line.baseline - layout.xHeight,
    }),
  );
  // Spans: group clusters by span index, then by line.
  const spanIndices = [
    ...new Set(layout.clusters.map((c) => c.spanIndex)),
  ].sort((a, b) => a - b);
  const spans = spanIndices.map((spanIndex): TextSpanMeasure => {
    const members = layout.clusters.flatMap((c, i) =>
      c.spanIndex === spanIndex ? [i] : [],
    );
    const style = layout.runs[layout.clusters[members[0]!]!.runIndex]!.style;
    const metrics = styleMetrics(ctx, style, fonts);
    const span = spanIndex >= 0 ? node.spans?.[spanIndex] : undefined;
    return {
      span: spanIndex >= 0 ? spanIndex : null,
      ...(span?.id ? { id: span.id } : {}),
      ...(span?.style ? { style: span.style } : {}),
      metrics,
      lines: layout.lines.flatMap((line, lineIndex) => {
        const own = line.clusters.filter(
          (i) => layout.clusters[i]!.spanIndex === spanIndex,
        );
        if (!own.length) return [];
        const visible = own.filter(
          (i) => !whitespace(layout.clusters[i]!.text),
        );
        return [
          {
            line: lineIndex,
            text: own.map((i) => layout.clusters[i]!.text).join(""),
            advance: box(advanceOf(layout, visible.length ? visible : own)),
            ink: maybeBox(inkOf(layout, own)),
            capTop: line.baseline - metrics.capHeight,
            xTop: line.baseline - metrics.xHeight,
          },
        ];
      }),
    };
  });
  // Words: the renderer's word units, per line, without whitespace clusters.
  const words: TextWordMeasure[] = [];
  for (const [lineIndex, line] of layout.lines.entries()) {
    const groups = new Map<number, number[]>();
    for (const i of line.clusters) {
      const cluster = layout.clusters[i]!;
      if (whitespace(cluster.text)) continue;
      const group = groups.get(cluster.wordIndex) ?? [];
      group.push(i);
      groups.set(cluster.wordIndex, group);
    }
    for (const [wordIndex, members] of groups)
      words.push({
        index: wordIndex,
        text: members.map((i) => layout.clusters[i]!.text).join(""),
        line: lineIndex,
        spans: [
          ...new Set(
            members.map((i) => {
              const s = layout.clusters[i]!.spanIndex;
              return s >= 0 ? s : null;
            }),
          ),
        ],
        advance: box(advanceOf(layout, members)),
        ink: maybeBox(inkOf(layout, members)),
      });
  }
  const widths = outlineWidths(node, layout, prepared);
  const strokeWidth = Math.max(0, ...widths);
  const outlined = (indices: number[]) =>
    unionBounds(
      indices.flatMap((i) => {
        const ink = clusterInk(layout.clusters[i]!);
        return ink ? [padBounds(ink, widths[i]! / 2)] : [];
      }),
    );
  const all = layout.clusters.map((_, i) => i);
  return {
    state,
    text,
    motionBounds: box(motionBounds),
    advance: box(
      unionBounds(
        lines.map((line) => ({
          left: line.advance.left,
          right: line.advance.right,
          top: line.advance.top,
          bottom: line.advance.bottom,
        })),
      )!,
    ),
    ink: maybeBox(inkOf(layout, all)),
    metrics: {
      ...baseMetrics,
      lineHeight: layout.lineHeight,
      tracking: layout.tracking,
    },
    lines,
    spans,
    words,
    decorations: decorationMeasures(node, layout),
    ...(strokeWidth > 0
      ? {
          outline: {
            strokeWidth,
            extent: strokeWidth / 2,
            ink: maybeBox(outlined(all)),
            lines: layout.lines.map((line, index) => ({
              line: index,
              ink: maybeBox(outlined(line.clusters)),
            })),
          },
        }
      : {}),
  };
}

const isPair = (value: unknown, x: number, y: number) =>
  Array.isArray(value) && value[0] === x && value[1] === y;
const staticPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => typeof v === "number");

/** Where the layer-local origin sits in the composition, when that is static. */
export function measuredLayerOrigin(
  comp: Composition,
  scope: CompositionScope,
  layer: CompositionLayer,
): { origin: [number, number] | null; originReason?: string } {
  const none = (originReason: string) => ({ origin: null, originReason });
  if (scope !== comp) return none("layer is inside a precomp");
  if ("parent" in layer && layer.parent) return none("layer has a parent");
  if (comp.layers.some((l) => l.type === "camera"))
    return none("composition has a camera");
  const t = (layer.transform ?? {}) as Record<string, unknown>;
  const position = t.position ?? [0, 0];
  if (!staticPair(position)) return none("position is animated");
  if (t.anchor !== undefined && !isPair(t.anchor, 0, 0))
    return none("layer has an anchor");
  if (t.scale !== undefined && !isPair(t.scale, 1, 1))
    return none("layer is scaled");
  for (const key of [
    "rotation",
    "skewX",
    "skewY",
    "rotationX",
    "rotationY",
  ] as const)
    if (t[key] !== undefined && t[key] !== 0) return none(`layer has ${key}`);
  if (t.orientation !== undefined) return none("layer has orientation");
  return { origin: [position[0], position[1]] };
}
