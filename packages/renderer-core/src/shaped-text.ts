import type { TextStyle } from "../../scene-contract/src/typography.ts";
import {
  applyTextStyle,
  caseText,
  resolvedTextStyle,
  type TextNode,
} from "./typography-style.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { passageError } from "./passage-diagnostics.ts";

export type GlyphCluster = {
  text: string;
  sourceIndex: number;
  spanIndex: number;
  wordIndex: number;
  lineIndex: number;
  x: number;
  advance: number;
  baseline: number;
  ascent: number;
  descent: number;
  runIndex: number;
  ink?: { x: number; y: number; width: number; height: number };
};
export type ShapedRun = {
  text: string;
  x: number;
  baseline: number;
  width: number;
  style: TextStyle;
  color: string;
  clusters: number[];
};
export type ShapedLine = {
  text: string;
  x: number;
  width: number;
  baseline: number;
  ascent: number;
  descent: number;
  clusters: number[];
};
export type ShapedLayout = {
  text: string;
  lines: ShapedLine[];
  clusters: GlyphCluster[];
  runs: ShapedRun[];
  width: number;
  height: number;
  left: number;
  top: number;
  lineHeight: number;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  tracking: number;
  leading: number;
  underlinePosition: number;
  underlineThickness: number;
  overflow: boolean;
};
export type BreakRange = { start: number; end: number };

/** Bounded line-break optimization. Offsets remain in the original UTF-16 string. */
export function textBreaks(
  text: string,
  width: number,
  measure: (text: string, start: number) => number,
  options: {
    locale?: string;
    wrap?: TextNode["wrap"];
    orphanFraction?: number;
  } = {},
): BreakRange[] {
  const output: BreakRange[] = [];
  let paragraphStart = 0;
  for (const paragraph of text.split("\n")) {
    const words = [
      ...new Intl.Segmenter(options.locale ?? "en", {
        granularity: "word",
      }).segment(paragraph),
    ];
    const points = [
      0,
      ...words
        .map((w) => w.index + w.segment.length)
        .filter(
          (p) => p === paragraph.length || !/^\s/u.test(paragraph.slice(p)),
        ),
    ];
    const unique = [...new Set([...points, paragraph.length])].sort(
      (a, b) => a - b,
    );
    const range = (a: number, b: number): BreakRange => {
      const raw = paragraph.slice(a, b),
        trim = raw.trim();
      const start = a + (trim ? raw.indexOf(trim) : 0);
      return {
        start: paragraphStart + start,
        end: paragraphStart + start + trim.length,
      };
    };
    const cache = new Map<string, number>();
    const length = (a: number, b: number) => {
      const key = `${a}:${b}`;
      if (!cache.has(key)) {
        const r = range(a, b);
        cache.set(key, measure(text.slice(r.start, r.end), r.start));
      }
      return cache.get(key)!;
    };
    const greedy: BreakRange[] = [];
    let at = 0;
    while (at < unique.length - 1) {
      let end = at + 1;
      while (
        end + 1 < unique.length &&
        length(unique[at]!, unique[end + 1]!) <= width + 0.01
      )
        end++;
      greedy.push(range(unique[at]!, unique[end]!));
      at = end;
    }
    if (!greedy.length)
      greedy.push({ start: paragraphStart, end: paragraphStart });
    const count = greedy.length;
    if (
      options.wrap === "greedy" ||
      !options.wrap ||
      count <= 1 ||
      count > (options.wrap === "balance" ? 4 : 16) ||
      unique.length > 256
    )
      output.push(...greedy);
    else {
      const total = length(0, paragraph.length),
        target = total / count;
      const memo = new Map<
        string,
        { cost: number; ranges: BreakRange[] } | undefined
      >();
      const solve = (
        start: number,
        remaining: number,
      ): { cost: number; ranges: BreakRange[] } | undefined => {
        if (!remaining)
          return start === unique.length - 1
            ? { cost: 0, ranges: [] }
            : undefined;
        const key = `${start}:${remaining}`;
        if (memo.has(key)) return memo.get(key);
        let best: { cost: number; ranges: BreakRange[] } | undefined;
        for (let end = start + 1; end < unique.length; end++) {
          const w = length(unique[start]!, unique[end]!);
          if (w > width + 0.01) break;
          if (remaining === 1 && end !== unique.length - 1) continue;
          const r = range(unique[start]!, unique[end]!);
          const wordCount = [
            ...new Intl.Segmenter(options.locale ?? "en", {
              granularity: "word",
            }).segment(text.slice(r.start, r.end)),
          ].filter((w) => w.isWordLike).length;
          if (
            options.wrap === "pretty" &&
            remaining === 1 &&
            (wordCount < 2 || w < width * (options.orphanFraction ?? 0.2))
          )
            continue;
          const tail = solve(end, remaining - 1);
          if (!tail) continue;
          const cost =
            (options.wrap === "balance"
              ? (w - target) ** 2
              : (width - w) ** 2) + tail.cost;
          if (!best || cost < best.cost)
            best = { cost, ranges: [r, ...tail.ranges] };
        }
        memo.set(key, best);
        return best;
      };
      output.push(...(solve(0, count)?.ranges ?? greedy));
    }
    paragraphStart += paragraph.length + 1;
  }
  return output;
}

export function shapeText(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  text: string,
  fonts: Map<string, LoadedFont>,
  styles: Record<string, TextStyle> = {},
): ShapedLayout {
  const locale = node.locale ?? node.textBox?.locale ?? "en";
  const segments = [
    ...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
  ];
  if (segments.length > 4096)
    throw new Error(`text-layout-budget: ${node.id} exceeds 4096 clusters`);
  const baseStyle = resolvedTextStyle(node, styles);
  const baseFont = applyTextStyle(ctx, baseStyle, fonts),
    metrics = baseFont.metrics;
  if (!metrics)
    throw new Error(`font-metadata: ${node.id} requires measured font metrics`);
  const size = baseStyle.size!,
    metricScale = size / metrics.unitsPerEm;
  const ascent = metrics.ascent * metricScale,
    descent = metrics.descent * metricScale;
  const capHeight = metrics.capHeight * metricScale,
    xHeight = metrics.xHeight * metricScale;
  const leading = baseStyle.leading!,
    lineHeight = size * leading;
  const firstBaseline =
    node.anchor === "baseline" ? 0 : node.anchor === "cap" ? capHeight : ascent;
  const wordSegments = [
    ...new Intl.Segmenter(locale, { granularity: "word" }).segment(text),
  ];
  let wordIndex = -1;
  const wordIndices = wordSegments.map((w) => {
    if (w.isWordLike) wordIndex++;
    return wordIndex;
  });
  const atoms = segments.map((s, i) => {
    const spanIndex =
      node.spans?.findIndex((span) => i >= span.start && i < span.end) ?? -1;
    const span = node.spans?.[spanIndex];
    const style = resolvedTextStyle(node, styles, span?.style);
    return {
      start: s.index,
      end: s.index + s.segment.length,
      text: caseText(s.segment, style, locale),
      sourceIndex: i,
      spanIndex,
      style,
      color: span?.color ?? node.color,
      wordIndex:
        wordIndices[
          wordSegments.findIndex(
            (w) => s.index >= w.index && s.index < w.index + w.segment.length,
          )
        ] ?? -1,
    };
  });
  const fontSignature = (s: TextStyle) => JSON.stringify(s);
  const runsFor = (start: number, end: number) => {
    const runs: { atoms: typeof atoms; style: TextStyle; signature: string }[] =
      [];
    for (const atom of atoms.filter((a) => a.start >= start && a.start < end)) {
      const signature = fontSignature(atom.style),
        previous = runs.at(-1);
      if (previous?.signature === signature) previous.atoms.push(atom);
      else runs.push({ atoms: [atom], style: atom.style, signature });
    }
    return runs;
  };
  const measure = (value: string, start: number) =>
    runsFor(start, start + value.length).reduce((sum, run) => {
      applyTextStyle(ctx, run.style, fonts);
      const m = ctx.measureText(run.atoms.map((a) => a.text).join(""));
      return (
        sum +
        Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight)
      );
    }, 0);
  const measureWidth =
    node.textLayout?.width ?? (node.textBox ? node.width : Infinity);
  const ranges = textBreaks(text, measureWidth, measure, {
    locale,
    ...(node.wrap ? { wrap: node.wrap } : {}),
    ...(node.orphanFraction !== undefined
      ? { orphanFraction: node.orphanFraction }
      : {}),
  });
  const lines: ShapedLine[] = [],
    clusters: GlyphCluster[] = [],
    runs: ShapedRun[] = [];
  ranges.forEach((range, lineIndex) => {
    const value = text.slice(range.start, range.end),
      width = measure(value, range.start);
    const x = node.textBox
      ? node.align === "center"
        ? (node.width - width) / 2
        : node.align === "right"
          ? node.width - width
          : 0
      : node.align === "center"
        ? -width / 2
        : node.align === "right"
          ? -width
          : 0;
    const baseline = firstBaseline + lineIndex * lineHeight;
    const line: ShapedLine = {
      text: value,
      x,
      width,
      baseline,
      ascent,
      descent,
      clusters: [],
    };
    let cursor = x;
    for (const run of runsFor(range.start, range.end)) {
      const font = applyTextStyle(ctx, run.style, fonts),
        runSize = run.style.size!,
        scale = runSize / font.metrics!.unitsPerEm;
      const runText = run.atoms.map((a) => a.text).join(""),
        runWidth = ctx.measureText(runText).width;
      const runIndex = runs.length,
        indices: number[] = [];
      let prefix = "";
      for (const [i, atom] of run.atoms.entries()) {
        // Contextual prefix advances retain pair kerning. The raster is always shaped as a complete run.
        const from = i
          ? ctx.measureText(prefix + atom.text).width -
            ctx.measureText(atom.text).width
          : 0;
        prefix += atom.text;
        const next = run.atoms[i + 1];
        const to = next
          ? ctx.measureText(prefix + next.text).width -
            ctx.measureText(next.text).width
          : runWidth;
        const ink = ctx.measureText(atom.text);
        const index = clusters.length;
        clusters.push({
          text: atom.text,
          sourceIndex: atom.sourceIndex,
          spanIndex: atom.spanIndex,
          wordIndex: atom.wordIndex,
          lineIndex,
          x: cursor + from,
          advance: Math.max(0, to - from),
          baseline,
          ascent: font.metrics!.ascent * scale,
          descent: font.metrics!.descent * scale,
          runIndex,
          ink: {
            x: cursor + from - ink.actualBoundingBoxLeft,
            y: baseline - ink.actualBoundingBoxAscent,
            width: ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight,
            height: ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent,
          },
        });
        indices.push(index);
        line.clusters.push(index);
      }
      // Color-only spans use the same complete shaped run, clipped at cluster boundaries when rasterized.
      runs.push({
        text: runText,
        x: cursor,
        baseline,
        width: runWidth,
        style: run.style,
        color: node.color,
        clusters: indices,
      });
      cursor += runWidth;
    }
    lines.push(line);
  });
  let nextBaseline = firstBaseline;
  lines.forEach((line, index) => {
    const lineClusters = line.clusters.map((i) => clusters[i]!);
    line.ascent = Math.max(ascent, ...lineClusters.map((c) => c.ascent));
    line.descent = Math.max(descent, ...lineClusters.map((c) => c.descent));
    if (index)
      nextBaseline += Math.max(
        lineHeight,
        lines[index - 1]!.descent + line.ascent,
      );
    const shift = nextBaseline - line.baseline;
    line.baseline = nextBaseline;
    for (const cluster of lineClusters) {
      cluster.baseline += shift;
      if (cluster.ink) cluster.ink.y += shift;
    }
    for (const runIndex of new Set(lineClusters.map((c) => c.runIndex)))
      runs[runIndex]!.baseline += shift;
  });
  const left = Math.min(0, ...lines.map((l) => l.x)),
    top = Math.min(...lines.map((l) => l.baseline - l.ascent));
  const height = Math.max(...lines.map((l) => l.baseline + l.descent)) - top;
  const width = Math.max(0, ...lines.map((l) => l.width));
  const limitHeight =
    node.textLayout?.height ?? (node.textBox ? node.height : Infinity);
  const overflow =
    width > measureWidth + 0.01 ||
    height > limitHeight + 0.01 ||
    lines.length > (node.textBox?.maxLines ?? 64);
  if (overflow && node.textLayout?.overflow !== "clip") {
    if (node.textBox)
      throw new Error(
        `Text overflows ${node.id}; shorten the copy or choose a larger layout`,
      );
    passageError("text-overflow", "Text exceeds its layout box: " + node.id, {
      node: node.id,
    });
  }
  return {
    text,
    lines,
    clusters,
    runs,
    width,
    height,
    left,
    top,
    lineHeight,
    ascent,
    descent,
    capHeight,
    xHeight,
    tracking: baseStyle.tracking!,
    leading,
    underlinePosition: metrics.underlinePosition * metricScale,
    underlineThickness: metrics.underlineThickness * metricScale,
    overflow,
  };
}
