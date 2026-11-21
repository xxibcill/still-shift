/**
 * ET3 text legibility over rendered frames
 * (docs/editorial-typography-improvement-plan.md#et3--text-over-video-legibility-checks).
 *
 * `text-contrast` reuses the story typography measure (typography-pixels.ts):
 * at every opaque glyph-interior pixel of a text layer, the WCAG 2 contrast
 * between the frame as rendered and the same frame rendered without that
 * layer's glyphs; a low percentile of those per-pixel ratios is the contrast.
 * Composition text is attributed per word with a colour-coded glyph mask, so a
 * finding names the words over the dark (or bright) part of the footage.
 * `x-height-floor` and `platform-safe-zone` are geometry checks over the same
 * reading window. All three are legibility signals, not visual acceptance.
 */
import {
  declaredFontAxes,
  parsePropertyPath,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { readFontMetrics } from "../font-metrics.ts";
import { resolvedTextStyle } from "../typography-style.ts";
import { textNode, type TextLayer } from "./render/text-scenes.ts";
import { outlinedReading, outlinedText } from "./reading-motion.ts";
import type { CompositionQualityFrame } from "./quality-samples.ts";
import {
  lintSeverity,
  readsOutlinedText,
  TEXT_LEGIBILITY_CODES,
  type MotionLintDiagnostic,
  type ResolvedCompositionQualityPolicy,
  type TextContrastLayerEvidence,
  type TextContrastSample,
  type TextLegibilityCode,
  type TextLegibilityEvidence,
} from "./quality-policy.ts";

export const TEXT_LEGIBILITY_VERSION = "composition-text-legibility-1";
/** WCAG 2.x AA: 3:1 for large text (headings), 4.5:1 otherwise. */
export const DEFAULT_CONTRAST_TARGETS = {
  heading: 3,
  label: 4.5,
  qualification: 4.5,
  body: 4.5,
} as const;
export const DEFAULT_CONTRAST_PERCENTILE = 0.05;
/**
 * ET6b size split when `display` is declared without values (ET3-D1): WCAG's
 * large-text size, 24 CSS px, at the review width; small text keeps 4.5:1.
 * The `editorial-title` profile sets its own display level.
 */
export const DEFAULT_DISPLAY = {
  minimumSize: 24,
  contrast: 3,
  small: 4.5,
} as const;
/** A typical phone viewport in CSS pixels. */
export const DEFAULT_REVIEW_WIDTH = 360;
/** About the x-height of 12 px CSS type, the usual floor for phone UI text. */
export const DEFAULT_MINIMUM_X_HEIGHT = 6;
/** Fewer glyph-interior pixels than this leave a word unmeasured on a frame. */
export const MINIMUM_WORD_PIXELS = 16;
/**
 * Effects that paint a backdrop around the glyphs (an outline-like glow or a
 * shadow), often added for legibility. Contrast compares each glyph-interior
 * pixel with the frame behind it, so it does not credit them.
 */
export const BACKDROP_EFFECTS = ["light.drop-shadow", "light.glow"] as const;
/** Word codes are R = 255, G/B = 4 + 8k; 32 × 32 words fit. */
const MAX_CODED_WORDS = 1024;
/** ET6b: the outline ring's mask colour; no word code has R below 254. */
export const RING_CODE = "#00ff00";
/**
 * ET6b: the mask colour of text layers stacked above the measured one; their
 * pixels (any coverage) are left out of the treated-edge measure.
 */
export const OCCLUDER_CODE = "#0000ff";
/**
 * `OCCLUDER_CODE` with the alpha of `color` (`#RRGGBB` or `#RRGGBBAA`, keyed
 * colours key by key), so a transparent fill stays transparent in the mask.
 */
function occluderColor<T>(color: T): T {
  const recolour = (value: unknown) =>
    typeof value === "string" && value.length === 9
      ? OCCLUDER_CODE + value.slice(7)
      : OCCLUDER_CODE;
  if (
    color &&
    typeof color === "object" &&
    Array.isArray((color as { keys?: unknown }).keys)
  )
    return {
      ...color,
      keys: (color as unknown as { keys: { value: unknown }[] }).keys.map(
        (key) => ({ ...key, value: recolour(key.value) }),
      ),
    } as T;
  return recolour(color) as T;
}
/** ET6b `treated-edge` report version (the glyph-interior report keeps -1). */
export const TREATED_EDGE_VERSION =
  "composition-text-legibility-treated-edge-1";

const linear = Array.from({ length: 256 }, (_, value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
/** WCAG 2 relative luminance of an 8-bit sRGB colour (as `contrastRatio`). */
export function relativeLuminance(r: number, g: number, b: number) {
  return linear[r]! * 0.2126 + linear[g]! * 0.7152 + linear[b]! * 0.0722;
}
export function wcagContrast(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * x-height per em of each pinned font, from its OS/2 table. Fonts the SFNT
 * reader cannot parse (WOFF and WOFF2, which compositions may pin, or a
 * damaged file) keep their reason instead of failing the lint, so their
 * layers are reported as unmeasured.
 */
export function textLegibilityFontEvidence(
  fonts: readonly { id: string; bytes: ArrayBuffer }[],
): Required<
  Pick<TextLegibilityEvidence, "fontXHeights" | "fontXHeightErrors">
> {
  const fontXHeights: Record<string, number> = {};
  const fontXHeightErrors: Record<string, string> = {};
  for (const { id, bytes } of fonts) {
    try {
      const metrics = readFontMetrics(bytes);
      fontXHeights[id] = metrics.xHeight / metrics.unitsPerEm;
    } catch (error) {
      fontXHeightErrors[id] =
        error instanceof Error ? error.message : String(error);
    }
  }
  return { fontXHeights, fontXHeightErrors };
}

/** Maximal runs of non-whitespace characters, in grapheme indices (text spans index graphemes). */
export function legibilityWords(text: string, locale = "en") {
  const graphemes = [
    ...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
  ];
  const words: { index: number; word: string; start: number; end: number }[] =
    [];
  graphemes.forEach((grapheme, at) => {
    const space = /^\s+$/u.test(grapheme.segment);
    const current = words.at(-1);
    if (space) return;
    if (current && current.end === at) {
      current.end = at + 1;
      current.word += grapheme.segment;
    } else
      words.push({
        index: words.length,
        word: grapheme.segment,
        start: at,
        end: at + 1,
      });
  });
  return words;
}

const hex = (value: number) => value.toString(16).padStart(2, "0");
export const wordCode = (index: number) =>
  `#ff${hex(4 + 8 * (index % 32))}${hex(4 + 8 * Math.floor(index / 32))}`;
/** Word index of an opaque glyph-interior mask pixel, or -1. */
export function decodeWordCode(r: number, g: number, b: number) {
  // Full coverage only: an edge pixel at 98% coverage over black still reads
  // R 250, and its rendered colour then carries 2% of the background.
  if (r < 254) return -1;
  const low = Math.round((g - 4) / 8),
    high = Math.round((b - 4) / 8);
  if (
    low < 0 ||
    low > 31 ||
    high < 0 ||
    high > 31 ||
    Math.abs(g - (4 + 8 * low)) > 2 ||
    Math.abs(b - (4 + 8 * high)) > 2
  )
    return -1;
  return high * 32 + low;
}

const withTransformOpacity = (
  layer: CompositionLayer,
  opacity: number,
): CompositionLayer => ({
  ...layer,
  transform: { ...layer.transform, opacity },
});

const OPACITY_PROPERTIES = new Set(["transform.opacity", "opacity"]);
/** Whether a property path (or layer + suffix) animates the opacity of one of `ids`. */
function drivesOpacity(
  ids: ReadonlySet<string>,
  path: string | undefined,
): boolean {
  if (!path) return false;
  const parsed = parsePropertyPath(path);
  return (
    !("code" in parsed) &&
    !parsed.scope.length &&
    ids.has(parsed.layer) &&
    OPACITY_PROPERTIES.has(parsed.segments.map((s) => s.name).join("."))
  );
}
/**
 * Drop expressions, drivers, periodic motion and behaviours that animate the
 * opacity of `ids`, so the opacity the mask sets on those layers holds.
 */
function withoutOpacityMotion(
  composition: Composition,
  ids: ReadonlySet<string>,
) {
  if (composition.expressions)
    composition.expressions = Object.fromEntries(
      Object.entries(composition.expressions).filter(
        ([path]) => !drivesOpacity(ids, path),
      ),
    );
  if (composition.drivers)
    composition.drivers = composition.drivers.filter(
      (driver) => !drivesOpacity(ids, driver.target),
    );
  if (composition.periodic)
    composition.periodic = composition.periodic.filter(
      (motion) =>
        !drivesOpacity(
          ids,
          motion.target ??
            (motion.node && motion.property
              ? `${motion.node}.${motion.property}`
              : undefined),
        ),
    );
  if (composition.behaviours)
    composition.behaviours = composition.behaviours.flatMap(
      (behaviour): NonNullable<Composition["behaviours"]> => {
        if (behaviour.type !== "follow-through")
          return "target" in behaviour && drivesOpacity(ids, behaviour.target)
            ? []
            : [behaviour];
        const leader = parsePropertyPath(behaviour.leader);
        const suffix =
          behaviour.property ??
          ("code" in leader
            ? undefined
            : leader.segments.map((s) => s.name).join("."));
        const followers = behaviour.followers.filter(
          (follower) => !drivesOpacity(ids, `${follower}.${suffix}`),
        );
        return followers.length ? [{ ...behaviour, followers }] : [];
      },
    );
}

/**
 * The glyph mask for one root text layer: every other layer keeps its geometry
 * (attach constraints and parents still resolve) but paints nothing (opacity
 * 0), the background is black, and the layer's glyphs are drawn opaque with
 * one colour per word. The layer and its group ancestors are drawn at opacity 1
 * with a normal blend, and opacity motion on every root layer except the track
 * matte is dropped, so a title held below full opacity is still measured.
 * Effects and decorations are dropped, so only fully covered glyph interiors
 * keep an exact word code; text-animator opacity, blur, masks and track mattes
 * stay, as they decide which glyphs are visible. Draw it with the `ink-only`
 * text probe so containers are skipped.
 */
export function textLegibilityMask(
  comp: Composition,
  layerId: string,
  options: {
    /**
     * ET6b `treated-edge`: draw text-animator strokes (the outline ring) in
     * `RING_CODE` instead of the word codes, so the ring is told apart from
     * the fill.
     */
    ring?: boolean;
  } = {},
): {
  composition: Composition;
  evidence: Pick<
    TextContrastLayerEvidence,
    "attribution" | "attributionReason" | "words"
  >;
} {
  const target = comp.layers.find(
    (layer): layer is TextLayer =>
      layer.id === layerId && layer.type === "text",
  );
  if (!target) throw new Error(`text-legibility: no root text ${layerId}`);
  const byId = new Map(comp.layers.map((layer) => [layer.id, layer]));
  const ancestors = new Set<string>();
  for (
    let parent = target.parent;
    parent && !ancestors.has(parent);
    parent = byId.get(parent)?.parent
  )
    ancestors.add(parent);
  const matte = target.trackMatte?.layer;
  const locale = target.locale ?? target.textBox?.locale ?? "en";
  const words = legibilityWords(target.text, locale);
  const referencedSpans = new Set(
    (comp.textAnimators ?? [])
      .filter((animator) => animator.node === layerId && animator.span)
      .map((animator) => animator.span!),
  );
  const fallback =
    target.states || target.transition || target.transitions?.length
      ? "the layer shows more than one text"
      : target.corrections?.length
        ? "corrections replace part of the text"
        : target.spans?.some((span) => span.id && referencedSpans.has(span.id))
          ? "text animators select spans by id"
          : words.length > MAX_CODED_WORDS
            ? `more than ${MAX_CODED_WORDS} words`
            : words.length === 0
              ? "the text has no visible words"
              : undefined;
  const attribution = fallback ? ("layer" as const) : ("word" as const);
  let spans: TextLayer["spans"];
  if (!fallback) {
    // Split at word and original span edges; each piece keeps its span style
    // (which decides font and size) and takes its word's code colour.
    const edges = new Set<number>();
    for (const word of words) edges.add(word.start).add(word.end);
    for (const span of target.spans ?? []) edges.add(span.start).add(span.end);
    const sorted = [...edges].sort((a, b) => a - b);
    spans = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const start = sorted[i]!,
        end = sorted[i + 1]!;
      const word = words.find((w) => start >= w.start && end <= w.end);
      if (!word) continue;
      const style = target.spans?.find(
        (span) => start >= span.start && end <= span.end,
      )?.style;
      spans.push({
        start,
        end,
        color: wordCode(word.index),
        ...(style ? { style } : {}),
      });
    }
  } else if (target.spans?.length)
    spans = target.spans.map((span) => {
      const plain = { ...span };
      delete plain.color;
      return plain;
    });
  // Mutate a clone only; the source composition stays untouched.
  const mask = structuredClone(comp);
  mask.background = "#000000";
  // ET6b treated-edge: root text layers stacked above this one (earlier in
  // the list) paint over it; they are drawn as occluders so the measure
  // leaves out the parts of this layer they cover.
  const targetIndex = comp.layers.indexOf(target);
  const occluders = new Set(
    options.ring
      ? comp.layers
          .slice(0, targetIndex)
          .filter(
            (layer) =>
              layer.type === "text" &&
              !layer.parent &&
              layer.enabled !== false &&
              !layer.guide &&
              layer.id !== matte,
          )
          .map((layer) => layer.id)
      : [],
  );
  mask.layers = mask.layers.map((layer): CompositionLayer => {
    delete layer.solo;
    delete layer.coverage;
    if (occluders.has(layer.id)) {
      const text = layer as TextLayer;
      delete text.effects;
      delete text.blendMode;
      delete text.rasterize;
      delete text.corrections;
      // The occluder colour keeps each fill's alpha: a hollow (outline-only)
      // layer above covers only where its outline is drawn.
      text.color = occluderColor(text.color);
      if (text.spans)
        text.spans = text.spans.map((span) => {
          const plain = { ...span };
          if (plain.color === undefined) delete plain.color;
          else plain.color = occluderColor(plain.color);
          return plain;
        });
      if (text.decorations)
        text.decorations = text.decorations.map((mark) => ({
          ...mark,
          color: occluderColor(mark.color),
        }));
      return text;
    }
    if (layer.id === layerId) {
      const text = layer as TextLayer;
      delete text.decorations;
      delete text.effects;
      delete text.blendMode;
      delete text.rasterize;
      delete text.spans;
      text.color = wordCode(0);
      if (spans?.length) text.spans = spans;
      return withTransformOpacity(text, 1);
    }
    if (layer.id === matte) return layer;
    if (ancestors.has(layer.id) && layer.type === "group") {
      delete layer.blendMode;
      return withTransformOpacity(layer, 1);
    }
    return withTransformOpacity(layer, 0);
  });
  withoutOpacityMotion(
    mask,
    new Set(
      mask.layers
        .filter((layer) => layer.id !== matte && !occluders.has(layer.id))
        .map((layer) => layer.id),
    ),
  );
  withoutAnimatorColor(mask, layerId, options.ring ? RING_CODE : undefined);
  for (const id of occluders) withoutAnimatorColor(mask, id, OCCLUDER_CODE);
  return {
    composition: mask,
    evidence: {
      attribution,
      ...(fallback ? { attributionReason: fallback } : {}),
      words: fallback
        ? [{ index: 0, word: target.text }]
        : words.map(({ index, word }) => ({ index, word })),
    },
  };
}

/**
 * Drop colour from a text animator's properties, so the layer colour decides.
 * With `ring`, an animator that strokes keeps a stroke, in that colour.
 */
function withoutAnimatorColor(
  composition: Composition,
  layerId: string,
  ring?: string,
) {
  if (composition.textAnimators)
    composition.textAnimators = composition.textAnimators.map((animator) => {
      if (animator.node !== layerId) return animator;
      const strokes =
        ring !== undefined &&
        [animator.from, animator.to ?? {}].some(
          (properties) =>
            properties.stroke !== undefined ||
            properties.strokeWidth !== undefined,
        );
      const strip = <T extends Record<string, unknown>>(properties: T) => {
        const rest: Record<string, unknown> = { ...properties };
        delete rest.color;
        delete rest.fill;
        delete rest.stroke;
        if (strokes) rest.stroke = ring;
        return rest as T;
      };
      return {
        ...animator,
        from: strip(animator.from),
        ...(animator.to ? { to: strip(animator.to) } : {}),
      };
    });
}

/**
 * The frame without one root text layer's glyphs: the same composition with
 * that layer's glyph colours fully transparent, so its container and
 * highlight decorations (drawn behind the type) stay in the background while
 * its glyphs, strokes and other decorations leave no paint.
 */
export function textLegibilityBackground(
  comp: Composition,
  layerId: string,
): Composition {
  const background = structuredClone(comp);
  const clear = "#00000000";
  background.layers = background.layers.map((layer): CompositionLayer => {
    if (layer.id !== layerId || layer.type !== "text") return layer;
    const text = { ...layer };
    delete text.rasterize;
    delete text.decorations;
    const behind = layer.decorations?.filter(
      (mark) => mark.kind === "highlight",
    );
    return {
      ...text,
      color: clear,
      // Span colours accept only #RRGGBB, so a span drops its colour and
      // inherits the cleared layer colour (ET7a: spans used to fail lint).
      ...(text.spans
        ? {
            spans: text.spans.map((span) => {
              const rest = { ...span };
              delete rest.color;
              return rest;
            }),
          }
        : {}),
      ...(text.corrections
        ? {
            corrections: text.corrections.map((correction) => ({
              ...correction,
              color: clear,
            })),
          }
        : {}),
      ...(behind?.length ? { decorations: behind } : {}),
    };
  });
  withoutAnimatorColor(background, layerId);
  return background;
}

/**
 * Per-word contrast on one frame: `front` is the frame as rendered, `back`
 * the frame without the layer's glyphs, `mask` the word-coded glyph mask.
 * Each word's value is the `percentile` (nearest rank, rounded down) of its
 * per-pixel WCAG contrasts, as the story measure takes the 5th percentile.
 */
export function measureTextContrastPixels(
  front: Uint8ClampedArray | Uint8Array,
  back: Uint8ClampedArray | Uint8Array,
  mask: Uint8ClampedArray | Uint8Array,
  wordCount: number,
  percentile: number,
  layerAttribution = false,
): ([number, number] | null)[] {
  const counts = new Array<number>(wordCount).fill(0);
  const word = new Int32Array(mask.length / 4);
  for (let at = 0, pixel = 0; at < mask.length; at += 4, pixel++) {
    let index = decodeWordCode(mask[at]!, mask[at + 1]!, mask[at + 2]!);
    if (layerAttribution && index >= 0) index = 0;
    word[pixel] = index < wordCount ? index : -1;
    if (word[pixel]! >= 0) counts[word[pixel]!]!++;
  }
  const ratios = counts.map((count) => new Float64Array(count));
  const filled = new Array<number>(wordCount).fill(0);
  for (let pixel = 0; pixel < word.length; pixel++) {
    const index = word[pixel]!;
    if (index < 0) continue;
    const at = pixel * 4;
    ratios[index]![filled[index]!++] = wcagContrast(
      relativeLuminance(front[at]!, front[at + 1]!, front[at + 2]!),
      relativeLuminance(back[at]!, back[at + 1]!, back[at + 2]!),
    );
  }
  return ratios.map((values) => {
    if (values.length < MINIMUM_WORD_PIXELS) return null;
    values.sort();
    return [values[Math.floor(values.length * percentile)]!, values.length];
  });
}

/**
 * ET6b `treated-edge` window half-size: one review pixel beyond the
 * anti-aliased edge pixel, so a ring narrower than a phone pixel blends with
 * the footage beside it, as it does on the phone.
 */
export function treatedEdgeRadius(width: number, reviewWidth: number) {
  return Math.max(1, Math.round(width / reviewWidth)) + 1;
}

/** Mask classes besides word codes: anti-aliased fill edge, ring, outside, and the ring's own anti-aliased outer edge. */
const FILL_EDGE = -1,
  RING = -2,
  OUTSIDE = -3,
  RING_EDGE = -4,
  OCCLUDED = -5;
/**
 * ET6b `treated-edge` contrast on one frame: what a reader sees at the edges
 * of the letters, with outlines, halos and shadows as they are rendered.
 *
 * `mask` is the glyph mask drawn with `ring: true`: fill pixels carry their
 * word code, the outline ring `RING_CODE`, the rest is black. At each fill
 * pixel on the edge of a letter, the fill edge compares the mean (linear)
 * luminance of the rendered fill in a `radius` window with that of every
 * rendered pixel there that is neither fill nor anti-aliased edge: the ring,
 * halo, shadow or footage just outside the letter. At each ring pixel on the
 * outside of the outline, the outer edge compares the outlined letter (fill
 * and ring) with the rendered pixels outside it, which credits outlined
 * and hollow letters. Pixels of text layers stacked above (`OCCLUDER_CODE`)
 * and edges against them are left out. Each is the `percentile` of its edge pixels; a word's
 * value is the better of the two. Untreated text has no ring, so both are
 * its fill against the footage beside it.
 */
export function measureTreatedTextContrastPixels(
  front: Uint8ClampedArray | Uint8Array,
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  wordCount: number,
  percentile: number,
  radius: number,
  layerAttribution = false,
): ([number, number, number, number | null] | null)[] {
  const pixels = width * height;
  const code = new Int32Array(pixels);
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let pixel = 0, at = 0; pixel < pixels; pixel++, at += 4) {
    const r = mask[at]!,
      g = mask[at + 1]!,
      b = mask[at + 2]!;
    let value: number;
    if (r <= 1 && g <= 1 && b <= 1) value = OUTSIDE;
    else if (r <= 1 && g <= 1) value = OCCLUDED;
    else if (r <= 1 && g >= 254 && b <= 1) value = RING;
    // Ring over black: no fill colour mixed in.
    else if (r <= 1 && b <= 1) value = RING_EDGE;
    else {
      const word = decodeWordCode(r, g, b);
      value =
        word < 0 || word >= wordCount ? FILL_EDGE : layerAttribution ? 0 : word;
    }
    code[pixel] = value;
    if (value !== OUTSIDE && value !== OCCLUDED) {
      const x = pixel % width,
        y = (pixel - x) / width;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const empty = new Array<null>(wordCount).fill(null);
  if (right < 0) return empty;
  left = Math.max(0, left - radius - 1);
  top = Math.max(0, top - radius - 1);
  right = Math.min(width - 1, right + radius + 1);
  bottom = Math.min(height - 1, bottom + radius + 1);
  const w = right - left + 1,
    h = bottom - top + 1,
    stride = w + 1;
  // Summed-area tables over the box: counts and luminance sums of the fill,
  // of what surrounds the fill (ring and outside), of the outlined letter
  // (fill and ring) and of the outside.
  const tables = Array.from(
    { length: 8 },
    () => new Float64Array(stride * (h + 1)),
  );
  const [fillN, fillL, aroundN, aroundL, letterN, letterL, outN, outL] =
    tables as [
      Float64Array,
      Float64Array,
      Float64Array,
      Float64Array,
      Float64Array,
      Float64Array,
      Float64Array,
      Float64Array,
    ];
  for (let y = 0; y < h; y++) {
    const rowSums = new Float64Array(8);
    for (let x = 0; x < w; x++) {
      const pixel = (top + y) * width + left + x,
        at = pixel * 4,
        value = code[pixel]!,
        lum = relativeLuminance(front[at]!, front[at + 1]!, front[at + 2]!);
      if (value >= 0) {
        rowSums[0]!++;
        rowSums[1]! += lum;
        rowSums[4]!++;
        rowSums[5]! += lum;
      } else if (value === RING) {
        rowSums[2]!++;
        rowSums[3]! += lum;
        rowSums[4]!++;
        rowSums[5]! += lum;
      } else if (value === OUTSIDE) {
        rowSums[2]!++;
        rowSums[3]! += lum;
        rowSums[6]!++;
        rowSums[7]! += lum;
      }
      const cell = (y + 1) * stride + x + 1,
        above = y * stride + x + 1;
      for (let t = 0; t < 8; t++)
        tables[t]![cell] = tables[t]![above]! + rowSums[t]!;
    }
  }
  const box = (table: Float64Array, x: number, y: number) => {
    const x0 = Math.max(0, x - radius - left),
      y0 = Math.max(0, y - radius - top),
      x1 = Math.min(w, x + radius - left + 1),
      y1 = Math.min(h, y + radius - top + 1);
    return (
      table[y1 * stride + x1]! -
      table[y0 * stride + x1]! -
      table[y1 * stride + x0]! +
      table[y0 * stride + x0]!
    );
  };
  // Ring pixels belong to the word whose fill they surround: spread word
  // labels from the fill through the ring and the edge pixels between them.
  const label = new Int32Array(pixels).fill(-1);
  const queue: number[] = [];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const pixel = y * width + x;
      if (code[pixel]! >= 0) {
        label[pixel] = code[pixel]!;
        queue.push(pixel);
      }
    }
  for (let head = 0; head < queue.length; head++) {
    const pixel = queue[head]!,
      x = pixel % width;
    for (const next of [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      pixel - width,
      pixel + width,
    ]) {
      if (next < 0 || next >= pixels || label[next]! >= 0) continue;
      const value = code[next]!;
      if (value !== RING && value !== FILL_EDGE) continue;
      label[next] = label[pixel]!;
      queue.push(next);
    }
  }
  const fill: number[][] = Array.from({ length: wordCount }, () => []);
  const outer: number[][] = Array.from({ length: wordCount }, () => []);
  const neighbours = (pixel: number, x: number, y: number) => [
    x > 0 ? code[pixel - 1]! : OUTSIDE,
    x < width - 1 ? code[pixel + 1]! : OUTSIDE,
    y > 0 ? code[pixel - width]! : OUTSIDE,
    y < height - 1 ? code[pixel + width]! : OUTSIDE,
  ];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const pixel = y * width + x,
        value = code[pixel]!;
      if (value >= 0) {
        const next = neighbours(pixel, x, y);
        // An edge against a layer stacked above is that layer's edge.
        if (next.every((n) => n >= 0) || next.includes(OCCLUDED)) continue;
        const around = box(aroundN, x, y);
        if (!around) continue;
        fill[value]!.push(
          wcagContrast(
            box(fillL, x, y) / box(fillN, x, y),
            box(aroundL, x, y) / around,
          ),
        );
      } else if (value === RING && label[pixel]! >= 0) {
        const next = neighbours(pixel, x, y);
        if (
          !next.some((n) => n === OUTSIDE || n === RING_EDGE) ||
          next.includes(OCCLUDED)
        )
          continue;
        const outside = box(outN, x, y);
        if (!outside) continue;
        outer[label[pixel]!]!.push(
          wcagContrast(
            box(letterL, x, y) / box(letterN, x, y),
            box(outL, x, y) / outside,
          ),
        );
      }
    }
  const pick = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * percentile)]!;
  };
  return fill.map((edges, word) => {
    if (edges.length < MINIMUM_WORD_PIXELS) return null;
    const inner = pick(edges),
      ring =
        outer[word]!.length >= MINIMUM_WORD_PIXELS ? pick(outer[word]!) : null;
    return [Math.max(inner, ring ?? 0), edges.length, inner, ring];
  });
}

/** Root text layers ET3 measures, and the precomp text it does not. */
export function textLegibilityLayers(comp: Composition): {
  root: TextLayer[];
  nested: string[];
} {
  return {
    root: comp.layers.filter(
      (layer): layer is TextLayer =>
        layer.type === "text" && layer.enabled !== false && !layer.guide,
    ),
    nested: (comp.precomps ?? []).flatMap((precomp) =>
      precomp.layers
        .filter((layer) => layer.type === "text")
        .map((layer) => `${precomp.id}/${layer.id}`),
    ),
  };
}

/**
 * The reading window of a root text layer: frames where it is on screen at
 * reading opacity and reveal (the reading-time rule's thresholds), shows one
 * copy and has finished any state mix. Motion does not end the window: drift
 * during a hold still has to stay legible.
 */
export function textLegibilityFrames(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: Pick<
    ResolvedCompositionQualityPolicy,
    | "readingOpacity"
    | "readingReveal"
    | "textLegibility"
    | "textFramingEvidence"
  >,
) {
  const windows = new Map<string, number[]>();
  // ET6b: treated-edge reads outline-only (hollow) text by its outline, on
  // the frames it is drawn.
  const outlined = readsOutlinedText(policy)
    ? outlinedText(comp, policy.textFramingEvidence?.glyphMotion)
    : undefined;
  for (const layer of textLegibilityLayers(comp).root) {
    const reading: number[] = [];
    frames.forEach((frame, at) => {
      const raw = frame.layers.get(layer.id);
      const shown = raw ? outlinedReading(raw, frame, outlined) : undefined;
      const sample = raw && { ...raw, ...shown };
      if (
        sample?.onScreen &&
        sample.text !== undefined &&
        sample.opacity >= policy.readingOpacity &&
        sample.reveal >= policy.readingReveal &&
        (sample.state.stateMix ?? 1) >= 0.95
      )
        reading.push(at);
    });
    windows.set(layer.id, reading);
  }
  return windows;
}

const round = (value: number, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

function ranges(frames: number[], cuts: ReadonlySet<number>) {
  const out: [number, number][] = [];
  for (const frame of frames) {
    const last = out.at(-1);
    if (last && last[1] === frame - 1 && !cuts.has(frame)) last[1] = frame;
    else out.push([frame, frame]);
  }
  return out;
}

/** The resolved styles of a root text layer: its own and its spans'. */
function textLayerStyles(comp: Composition, layer: TextLayer) {
  const node = textNode(comp, layer);
  const fontAxes = declaredFontAxes(comp.assets);
  return {
    node,
    styles: [
      resolvedTextStyle(node, comp.textStyles ?? {}),
      ...(layer.spans ?? [])
        .filter((span) => span.style)
        .map((span) =>
          resolvedTextStyle(node, comp.textStyles ?? {}, span.style, fontAxes),
        ),
    ],
  };
}
/**
 * ET6b size split: the smallest font size of a root text layer (its spans
 * included), at its layer scale, in pixels at the review width, over its
 * reading frames.
 */
export function textDisplaySize(
  comp: Composition,
  layer: TextLayer,
  frames: readonly CompositionQualityFrame[],
  reading: readonly number[],
  reviewWidth: number,
) {
  const { styles, node } = textLayerStyles(comp, layer);
  const smallest = Math.min(
    ...styles.map((style) => style.size ?? node.fontSize),
  );
  let size = Infinity;
  for (const frame of reading)
    size = Math.min(
      size,
      (smallest *
        Math.abs(frames[frame]!.layers.get(layer.id)!.scale[1]) *
        reviewWidth) /
        comp.width,
    );
  return size === Infinity ? (smallest * reviewWidth) / comp.width : size;
}
/**
 * The contrast percentile a root text layer is measured at: ET6b display
 * text may declare its own (`display.percentile`), all else the policy's.
 */
export function textContrastPercentile(
  comp: Composition,
  layer: TextLayer,
  frames: readonly CompositionQualityFrame[],
  reading: readonly number[],
  settings: NonNullable<ResolvedCompositionQualityPolicy["textLegibility"]>,
) {
  const base = settings.contrastPercentile ?? DEFAULT_CONTRAST_PERCENTILE;
  const display = settings.display;
  if (display?.percentile === undefined) return base;
  const size = textDisplaySize(
    comp,
    layer,
    frames,
    reading,
    settings.reviewWidth ?? DEFAULT_REVIEW_WIDTH,
  );
  return size >= (display.minimumSize ?? DEFAULT_DISPLAY.minimumSize)
    ? display.percentile
    : base;
}

/**
 * Diagnostics and the report section for the ET3 rules. Runs only when the
 * policy declares `textLegibility`; contrast needs rendered-pixel evidence.
 */
export function analyzeTextLegibility(
  comp: Composition,
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
) {
  const settings = policy.textLegibility!;
  const evidence = policy.textLegibilityEvidence ?? {};
  const targets = {
    heading: settings.contrast?.heading ?? DEFAULT_CONTRAST_TARGETS.heading,
    label: settings.contrast?.label ?? DEFAULT_CONTRAST_TARGETS.label,
    qualification:
      settings.contrast?.qualification ??
      DEFAULT_CONTRAST_TARGETS.qualification,
    body: settings.contrast?.body ?? DEFAULT_CONTRAST_TARGETS.body,
  };
  const percentile = settings.contrastPercentile ?? DEFAULT_CONTRAST_PERCENTILE;
  const method = settings.contrastMethod ?? "glyph-interior";
  const display = settings.display
    ? {
        minimumSize:
          settings.display.minimumSize ?? DEFAULT_DISPLAY.minimumSize,
        contrast: settings.display.contrast ?? DEFAULT_DISPLAY.contrast,
        small: settings.display.small ?? DEFAULT_DISPLAY.small,
        ...(settings.display.percentile !== undefined
          ? { percentile: settings.display.percentile }
          : {}),
      }
    : undefined;
  const reviewWidth = settings.reviewWidth ?? DEFAULT_REVIEW_WIDTH;
  const minimumXHeight = settings.minimumXHeight ?? DEFAULT_MINIMUM_X_HEIGHT;
  const safeZones = settings.safeZones ?? [];
  const windows = textLegibilityFrames(comp, frames, policy);
  const diagnostics: MotionLintDiagnostic[] = [];
  const limitations: string[] = [
    "Contrast is a legibility signal (WCAG 2 luminance ratio at glyph-interior pixels against the same frame rendered without the layer's glyphs); it is not visual acceptance and does not model blur, halation, motion, colour-vision deficiency or polarity.",
  ];
  const { root, nested } = textLegibilityLayers(comp);
  if (nested.length)
    limitations.push(
      `Text inside precomps is not measured: ${nested.join(", ")}.`,
    );
  if (!evidence.contrast)
    limitations.push(
      "Text contrast needs rendered pixels; run pixel lint (--pixels true).",
    );
  const shotOf = (frame: number) =>
    policy.shots.find((shot) => frame >= shot.start && frame < shot.end)!.id;
  const layers = root.map((layer) => {
    const index = comp.layers.indexOf(layer);
    const path = `layers.${index}`;
    const role = layer.textRole ?? "body";
    const reading = windows.get(layer.id)!;
    const entry: {
      layer: string;
      role: typeof role;
      readingFrames: number;
      attribution?: "word" | "layer";
      attributionReason?: string;
      contrastTarget: number;
      measuredFrames?: number;
      worst?: { contrast: number; frame: number; word: string };
      words?: {
        index: number;
        word: string;
        worst: { contrast: number; frame: number } | null;
      }[];
      xHeight?: {
        reviewPixels: number;
        outputPixels: number;
        frame: number;
        fonts: string[];
      };
      waiver?: { reason: string; codes: TextLegibilityCode[] };
      /** ET6b: smallest font size at the review width over the reading frames. */
      displaySize?: number;
      /** ET6b: the size class that chose the contrast target. */
      sizeClass?: "display" | "small";
      /** ET6b: the display percentile, when it differs from the policy's. */
      contrastPercentile?: number;
      /** ET6b `treated-edge`: the two edges behind the worst value. */
      edges?: { fill: number; outer: number | null };
    } = {
      layer: layer.id,
      role,
      readingFrames: reading.length,
      contrastTarget: targets[role],
    };
    const { styles } = textLayerStyles(comp, layer);
    if (display) {
      const size = textDisplaySize(comp, layer, frames, reading, reviewWidth);
      entry.displaySize = round(size);
      entry.sizeClass = size >= display.minimumSize ? "display" : "small";
      entry.contrastTarget =
        entry.sizeClass === "display" ? display.contrast : display.small;
      if (entry.sizeClass === "display" && display.percentile !== undefined)
        entry.contrastPercentile = display.percentile;
    }
    const push = (
      code: TextLegibilityCode,
      frames: [number, number],
      measured: number,
      message: string,
      extra: Partial<MotionLintDiagnostic> = {},
    ) =>
      diagnostics.push({
        code,
        severity: lintSeverity(code, policy),
        nodes: [layer.id],
        node: layer.id,
        path,
        frames,
        measured,
        message,
        shot: shotOf(frames[0]),
        ...extra,
      });

    // text-contrast
    const contrast = evidence.contrast?.[layer.id];
    if (contrast) {
      entry.attribution = contrast.attribution;
      if (contrast.attributionReason)
        entry.attributionReason = contrast.attributionReason;
      const target = entry.contrastTarget;
      const wordWorst = contrast.words.map(
        () =>
          null as null | {
            contrast: number;
            frame: number;
            edges?: { fill: number; outer: number | null };
          },
      );
      let measuredFrames = 0;
      const below: number[] = [];
      const perFrame = new Map<number, (TextContrastSample | null)[]>();
      for (const sample of contrast.frames) {
        perFrame.set(sample.frame, sample.words);
        let lowest = Infinity;
        sample.words.forEach((value, i) => {
          if (!value) return;
          lowest = Math.min(lowest, value[0]);
          if (!wordWorst[i] || value[0] < wordWorst[i]!.contrast)
            wordWorst[i] = {
              contrast: value[0],
              frame: sample.frame,
              ...(value.length === 4
                ? {
                    edges: {
                      fill: round(value[2]),
                      outer: value[3] === null ? null : round(value[3]),
                    },
                  }
                : {}),
            };
        });
        if (lowest === Infinity) continue;
        measuredFrames++;
        if (lowest < target) below.push(sample.frame);
      }
      entry.measuredFrames = measuredFrames;
      // A frame with no measurable word must not read as a pass.
      if (measuredFrames < reading.length)
        limitations.push(
          `text-contrast of ${layer.id} is unmeasured on ${reading.length - measuredFrames} of ${reading.length} reading frames: no word had ${MINIMUM_WORD_PIXELS} fully covered glyph pixels in the mask (text-animator opacity, blur, a mask or a track matte can cause this).`,
        );
      entry.words = contrast.words.map((word, i) => ({
        ...word,
        worst: wordWorst[i]
          ? {
              contrast: round(wordWorst[i]!.contrast),
              frame: wordWorst[i]!.frame,
            }
          : null,
      }));
      const worstIndex = wordWorst.reduce(
        (best, value, i) =>
          value && (best < 0 || value.contrast < wordWorst[best]!.contrast)
            ? i
            : best,
        -1,
      );
      if (worstIndex >= 0) {
        entry.worst = {
          contrast: round(wordWorst[worstIndex]!.contrast),
          frame: wordWorst[worstIndex]!.frame,
          word: contrast.words[worstIndex]!.word,
        };
        if (wordWorst[worstIndex]!.edges)
          entry.edges = wordWorst[worstIndex]!.edges;
      }
      for (const [start, end] of ranges(below, policy.cuts)) {
        const words = contrast.words.flatMap((word, i) => {
          let worst: { contrast: number; frame: number } | undefined;
          for (let frame = start; frame <= end; frame++) {
            const value = perFrame.get(frame)?.[i];
            if (
              value &&
              value[0] < target &&
              (!worst || value[0] < worst.contrast)
            )
              worst = { contrast: value[0], frame };
          }
          return worst
            ? [
                {
                  word: word.word,
                  index: word.index,
                  contrast: round(worst.contrast),
                  frame: worst.frame,
                },
              ]
            : [];
        });
        const lowest = words.reduce((a, b) =>
          b.contrast < a.contrast ? b : a,
        );
        push(
          "text-contrast",
          [start, end],
          lowest.contrast,
          `${layer.id} ${display ? `${entry.sizeClass} (${entry.displaySize} px at ${reviewWidth} px)` : role} text falls to ${lowest.contrast.toFixed(2)}:1 ${method === "treated-edge" ? "at its letter edges, outline and halo included," : "against the rendered background"} (target ${target}:1) on frames ${start}-${end}; ${contrast.attribution === "word" ? `words below target: ${words.map((w) => `"${w.word}" ${w.contrast.toFixed(2)}:1`).join(", ")}` : `whole layer (${contrast.attributionReason})`}.`,
          { path: `${path}.text`, words },
        );
      }
    }

    const backdrops = [
      ...new Set(
        (layer.effects ?? [])
          .filter(
            (effect) =>
              effect.enabled !== false &&
              (BACKDROP_EFFECTS as readonly string[]).includes(effect.effect),
          )
          .map((effect) => effect.effect),
      ),
    ];
    if (backdrops.length && method === "glyph-interior")
      limitations.push(
        `text-contrast of ${layer.id} does not credit its ${backdrops.join(" and ")} effect: each glyph pixel is compared with the frame behind it, so an outline or shadow added for legibility is not counted and the layer can be reported below target while it reads well.`,
      );

    // x-height-floor
    const measuredStyles = styles.flatMap((style) => {
      const perEm = style.fontAsset
        ? evidence.fontXHeights?.[style.fontAsset]
        : undefined;
      return perEm === undefined || style.size === undefined
        ? []
        : [{ font: style.fontAsset!, xHeight: perEm * style.size }];
    });
    // Pinned fonts whose metrics could not be read are named, not skipped.
    const unreadable = [
      ...new Set(
        styles.flatMap((style) =>
          style.fontAsset &&
          evidence.fontXHeights?.[style.fontAsset] === undefined &&
          evidence.fontXHeightErrors?.[style.fontAsset] !== undefined
            ? [style.fontAsset]
            : [],
        ),
      ),
    ];
    for (const font of unreadable)
      limitations.push(
        `x-height of ${layer.id} is not measured for font "${font}": ${evidence.fontXHeightErrors![font]}.`,
      );
    if (measuredStyles.length && reading.length) {
      const smallest = measuredStyles.reduce((a, b) =>
        b.xHeight < a.xHeight ? b : a,
      );
      let floor: { review: number; output: number; frame: number } | undefined;
      const small: number[] = [];
      const perFrame = new Map<number, { review: number; output: number }>();
      for (const frame of reading) {
        const scale = Math.abs(frames[frame]!.layers.get(layer.id)!.scale[1]);
        const output = smallest.xHeight * scale;
        const review = (output * reviewWidth) / comp.width;
        perFrame.set(frame, { review, output });
        if (!floor || review < floor.review) floor = { review, output, frame };
        if (review < minimumXHeight) small.push(frame);
      }
      entry.xHeight = {
        reviewPixels: round(floor!.review),
        outputPixels: round(floor!.output),
        frame: floor!.frame,
        fonts: [...new Set(measuredStyles.map((style) => style.font))],
      };
      for (const [start, end] of ranges(small, policy.cuts)) {
        // Each range reports its own smallest x-height.
        let least = perFrame.get(start)!;
        for (let frame = start + 1; frame <= end; frame++) {
          const value = perFrame.get(frame);
          if (value && value.review < least.review) least = value;
        }
        push(
          "x-height-floor",
          [start, end],
          round(least.review),
          `${layer.id} x-height is ${least.review.toFixed(1)} px at a ${reviewWidth} px review width (${least.output.toFixed(1)} px at ${comp.width} px output); floor ${minimumXHeight} px.`,
          { path: `${path}.fontSize` },
        );
      }
    } else if (!measuredStyles.length && !unreadable.length)
      limitations.push(
        `x-height of ${layer.id} is not measured: it uses no pinned font.`,
      );

    // platform-safe-zone
    for (const zone of safeZones) {
      const inside: number[] = [];
      const depth = new Map<number, number>();
      for (const frame of reading) {
        const bounds = frames[frame]!.layers.get(layer.id)!.clippedBounds;
        if (!bounds) continue;
        const band =
          zone.edge === "top"
            ? {
                left: 0,
                top: 0,
                right: comp.width,
                bottom: comp.height * zone.fraction,
              }
            : zone.edge === "bottom"
              ? {
                  left: 0,
                  top: comp.height * (1 - zone.fraction),
                  right: comp.width,
                  bottom: comp.height,
                }
              : zone.edge === "left"
                ? {
                    left: 0,
                    top: 0,
                    right: comp.width * zone.fraction,
                    bottom: comp.height,
                  }
                : {
                    left: comp.width * (1 - zone.fraction),
                    top: 0,
                    right: comp.width,
                    bottom: comp.height,
                  };
        const width =
          Math.min(bounds.right, band.right) - Math.max(bounds.left, band.left);
        const height =
          Math.min(bounds.bottom, band.bottom) - Math.max(bounds.top, band.top);
        const area =
          (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
        if (width > 0 && height > 0 && area > 0) {
          inside.push(frame);
          depth.set(frame, (width * height) / area);
        }
      }
      for (const [start, end] of ranges(inside, policy.cuts)) {
        // Each range reports its own deepest overlap.
        let deepest = 0;
        for (let frame = start; frame <= end; frame++)
          deepest = Math.max(deepest, depth.get(frame) ?? 0);
        push(
          "platform-safe-zone",
          [start, end],
          round(deepest),
          `${layer.id} enters the ${zone.edge} UI band "${zone.id}" (${round(zone.fraction * 100, 1)}% of the frame); up to ${round(deepest * 100, 1)}% of its text box is inside.`,
          { path: `${path}.transform` },
        );
      }
    }
    return entry;
  });

  // Waivers keep the measurement and the finding, never the gate.
  const waivers = (settings.waivers ?? []).map((waiver) => {
    const codes = waiver.codes ?? [...TEXT_LEGIBILITY_CODES];
    const applied = new Set<string>();
    for (const diagnostic of diagnostics)
      if (
        diagnostic.node === waiver.layer &&
        codes.includes(diagnostic.code as TextLegibilityCode)
      ) {
        diagnostic.rawSeverity = diagnostic.severity;
        diagnostic.severity = "warning";
        diagnostic.classification = "legibility-waiver";
        diagnostic.waiver = { reason: waiver.reason };
        applied.add(diagnostic.code);
      }
    const entry = layers.find((layer) => layer.layer === waiver.layer);
    if (entry) entry.waiver = { reason: waiver.reason, codes };
    else
      limitations.push(
        `Waiver for ${waiver.layer} names no measured root text layer.`,
      );
    return {
      layer: waiver.layer,
      reason: waiver.reason,
      codes,
      applied: TEXT_LEGIBILITY_CODES.filter((code) => applied.has(code)),
    };
  });
  if (method === "treated-edge")
    limitations.push(
      `Treated-edge contrast compares each letter's fill with what is rendered within ${treatedEdgeRadius(comp.width, reviewWidth)} px of its edge (outline, halo, shadow or footage), and the outlined letter with the footage around it; the better edge counts. It credits outlines, halos and shadows only where they are drawn beside the letter.`,
    );
  return {
    diagnostics,
    report: {
      version:
        method === "treated-edge"
          ? TREATED_EDGE_VERSION
          : TEXT_LEGIBILITY_VERSION,
      method: {
        contrast:
          method === "treated-edge"
            ? ("wcag2-treated-edge-percentile" as const)
            : ("wcag2-glyph-interior-percentile" as const),
        ...(method === "treated-edge"
          ? { edgeRadius: treatedEdgeRadius(comp.width, reviewWidth) }
          : {}),
        contrastPercentile: percentile,
        minimumWordPixels: MINIMUM_WORD_PIXELS,
        contrastMeasured: !!evidence.contrast,
        xHeight: "font-os2-sxheight-times-size-and-layer-scale" as const,
      },
      policy: {
        contrast: targets,
        ...(display ? { display } : {}),
        reviewWidth,
        minimumXHeight,
        safeZones,
      },
      layers,
      waivers,
      visualAcceptance: "requires-human-review" as const,
      limitations,
    },
  };
}
export type TextLegibilityReport = ReturnType<
  typeof analyzeTextLegibility
>["report"];
