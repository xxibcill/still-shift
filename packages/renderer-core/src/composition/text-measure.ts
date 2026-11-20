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
import {
  compositionEffectDefinition,
  expressionEntries,
  isPropertyPathError,
  isResolvedProperty,
  parsePropertyPath,
  resolvePropertyPath,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
} from "@still-shift/scene-contract";
import type { LoadedFont } from "../prepared-fonts.ts";
import type { GlyphCluster, ShapedLayout } from "../shaped-text.ts";
import {
  evaluateTextPoses,
  textAnimationFrames,
} from "../typography-animation.ts";
import {
  decorationBand,
  decorationBoxBand,
  decorationPadding,
  decorationSegments,
  type DecorationPadding,
  type DrawnTextDecoration,
} from "../typography-decorations.ts";
import { glowWeight } from "../pixel-effects.ts";
import {
  quantizeStrokeWidth,
  typographyContainerContent,
  type PreparedTypography,
} from "../typography-renderer.ts";
import { textContainerBounds } from "../text-container.ts";
import {
  applyTextStyle,
  resolvedTextStyle,
  type TextNode,
} from "../typography-style.ts";
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
  /** Resolved `padding` (Phase 1), present when the decoration sets one. */
  padding?: DecorationPadding;
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

/**
 * Coverage (alpha) at which `visible` boxes of soft effects are measured. A
 * Gaussian tail has no hard edge; this is where it fades below about 13/255.
 */
export const TEXT_EFFECT_VISIBLE_COVERAGE = 0.05;

/**
 * How a `light.drop-shadow` or `light.glow` on the layer extends what it
 * paints. Effects apply to everything the layer draws (ink, outline,
 * decorations and container), so both boxes grow from `source`. Values are in layer pixels,
 * which are the effect's pixels when the layer is not scaled (see `origin`).
 */
export type TextEffectMeasure = {
  index: number;
  id: string;
  effect: "light.drop-shadow" | "light.glow";
  /** Drop shadow: offset as drawn (1/16 px grid); the extremes when keyed. */
  offset?: { min: [number, number]; max: [number, number] };
  /** Gaussian standard deviation: drop-shadow `blur`, glow `radius`. */
  sigma: number;
  /**
   * Peak strength: shadow opacity × colour alpha, or glow intensity × the
   * brightest source colour's thresholded luminance (glyphs, outlines,
   * decorations and container). Strength sets `visible` only; `paint` does not depend on it.
   */
  strength: number;
  /**
   * The renderer's own bound for the effect (kernel radius ⌈3σ⌉ + 1 for a
   * shadow, 3σ + 2 for glow): no effect pixel lies outside `paint`.
   */
  reach: number;
  paint: MeasureBox;
  /**
   * Distance outside a long straight edge of `source` (shifted by the offset)
   * at which the effect falls to TEXT_EFFECT_VISIBLE_COVERAGE: σ·Q⁻¹(c / strength).
   * Negative when it reaches that coverage only inside the edge (strength
   * below twice the coverage); null when it never does. Thin strokes and
   * corners carry less mass, so their visible edge lies inside this.
   */
  visibleReach: number | null;
  visible: MeasureBox | null;
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
  /**
   * The layer's `container` (caption, speech or thought shape) as drawn:
   * the content box plus padding, half the stroke and the tail.
   */
  container?: MeasureBox;
  /**
   * Drop shadows and glows on the layer, in stack order. `source` is what
   * they grow from: ink, outline, decorations at full reveal and the
   * container; `paint` and `visible` are the layer's whole painted box
   * including them. `unmeasured` lists shadows and glows whose parameters
   * could not be read and every other enabled effect that spreads paint
   * (blurs, `distort.sine`, generators, effects with their own bounds rule):
   * `paint` and `visible` exclude those, so they are not the whole layer
   * while `unmeasured` is not empty.
   */
  effects?: {
    coverage: typeof TEXT_EFFECT_VISIBLE_COVERAGE;
    source: MeasureBox;
    list: TextEffectMeasure[];
    paint: MeasureBox;
    visible: MeasureBox;
    unmeasured: { id: string; effect: string; reason: string }[];
  };
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
   * by a static translation alone (no anchor, scale, rotation, skew, parent,
   * camera layer, `camera2d` the layer follows, or driver, periodic motion,
   * expression or constraint that moves it): composition = local + origin.
   * Otherwise null, with the reason.
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
    const padding = decorationPadding(mark);
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
        const painted =
          mark.kind === "box"
            ? decorationBoxBand(y, layout, padding)
            : decorationBand(y, thickness, padding);
        // The reported segment stays unpadded; its paint carries the padding.
        const extent: Bounds = {
          left: segment.x - padding.left,
          right: segment.x + segment.width + padding.right,
          top: painted.top,
          bottom: painted.bottom,
        };
        const paint: Bounds =
          mark.kind === "box" ? padBounds(extent, thickness / 2) : extent;
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
      ...((mark as DrawnTextDecoration).padding !== undefined
        ? { padding }
        : {}),
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
  // The base style the layout's ascent, descent and cap/x heights come from
  // (shapeText), not the first run's, which is a span's when text opens
  // with one.
  const base = resolvedTextStyle(node, prepared.scene.textStyles ?? {});
  const baseMetrics: TextFontMetrics = {
    fontAsset: base.fontAsset ?? node.fontAsset ?? "",
    size: base.size ?? node.fontSize,
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
  const container = node.container
    ? textContainerBounds(
        typographyContainerContent(node, layout),
        node.container,
      )
    : undefined;
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
    ...(container
      ? {
          container: box({
            left: container.x,
            top: container.y,
            right: container.x + container.width,
            bottom: container.y + container.height,
          }),
        }
      : {}),
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

/** Upper-tail inverse of the standard normal: z with 1 − Φ(z) = p (0 < p < 1). */
export function normalTailInverse(p: number): number {
  // Acklam's rational approximation of Φ⁻¹(1 − p), |error| < 1.2e-9.
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const q = 1 - p;
  const tail = (r: number) =>
    (((((c[0]! * r + c[1]!) * r + c[2]!) * r + c[3]!) * r + c[4]!) * r +
      c[5]!) /
    ((((d[0]! * r + d[1]!) * r + d[2]!) * r + d[3]!) * r + 1);
  if (q < 0.02425) return tail(Math.sqrt(-2 * Math.log(q)));
  if (q > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - q)));
  const r = q - 0.5,
    t = r * r;
  return (
    ((((((a[0]! * t + a[1]!) * t + a[2]!) * t + a[3]!) * t + a[4]!) * t +
      a[5]!) *
      r) /
    (((((b[0]! * t + b[1]!) * t + b[2]!) * t + b[3]!) * t + b[4]!) * t + 1)
  );
}

type EffectInstance = NonNullable<CompositionLayer["effects"]>[number];
/** Static value, or every keyed value; undefined for anything else. */
function keyedValues<T>(value: unknown, fallback: T): T[] | undefined {
  if (value === undefined) return [fallback];
  if (
    value &&
    typeof value === "object" &&
    "keys" in value &&
    Array.isArray((value as { keys: unknown[] }).keys)
  )
    return (value as { keys: { value: T }[] }).keys.map((key) => key.value);
  if (
    typeof value === "number" ||
    Array.isArray(value) ||
    typeof value === "string"
  )
    return [value as T];
  return undefined;
}
const luminance = (hex: string) => {
  const [r, g, b, a] = [1, 3, 5, 7].map((at) =>
    at === 7 && hex.length === 7
      ? 1
      : parseInt(hex.slice(at, at + 2), 16) / 255,
  ) as [number, number, number, number];
  return { value: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha: a };
};

/** Effects the renderer's `effectBounds` lets paint past their source. */
const MARGIN_EFFECTS = new Set([
  "blur.gaussian",
  "blur.primitive",
  "blur.directional",
  "distort.sine",
]);
function spreadsPaint(effect: EffectInstance): boolean {
  const definition = compositionEffectDefinition(effect.effect);
  return (
    MARGIN_EFFECTS.has(effect.effect) ||
    Boolean(definition?.expandBounds) ||
    Boolean(definition?.generatesContent)
  );
}

/**
 * Measure the layer's drop shadows and glows from `source` (ink, outline,
 * decorations and container), with the kernels and bounds rules the renderer uses
 * (shadow-effects.ts, pixel-effects.ts glow, evaluate/effects.ts bounds).
 */
export function measureTextEffects(
  effects: readonly EffectInstance[] | undefined,
  state: TextStateMeasure,
  colors: string[],
): TextStateMeasure["effects"] | undefined {
  const own = (effects ?? []).filter(
    (effect) =>
      effect.enabled !== false &&
      (effect.effect === "light.drop-shadow" || effect.effect === "light.glow"),
  );
  const spreading = (effects ?? []).filter(
    (effect) =>
      effect.enabled !== false && !own.includes(effect) && spreadsPaint(effect),
  );
  if (!own.length && !spreading.length) return undefined;
  const sourceBox = unionBounds([
    ...(state.outline?.ink
      ? [state.outline.ink]
      : state.ink
        ? [state.ink]
        : []),
    ...state.decorations.flatMap((d) => (d.paint ? [d.paint] : [])),
    ...(state.container ? [state.container] : []),
  ]);
  if (!sourceBox) return undefined;
  let paint: Bounds = sourceBox,
    visible: Bounds = sourceBox;
  const list: TextEffectMeasure[] = [];
  const unmeasured: { id: string; effect: string; reason: string }[] = [];
  const brightest = Math.max(0, ...colors.map((c) => luminance(c).value));
  for (const [index, effect] of (effects ?? []).entries()) {
    if (spreading.includes(effect)) {
      unmeasured.push({
        id: effect.id,
        effect: effect.effect,
        reason:
          "spreads paint beyond its source; not included in paint or visible",
      });
      continue;
    }
    if (!own.includes(effect)) continue;
    const params = (effect.params ?? {}) as Record<string, unknown>;
    if (effect.effect === "light.drop-shadow") {
      const offsets = keyedValues<number[]>(params.offset, [6, 6]);
      const blurs = keyedValues<number>(params.blur, 8);
      const opacities = keyedValues<number>(params.opacity, 1);
      const colours = keyedValues<string>(params.color, "#000000");
      if (!offsets || !blurs || !opacities || !colours) {
        unmeasured.push({
          id: effect.id,
          effect: effect.effect,
          reason: "parameters are neither static nor keyed values",
        });
        continue;
      }
      const grid = (v: number) => Math.round(v * 16) / 16;
      const xs = offsets.map((o) => grid(o[0]!)),
        ys = offsets.map((o) => grid(o[1]!));
      const sigma = Math.max(...blurs);
      const strength =
        Math.max(...opacities) *
        Math.max(...colours.map((c) => luminance(c).alpha));
      const min: [number, number] = [Math.min(...xs), Math.min(...ys)],
        max: [number, number] = [Math.max(...xs), Math.max(...ys)];
      const shifted: Bounds = {
        left: paint.left + min[0],
        right: paint.right + max[0],
        top: paint.top + min[1],
        bottom: paint.bottom + max[1],
      };
      const reach = Math.ceil(sigma * 3) + 1;
      const visibleReach =
        strength <= TEXT_EFFECT_VISIBLE_COVERAGE
          ? null
          : sigma === 0
            ? 0
            : sigma *
              normalTailInverse(TEXT_EFFECT_VISIBLE_COVERAGE / strength);
      const own = strength > 0 ? padBounds(shifted, reach) : null;
      const shownSource: Bounds = {
        left: visible.left + min[0],
        right: visible.right + max[0],
        top: visible.top + min[1],
        bottom: visible.bottom + max[1],
      };
      const shown =
        visibleReach === null ? null : padBounds(shownSource, visibleReach);
      list.push({
        index,
        id: effect.id,
        effect: "light.drop-shadow",
        offset: { min, max },
        sigma,
        strength,
        reach,
        paint: box(own ?? paint),
        visibleReach,
        visible: maybeBox(shown),
      });
      if (own) paint = unionBounds([paint, own])!;
      if (shown) visible = unionBounds([visible, shown])!;
    } else {
      const radii = keyedValues<number>(params.radius, 0);
      const intensities = keyedValues<number>(params.intensity, 1);
      const thresholds = keyedValues<number>(params.threshold, 0);
      const tints = keyedValues<number>(params.tint, 0);
      if (!radii || !intensities || !thresholds || !tints) {
        unmeasured.push({
          id: effect.id,
          effect: effect.effect,
          reason: "parameters are neither static nor keyed values",
        });
        continue;
      }
      const sigma = Math.max(...radii);
      const threshold = Math.min(...thresholds);
      const strength =
        Math.max(...intensities) *
        glowWeight(
          Math.max(0, (brightest - threshold) / Math.max(0.001, 1 - threshold)),
          Math.max(...tints),
        );
      const reach = sigma > 0 ? 3 * sigma + 2 : 0;
      const visibleReach =
        strength <= TEXT_EFFECT_VISIBLE_COVERAGE || sigma === 0
          ? null
          : sigma * normalTailInverse(TEXT_EFFECT_VISIBLE_COVERAGE / strength);
      // The renderer's bound (`effectBounds`) pads by the radius whatever the
      // colours: glow thresholds every painted pixel, not just these colours.
      const own = reach > 0 ? padBounds(paint, reach) : null;
      const shown =
        visibleReach === null ? null : padBounds(visible, visibleReach);
      list.push({
        index,
        id: effect.id,
        effect: "light.glow",
        sigma,
        strength,
        reach,
        paint: box(own ?? paint),
        visibleReach,
        visible: maybeBox(shown),
      });
      if (own) paint = unionBounds([paint, own])!;
      if (shown) visible = unionBounds([visible, shown])!;
    }
  }
  return {
    coverage: TEXT_EFFECT_VISIBLE_COVERAGE,
    source: box(sourceBox),
    list,
    paint: box(paint),
    visible: box(visible),
    unmeasured,
  };
}

/**
 * Colours the layer can paint in: fill, span fills, animated fills and
 * outlines, decorations (including those text events lower into) and the
 * container's fill and stroke.
 */
export function textColors(
  node: TextNode,
  prepared: PreparedTypography,
): string[] {
  const colors = new Set<string>([node.color]);
  for (const span of node.spans ?? []) if (span.color) colors.add(span.color);
  for (const mark of node.decorations ?? []) colors.add(mark.color);
  if (node.container) {
    colors.add(node.container.fill);
    if (node.container.strokeWidth) colors.add(node.container.stroke);
  }
  for (const animator of prepared.scene.textAnimators ?? []) {
    if (animator.node !== node.id) continue;
    for (const props of [animator.from, animator.to])
      for (const key of ["fill", "stroke"] as const) {
        const value = (props as Record<string, unknown> | undefined)?.[key];
        if (typeof value === "string") colors.add(value);
      }
  }
  return [...colors].filter((c) =>
    /^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/u.test(c),
  );
}

const isPair = (value: unknown, x: number, y: number) =>
  Array.isArray(value) && value[0] === x && value[1] === y;
const staticVector = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((v) => typeof v === "number");
const staticPair = (value: unknown): value is [number, number] =>
  staticVector(value, 2);
const staticTriple = (value: unknown) => staticVector(value, 3);

/**
 * What else writes a top-level layer's transform at evaluation time: comp
 * drivers, periodic motion, expressions (including those behaviours compile
 * to), each resolved as the evaluator resolves it, and scope constraints.
 */
function transformWriter(
  comp: Composition,
  layer: CompositionLayer,
): string | undefined {
  const movesLayer = (text: string) => {
    const resolved = resolvePropertyPath(comp, text);
    const path = parsePropertyPath(
      isResolvedProperty(resolved) ? resolved.path : text,
    );
    if (isPropertyPathError(path)) return false;
    const [head, next] = path.segments;
    return (
      !path.scope.length &&
      path.layer === layer.id &&
      head?.name === "transform" &&
      next?.name !== "opacity"
    );
  };
  if ((comp.drivers ?? []).some((motion) => movesLayer(motion.target)))
    return "a driver moves the layer";
  if (
    (comp.periodic ?? []).some((motion) =>
      movesLayer(motion.target ?? `${motion.node}.${motion.property}`),
    )
  )
    return "periodic motion moves the layer";
  if (expressionEntries(comp).some((entry) => movesLayer(entry.target)))
    return "an expression moves the layer";
  if ((comp.constraints ?? []).some((c) => c.target === layer.id))
    return "a constraint moves the layer";
  return undefined;
}

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
  // Unparented layers follow the 2D camera unless their cameraDepth is 0.
  if (comp.camera2d && (layer.cameraDepth ?? 1) !== 0)
    return none("composition has camera2d");
  const t = (layer.transform ?? {}) as Record<string, unknown>;
  const position = t.position ?? [0, 0];
  if (staticTriple(position)) return none("position has a depth component");
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
  const writer = transformWriter(comp, layer);
  if (writer) return none(writer);
  return { origin: [position[0], position[1]] };
}
