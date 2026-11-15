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
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { resolvedTextStyle } from "../typography-style.ts";
import { textNode, type TextLayer } from "./render/text-scenes.ts";
import type { CompositionQualityFrame } from "./quality-samples.ts";
import {
  lintSeverity,
  TEXT_LEGIBILITY_CODES,
  type MotionLintDiagnostic,
  type ResolvedCompositionQualityPolicy,
  type TextContrastLayerEvidence,
  type TextLegibilityCode,
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
/** A typical phone viewport in CSS pixels. */
export const DEFAULT_REVIEW_WIDTH = 360;
/** About the x-height of 12 px CSS type, the usual floor for phone UI text. */
export const DEFAULT_MINIMUM_X_HEIGHT = 6;
/** Fewer glyph-interior pixels than this leave a word unmeasured on a frame. */
export const MINIMUM_WORD_PIXELS = 16;
/** Word codes are R = 255, G/B = 4 + 8k; 32 × 32 words fit. */
const MAX_CODED_WORDS = 1024;

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

const transformOpacityZero = (layer: CompositionLayer): CompositionLayer => ({
  ...layer,
  transform: { ...layer.transform, opacity: 0 },
});

/**
 * The glyph mask for one root text layer: every other layer keeps its geometry
 * (attach constraints and parents still resolve) but paints nothing (opacity
 * 0; group ancestors and the layer's track matte stay as they are, since their
 * opacity reaches it), the background is black, and the layer's glyphs are
 * drawn opaque with one colour per word. Effects,
 * decorations and blend modes are dropped, so only fully covered glyph
 * interiors keep an exact word code; text-animator opacity, blur, masks and
 * track mattes stay, as they decide which glyphs are visible. Draw it with the
 * `ink-only` text probe so containers are skipped.
 */
export function textLegibilityMask(
  comp: Composition,
  layerId: string,
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
  mask.layers = mask.layers.map((layer): CompositionLayer => {
    delete layer.solo;
    delete layer.coverage;
    if (layer.id === layerId) {
      const text = layer as TextLayer;
      delete text.decorations;
      delete text.effects;
      delete text.blendMode;
      delete text.rasterize;
      delete text.spans;
      text.color = wordCode(0);
      if (spans?.length) text.spans = spans;
      return text;
    }
    if (
      layer.id === matte ||
      (ancestors.has(layer.id) && layer.type === "group")
    )
      return layer;
    return transformOpacityZero(layer);
  });
  withoutAnimatorColor(mask, layerId);
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

/** Drop colour from a text animator's properties, so the layer colour decides. */
function withoutAnimatorColor(composition: Composition, layerId: string) {
  if (composition.textAnimators)
    composition.textAnimators = composition.textAnimators.map((animator) => {
      if (animator.node !== layerId) return animator;
      const strip = <T extends Record<string, unknown>>(properties: T) => {
        const rest = { ...properties };
        delete rest.color;
        delete rest.fill;
        delete rest.stroke;
        return rest;
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
      ...(text.spans
        ? { spans: text.spans.map((span) => ({ ...span, color: clear })) }
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

/** Root text layers ET3 measures, and the precomp text it does not. */
export function textLegibilityLayers(comp: Composition) {
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
    "readingOpacity" | "readingReveal"
  >,
) {
  const windows = new Map<string, number[]>();
  for (const layer of textLegibilityLayers(comp).root) {
    const reading: number[] = [];
    frames.forEach((frame, at) => {
      const sample = frame.layers.get(layer.id);
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
    } = {
      layer: layer.id,
      role,
      readingFrames: reading.length,
      contrastTarget: targets[role],
    };
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
      const target = targets[role];
      const wordWorst = contrast.words.map(
        () =>
          null as null | {
            contrast: number;
            frame: number;
          },
      );
      let measuredFrames = 0;
      const below: number[] = [];
      const perFrame = new Map<number, ([number, number] | null)[]>();
      for (const sample of contrast.frames) {
        perFrame.set(sample.frame, sample.words);
        let lowest = Infinity;
        sample.words.forEach((value, i) => {
          if (!value) return;
          lowest = Math.min(lowest, value[0]);
          if (!wordWorst[i] || value[0] < wordWorst[i]!.contrast)
            wordWorst[i] = { contrast: value[0], frame: sample.frame };
        });
        if (lowest === Infinity) continue;
        measuredFrames++;
        if (lowest < target) below.push(sample.frame);
      }
      entry.measuredFrames = measuredFrames;
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
      if (worstIndex >= 0)
        entry.worst = {
          contrast: round(wordWorst[worstIndex]!.contrast),
          frame: wordWorst[worstIndex]!.frame,
          word: contrast.words[worstIndex]!.word,
        };
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
          `${layer.id} ${role} text falls to ${lowest.contrast.toFixed(2)}:1 against the rendered background (target ${target}:1) on frames ${start}-${end}; ${contrast.attribution === "word" ? `words below target: ${words.map((w) => `"${w.word}" ${w.contrast.toFixed(2)}:1`).join(", ")}` : `whole layer (${contrast.attributionReason})`}.`,
          { path: `${path}.text`, words },
        );
      }
    }

    // x-height-floor
    const node = textNode(comp, layer);
    const styles = [
      resolvedTextStyle(node, comp.textStyles ?? {}),
      ...(layer.spans ?? [])
        .filter((span) => span.style)
        .map((span) =>
          resolvedTextStyle(node, comp.textStyles ?? {}, span.style),
        ),
    ];
    const measuredStyles = styles.flatMap((style) => {
      const perEm = style.fontAsset
        ? evidence.fontXHeights?.[style.fontAsset]
        : undefined;
      return perEm === undefined || style.size === undefined
        ? []
        : [{ font: style.fontAsset!, xHeight: perEm * style.size }];
    });
    if (measuredStyles.length && reading.length) {
      const smallest = measuredStyles.reduce((a, b) =>
        b.xHeight < a.xHeight ? b : a,
      );
      let floor: { review: number; output: number; frame: number } | undefined;
      const small: number[] = [];
      for (const frame of reading) {
        const scale = Math.abs(frames[frame]!.layers.get(layer.id)!.scale[1]);
        const output = smallest.xHeight * scale;
        const review = (output * reviewWidth) / comp.width;
        if (!floor || review < floor.review) floor = { review, output, frame };
        if (review < minimumXHeight) small.push(frame);
      }
      entry.xHeight = {
        reviewPixels: round(floor!.review),
        outputPixels: round(floor!.output),
        frame: floor!.frame,
        fonts: [...new Set(measuredStyles.map((style) => style.font))],
      };
      for (const [start, end] of ranges(small, policy.cuts))
        push(
          "x-height-floor",
          [start, end],
          round(floor!.review),
          `${layer.id} x-height is ${floor!.review.toFixed(1)} px at a ${reviewWidth} px review width (${floor!.output.toFixed(1)} px at ${comp.width} px output); floor ${minimumXHeight} px.`,
          { path: `${path}.fontSize` },
        );
    } else if (!measuredStyles.length)
      limitations.push(
        `x-height of ${layer.id} is not measured: it uses no pinned font.`,
      );

    // platform-safe-zone
    for (const zone of safeZones) {
      const inside: number[] = [];
      let deepest = 0;
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
          deepest = Math.max(deepest, (width * height) / area);
        }
      }
      for (const [start, end] of ranges(inside, policy.cuts))
        push(
          "platform-safe-zone",
          [start, end],
          round(deepest),
          `${layer.id} enters the ${zone.edge} UI band "${zone.id}" (${round(zone.fraction * 100, 1)}% of the frame); up to ${round(deepest * 100, 1)}% of its text box is inside.`,
          { path: `${path}.transform` },
        );
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
  return {
    diagnostics,
    report: {
      version: TEXT_LEGIBILITY_VERSION,
      method: {
        contrast: "wcag2-glyph-interior-percentile" as const,
        contrastPercentile: percentile,
        minimumWordPixels: MINIMUM_WORD_PIXELS,
        contrastMeasured: !!evidence.contrast,
        xHeight: "font-os2-sxheight-times-size-and-layer-scale" as const,
      },
      policy: {
        contrast: targets,
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
