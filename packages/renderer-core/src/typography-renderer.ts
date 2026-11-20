import {
  createRenderCanvas,
  readRenderImageData,
  retainRenderCanvas,
  releaseRenderCanvas,
} from "./managed-memory-context.ts";
import type { CanvasPixelSource } from "./canvas-pixel-source.ts";
import { cachedRecent } from "./recent-cache.ts";
import { resolveTextEvents } from "./typography-events.ts";
import { easeMotion } from "./motion-easing.ts";
import { axisKey, axisLayout, nodeAxisVariants } from "./typography-axes.ts";
import type {
  TextStyle,
  TextTransition,
} from "../../scene-contract/src/typography.ts";
import type { TextAnimator } from "../../scene-contract/src/motion-craft.ts";
import type { TextEventScene } from "./typography-events.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import {
  applyTextStyle,
  resolvedTextStyle,
  type TextNode,
} from "./typography-style.ts";
import { shapeText, type ShapedLayout } from "./shaped-text.ts";
import {
  evaluateTextPoses,
  textAnimationFrames,
  clusterBox,
  type TextPose,
  type TextAnimationContext,
} from "./typography-animation.ts";
import {
  commonClusters,
  retypedClusters,
  reserveCountWidth,
  resolveDisplayedText,
  correctionReplacementStart,
  transitionSlideLimit,
} from "./typography-transition.ts";
import {
  decorationFadesWithText,
  decorationReveal,
  decorationSegments,
  drawTextDecorations,
} from "./typography-decorations.ts";
import { drawTextContainerShape } from "./text-container.ts";
import type { Rect } from "./text-container-layout.ts";
import { typographyTextValues } from "./typography-text-values.ts";
import { textVisibility } from "./typography-visibility.ts";
import { sourceExposureTimeline } from "./commerce-exposure.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";

// Only canvases returned from the local painter belong to the bounded color map.
const localColorCanvases = new WeakSet<HTMLCanvasElement>();

export type TextRaster = {
  layout: ShapedLayout;
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  colors: Map<string, HTMLCanvasElement>;
  strokes: Map<string, HTMLCanvasElement>;
  fonts: Map<string, LoadedFont>;
  variants: Map<string, TextRaster>;
  sourceCanvas?: CanvasPixelSource;
  sourceInput?: unknown;
  softwareRaster?: boolean;
  /** Opaque glyph coverage; authored fill colour and alpha apply only when drawing. */
  colorCoverage?: boolean;
  /** Composition outlines cache opaque coverage, independent of animated colour. */
  strokeCoverage?: boolean;
  /**
   * ET5b: rasters of runs of clusters (keyed `first:last`) holding only their
   * own glyph ink, made on first use when neighbouring clusters on a line are
   * drawn with different poses (see `drawRaster`); bounded to the most
   * recently used (see `isolatedSegmentLimit`).
   */
  isolated?: Map<string, { raster: TextRaster; x: number }>;
  /** ET5b: whether shaping joins each cluster to the next (see `joinsNext`). */
  joins?: Map<number, boolean>;
};
export type PreparedTypography = {
  corrections: Map<
    string,
    {
      node: TextNode;
      raster: TextRaster;
      start: number;
      end: number;
      x: number;
      y: number;
    }[]
  >;
  nodes: Map<string, Map<string, TextRaster>>;
  pairs: Map<string, [number, number][]>;
  slideLimits: Map<string, number>;
  scene: TextEventScene & TextAnimationContext;
  layer: HTMLCanvasElement;
  maskLayer: HTMLCanvasElement;
  transitionLayer: HTMLCanvasElement;
};

/** These runs paint one composed glyph image, with no surrounding primitive paints. */
export function isSingleImageTypography(
  node: TextNode,
  prepared: PreparedTypography,
) {
  return (
    !node.container &&
    !node.decorations?.length &&
    hasStableTypographyImage(node, prepared)
  );
}

/** The composed glyph source stays unchanged until the next typography draw. */
export function hasStableTypographyImage(
  node: TextNode,
  prepared: PreparedTypography,
) {
  return (
    !node.transition &&
    !node.transitions?.length &&
    !prepared.corrections.get(node.id)?.length &&
    !prepared.scene.textAnimators?.some(
      (animator) =>
        animator.node === node.id &&
        (animator.from.blur !== undefined || animator.to?.blur !== undefined),
    )
  );
}
const surface = (width: number, height: number, softwareRaster = false) => {
  if (width * height > 32_000_000 || width > 16384 || height > 16384)
    throw new Error("text-raster-budget: text layer exceeds 32 megapixels");
  const canvas = createRenderCanvas();
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  if (softwareRaster) canvas.getContext("2d", { willReadFrequently: true });
  return canvas;
};
function rasterFonts(fonts: ReadonlyMap<string, LoadedFont>) {
  return [...fonts]
    .map(([id, font]) => [id, font.family, font.weight, font.style ?? "normal"])
    .sort((a, b) =>
      String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0,
    );
}
export function rasterizeText(
  node: TextNode,
  layout: ShapedLayout,
  fonts: Map<string, LoadedFont>,
  colorCoverage = false,
  softwareRaster = false,
  sourceCanvas?: CanvasPixelSource,
): TextRaster {
  const pad = Math.ceil(
    Math.max(
      22,
      Math.max(...layout.runs.map((r) => r.style.size ?? node.fontSize)) * 0.5 +
        2,
    ),
  );
  const left = Math.floor(Math.min(0, ...layout.lines.map((l) => l.x)) - pad),
    top = Math.floor(layout.top - pad);
  const right = Math.max(...layout.lines.map((l) => l.x + l.width));
  const width = Math.max(1, Math.ceil(right - left + pad));
  const height = Math.max(1, Math.ceil(layout.top + layout.height - top + pad));
  const paint = () => {
    const canvas = surface(
        right - left + pad,
        layout.top + layout.height - top + pad,
        softwareRaster,
      ),
      ctx = canvas.getContext("2d")!;
    ctx.translate(-left, -top);
    const clusterColor = (index: number) =>
      colorCoverage
        ? "#ffffff"
        : (node.spans?.[layout.clusters[index]!.spanIndex]?.color ??
          node.color);
    for (const run of layout.runs) {
      applyTextStyle(ctx, run.style, fonts);
      const first = run.clusters[0]!,
        last = run.clusters.at(-1)!;
      const colors = [...new Set(run.clusters.map(clusterColor))];
      for (const color of colors) {
        ctx.save();
        ctx.beginPath();
        for (const i of run.clusters) {
          const cluster = layout.clusters[i]!;
          if (clusterColor(i) !== color) continue;
          const x = i === first ? run.x - pad : Math.round(cluster.x);
          const right =
            i === last
              ? run.x + run.width + pad
              : Math.round(cluster.x + cluster.advance);
          ctx.rect(x, top, right - x, canvas.height);
        }
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillText(run.text, run.x, run.baseline);
        ctx.restore();
      }
    }
    return canvas;
  };
  const restore = (pixels: Uint8Array<ArrayBuffer>) => {
    const canvas = surface(width, height, softwareRaster);
    canvas
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(
            pixels.buffer,
            pixels.byteOffset,
            pixels.byteLength,
          ),
          width,
          height,
        ),
        0,
        0,
      );
    return canvas;
  };
  const sourceInput = sourceCanvas
    ? [node, layout, rasterFonts(fonts), colorCoverage, softwareRaster]
    : undefined;
  const canvas = sourceCanvas
    ? sourceCanvas(
        {
          kind: "glyph",
          input: sourceInput,
          width,
          height,
        },
        paint,
        restore,
      )
    : paint();
  return {
    layout,
    canvas,
    left,
    top,
    colors: new Map(),
    strokes: new Map(),
    fonts,
    variants: new Map(),
    ...(sourceCanvas ? { sourceCanvas, sourceInput } : {}),
    ...(softwareRaster ? { softwareRaster: true } : {}),
    ...(colorCoverage ? { colorCoverage: true } : {}),
  };
}
/**
 * ET5b: the glyph ink of a run of neighbouring clusters on one line that share
 * a pose, shaped and painted on its own. Slicing the line raster at advance
 * boundaries hands a glyph's overhang (a serif, an italic stroke) to its
 * neighbour; drawn with the neighbour's pose, that sliver detaches as a
 * fragment and leaves a seam (finding O11). A segment keeps the shaping inside
 * it (ligatures, contextual forms); its clusters sit at the layout's kerned
 * positions. The raster's coordinates are shifted left by `x` (an integer).
 */
type IsolatedSegment = { raster: TextRaster; x: number };
function rasterizeSegment(
  node: TextNode,
  raster: TextRaster,
  first: number,
  last: number,
): IsolatedSegment {
  // An integer shift keeps every glyph's subpixel phase and an unscaled draw.
  const layout = raster.layout,
    x = Math.floor(layout.clusters[first]!.x),
    line = layout.lines[layout.clusters[first]!.lineIndex]!;
  const shift = <T extends { x: number }>(value: T): T => ({
    ...value,
    x: value.x - x,
  });
  const indices = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const clusters = indices.map((index) => {
    const cluster = layout.clusters[index]!;
    return {
      ...shift(cluster),
      lineIndex: 0,
      ...(cluster.ink ? { ink: shift(cluster.ink) } : {}),
    };
  });
  const runs: ShapedLayout["runs"] = [];
  const runOf = new Map<number, number>();
  indices.forEach((index, i) => {
    const cluster = layout.clusters[index]!;
    let at = runOf.get(cluster.runIndex);
    if (at === undefined) {
      at = runs.length;
      runOf.set(cluster.runIndex, at);
      const run = layout.runs[cluster.runIndex]!;
      runs.push({ ...run, text: "", x: cluster.x - x, width: 0, clusters: [] });
    }
    const run = runs[at]!;
    run.text += cluster.text;
    run.clusters.push(i);
    run.width = cluster.x - x + cluster.advance - run.x;
    clusters[i]!.runIndex = at;
  });
  const end = layout.clusters[last]!;
  const sub: ShapedLayout = {
    ...layout,
    top: line.baseline - line.ascent,
    height: line.ascent + line.descent,
    clusters,
    runs,
    lines: [
      {
        ...line,
        x: layout.clusters[first]!.x - x,
        width: end.x + end.advance - layout.clusters[first]!.x,
        clusters: indices.map((_, i) => i),
      },
    ],
  };
  // Made on first use while drawing, so it is painted locally: shared
  // preparation sources only admit requests during preparation. Retained like
  // local tints, so a frame's scratch memory does not reclaim the cache.
  const isolated = rasterizeText(
    node,
    sub,
    raster.fonts,
    raster.colorCoverage,
    raster.softwareRaster,
  );
  retainRenderCanvas(isolated.canvas);
  if (raster.strokeCoverage) isolated.strokeCoverage = true;
  return { raster: isolated, x };
}
function isolatedSegment(
  node: TextNode,
  raster: TextRaster,
  first: number,
  last: number,
) {
  raster.isolated ??= new Map();
  return cachedRecent(
    raster.isolated,
    `${first}:${last}`,
    isolatedSegmentLimit(raster.layout),
    () => rasterizeSegment(node, raster, first, last),
    (stale) => releaseTextRaster(stale.raster),
  );
}
/**
 * Isolated segments kept per raster. One frame draws at most one segment per
 * cluster, so twice that keeps the previous frame's segments for reuse while
 * bounding memory: a stagger's settled prefix alone is a new segment each
 * time it grows, and arbitrary motion can produce a quadratic number.
 */
function isolatedSegmentLimit(layout: ShapedLayout) {
  return Math.max(32, 2 * layout.clusters.length);
}
/**
 * Release a raster's native storage and that of its variants and isolated
 * segments. Shared preparation sources keep their own canvases; tints painted
 * locally are released either way.
 */
function releaseTextRaster(
  raster: TextRaster,
  seen = new Set<TextRaster>(),
): void {
  if (seen.has(raster)) return;
  seen.add(raster);
  if (!raster.sourceCanvas) {
    releaseRenderCanvas(raster.canvas);
    for (const canvas of raster.strokes.values()) releaseRenderCanvas(canvas);
  }
  for (const canvas of raster.colors.values())
    if (!raster.sourceCanvas || localColorCanvases.has(canvas)) {
      localColorCanvases.delete(canvas);
      releaseRenderCanvas(canvas);
    }
  raster.colors.clear();
  for (const variant of raster.variants.values())
    releaseTextRaster(variant, seen);
  for (const isolated of raster.isolated?.values() ?? [])
    releaseTextRaster(isolated.raster, seen);
  raster.isolated?.clear();
}
/** The segment's outline, cached on it under the line raster's key scheme. */
function isolatedStroke(isolated: TextRaster, width: number, color: string) {
  const strokeColor = isolated.strokeCoverage ? "#ffffff" : color;
  const key = `${width}:${strokeColor}`;
  let canvas = isolated.strokes.get(key);
  if (!canvas) {
    canvas = renderStrokedRaster(isolated, width, strokeColor);
    retainRenderCanvas(canvas);
    isolated.strokes.set(key, canvas);
  }
  return isolated.strokeCoverage && color !== "#ffffff"
    ? coloredRaster(isolated, color, canvas, `stroke:${width}:${color}`)
    : canvas;
}
/** Everything that makes two clusters draw differently. */
function drawPoseKey(pose: TextPose) {
  const transformed =
    pose.scale !== 1 || pose.rotation !== 0 || pose.skew !== 0;
  return JSON.stringify([
    pose.x,
    pose.y,
    pose.scale,
    pose.rotation,
    pose.skew,
    pose.opacity,
    pose.blur,
    quantizeStrokeWidth(pose.strokeWidth),
    pose.fill,
    pose.stroke,
    axisKey(pose.axes),
    pose.mask,
    pose.feather,
    transformed ? [pose.anchorX, pose.anchorY] : 0,
  ]);
}
/**
 * ET5b: lines whose clusters are not all drawn with one pose. They draw by
 * isolated segments; lines with one pose keep the line raster's slices, which
 * tile it exactly, so settled text stays pixel-identical.
 */
function linesWithDistinctPoses(layout: ShapedLayout, poses: TextPose[]) {
  const lines = new Set<number>();
  for (const [lineIndex, line] of layout.lines.entries()) {
    const keys = new Set(line.clusters.map((i) => drawPoseKey(poses[i]!)));
    if (keys.size > 1) lines.add(lineIndex);
  }
  return lines;
}
/** Consecutive indices on one line with one pose, as [first, last] pairs. */
function poseSegments(
  layout: ShapedLayout,
  poses: TextPose[],
  indices: number[],
) {
  const segments: [number, number][] = [];
  let key: string | undefined;
  for (const index of indices) {
    const next = drawPoseKey(poses[index]!);
    const open = segments.at(-1);
    if (
      open &&
      open[1] === index - 1 &&
      layout.clusters[open[1]]!.lineIndex ===
        layout.clusters[index]!.lineIndex &&
      next === key
    )
      open[1] = index;
    else segments.push([index, index]);
    key = next;
  }
  return segments;
}
/**
 * ET5b: whether shaping joins a cluster to the next one, as a ligature or a
 * contextual form does. Segments are shaped on their own, so splitting such
 * a pair at a pose boundary would change their glyphs while the poses differ
 * and change them back when they merge. Measured once per boundary: the pair
 * shaped together against each cluster shaped alone, at the layout's
 * positions; kerning keeps the glyphs and so does not count.
 */
function joinsNext(node: TextNode, raster: TextRaster, index: number) {
  const layout = raster.layout,
    a = layout.clusters[index]!,
    b = layout.clusters[index + 1];
  if (!b || a.lineIndex !== b.lineIndex || a.runIndex !== b.runIndex)
    return false;
  raster.joins ??= new Map();
  const cached = raster.joins.get(index);
  if (cached !== undefined) return cached;
  const pair = isolatedSegment(node, raster, index, index + 1),
    left = isolatedSegment(node, raster, index, index),
    right = isolatedSegment(node, raster, index + 1, index + 1);
  const { width, height } = pair.raster.canvas;
  const apart = surface(width, height, raster.softwareRaster);
  let joined = false;
  try {
    const ctx = apart.getContext("2d")!;
    for (const part of [left, right])
      ctx.drawImage(
        part.raster.canvas,
        part.raster.left + part.x - (pair.raster.left + pair.x),
        part.raster.top - pair.raster.top,
      );
    const together = readRenderImageData(
        pair.raster.canvas.getContext("2d")!,
        0,
        0,
        width,
        height,
      ).data,
      separate = readRenderImageData(ctx, 0, 0, width, height).data;
    // Rounding at glyph edges differs by far less than a changed glyph.
    let changed = 0;
    for (let i = 3; i < together.length && changed < 3; i += 4)
      if (Math.abs(together[i]! - separate[i]!) > 96) changed++;
    joined = changed >= 3;
  } finally {
    releaseRenderCanvas(apart);
  }
  raster.joins.set(index, joined);
  return joined;
}
/**
 * ET5b: on lines drawn by segments, the clusters that shaping joins across a
 * pose boundary, mapped to their whole joined unit [first, last]. A unit is
 * rasterized together, so its glyphs keep their shapes, and each cluster
 * draws its own columns of it with its own pose.
 */
function joinedUnits(
  node: TextNode,
  raster: TextRaster,
  poses: TextPose[],
  lines: Set<number>,
) {
  const units = new Map<number, [number, number]>();
  for (const lineIndex of lines) {
    const line = raster.layout.lines[lineIndex]!,
      start = line.clusters[0]!,
      end = line.clusters.at(-1)!;
    for (let i = start; i < end; i++) {
      if (
        units.has(i) ||
        drawPoseKey(poses[i]!) === drawPoseKey(poses[i + 1]!) ||
        !joinsNext(node, raster, i)
      )
        continue;
      let first = i,
        last = i + 1;
      while (first > start && joinsNext(node, raster, first - 1)) first--;
      while (last < end && joinsNext(node, raster, last)) last++;
      for (let k = first; k <= last; k++) units.set(k, [first, last]);
    }
  }
  return units;
}
export function prepareTypography(
  scene: (StoryRenderScene | CommerceRenderScene) & TextAnimationContext,
  fonts: Map<string, LoadedFont>,
  options: {
    strokeCoverage?: boolean;
    colorCoverage?: boolean;
    sourceColorNodes?: ReadonlySet<string>;
    softwareRaster?: boolean;
    sourceCanvas?: CanvasPixelSource;
  } = {},
): PreparedTypography {
  const nodes = new Map<string, Map<string, TextRaster>>(),
    pairs = new Map<string, [number, number][]>(),
    slideLimits = new Map<string, number>();
  const measureCanvas = surface(1, 1);
  const ctx = measureCanvas.getContext("2d")!;
  try {
    const exposureTimes = scene.effects?.some(
      (effect) => effect.type === "motion-blur" && effect.shutterAngle > 0,
    )
      ? sourceExposureTimeline(scene).times
      : undefined;
    let pixels = 0;
    const reserveCanvas = (canvas: HTMLCanvasElement) => {
      pixels += canvas.width * canvas.height;
      if (pixels > 128_000_000)
        throw new Error("text-raster-budget: scene exceeds 128 megapixels");
      return canvas;
    };
    const reserveRaster = (raster: TextRaster, sourceColor = false) => {
      reserveCanvas(raster.canvas);
      if (options.strokeCoverage && !sourceColor) raster.strokeCoverage = true;
      return raster;
    };
    for (const node of scene.nodes) {
      if (node.type !== "text") continue;
      const sourceColor = options.sourceColorNodes?.has(node.id) ?? false;
      const colorCoverage = options.colorCoverage && !sourceColor;
      const values = typographyTextValues(scene, node);
      const layouts = new Map(
        [...values].map((text) => [
          text,
          shapeText(ctx, node, text, fonts, scene.textStyles),
        ]),
      );
      const count = (
        node.transitions ?? (node.transition ? [node.transition] : [])
      ).some((t) => t.kind === "count");
      if (count) reserveCountWidth(layouts.values());
      const rasters = new Map<string, TextRaster>();
      for (const [text, layout] of layouts) {
        rasters.set(
          text,
          reserveRaster(
            rasterizeText(
              node,
              layout,
              fonts,
              colorCoverage,
              options.softwareRaster,
              options.sourceCanvas,
            ),
            sourceColor,
          ),
        );
      }
      const axes = nodeAxisVariants(scene, node, [...layouts.values()], fonts);
      for (const [text, raster] of rasters)
        for (const [key, deltas] of axes) {
          const layout = axisLayout(
            ctx,
            node,
            text,
            scene.textStyles ?? {},
            fonts,
            deltas,
          );
          raster.variants.set(
            key,
            reserveRaster(
              rasterizeText(
                node,
                layout,
                fonts,
                colorCoverage,
                options.softwareRaster,
                options.sourceCanvas,
              ),
              sourceColor,
            ),
          );
        }
      if (
        scene.textAnimators?.some(
          (animator) =>
            animator.node === node.id &&
            (animator.from.strokeWidth !== undefined ||
              animator.to?.strokeWidth !== undefined),
        )
      ) {
        // Authored states stay drawable at any frame (the type specimen draws each one); generated
        // count and component texts get outlines only on frames where the renderer shows them.
        const staticValues = [node.text, ...(node.states ?? [])];
        const layoutsByText = new Map(
          [...rasters].map(([text, raster]) => [text, raster.layout]),
        );
        const visibility = Object.hasOwn(scene.animationFrames ?? {}, node.id)
          ? [...textAnimationFrames(scene, node)].map((frame) => ({
              frame,
              texts: [...rasters.keys()],
            }))
          : textVisibility(scene, node, layoutsByText, exposureTimes);
        for (const { frame, texts } of visibility) {
          for (const text of new Set([...staticValues, ...texts])) {
            const raster = rasters.get(text);
            if (!raster)
              throw new Error(`text-layout-not-prepared: ${node.id}: ${text}`);
            const poses = evaluateTextPoses(
              node,
              raster.layout,
              scene.textAnimators ?? [],
              Math.round(frame),
              scene,
            );
            for (const pose of poses) {
              const width = quantizeStrokeWidth(pose.strokeWidth);
              if (pose.opacity <= 0 || width <= 0) continue;
              const target = axisRaster(raster, pose.axes);
              const strokeColor = target.strokeCoverage
                ? "#ffffff"
                : pose.stroke;
              const strokeKey = `${width}:${strokeColor}`;
              if (!target.strokes.has(strokeKey))
                target.strokes.set(
                  strokeKey,
                  reserveCanvas(
                    renderStrokedRaster(
                      target,
                      width,
                      strokeColor,
                      options.sourceCanvas,
                    ),
                  ),
                );
            }
          }
        }
      }
      nodes.set(node.id, rasters);
      for (const t of node.transitions ??
        (node.transition ? [node.transition] : [])) {
        const from = rasters.get(node.states![t.fromState ?? 0]!)!,
          to = rasters.get(node.states![t.toState ?? 1]!)!;
        slideLimits.set(pairKey(node, t), transitionSlideLimit(t, scene.fps));
        pairs.set(
          pairKey(node, t),
          commonClusters(
            from.layout.clusters.map((c) => c.text),
            to.layout.clusters.map((c) => c.text),
          ),
        );
      }
    }
    const corrections: PreparedTypography["corrections"] = new Map();
    for (const event of resolveTextEvents(scene).filter(
      (e) => e.verb === "correct",
    )) {
      const node = scene.nodes.find((n) => n.id === event.node);
      if (node?.type !== "text") continue;
      const base = nodes.get(node.id)!.get(node.text)!.layout;
      const target = base.clusters.filter(
        (c) => !event.span || node.spans?.[c.spanIndex]?.id === event.span,
      );
      if (!target.length)
        throw new Error("text-correction: replacement has no span");
      const box = clusterBox(target);
      const replacement: TextNode = {
        ...node,
        text: event.replacement!,
        states: undefined,
        spans: undefined,
        style: "correction",
        fontAsset: resolvedTextStyle(node, scene.textStyles ?? {}).fontAsset,
        fontSize: node.fontSize * 0.75,
        anchor: "baseline",
        textLayout: undefined,
        textBox: undefined,
        align: "left",
        decorations: undefined,
        transition: undefined,
        transitions: undefined,
        color: event.color ?? node.color,
      };
      const correction = {
        ...resolvedTextStyle(node, scene.textStyles ?? {}),
        size: replacement.fontSize,
      };
      const layout = shapeText(ctx, replacement, replacement.text, fonts, {
        correction,
      });
      const raster = reserveRaster(
        rasterizeText(
          replacement,
          layout,
          fonts,
          false,
          options.softwareRaster,
          options.sourceCanvas,
        ),
      );
      const entries = corrections.get(node.id) ?? [];
      entries.push({
        node: replacement,
        raster,
        start: correctionReplacementStart(event),
        end: event.end,
        x: box.x,
        y:
          Math.min(...target.map((c) => c.baseline)) -
          base.capHeight -
          node.fontSize * 0.12,
      });
      corrections.set(node.id, entries);
    }
    return {
      corrections,
      nodes,
      pairs,
      slideLimits,
      scene,
      layer: surface(1, 1, options.softwareRaster),
      maskLayer: surface(1, 1, options.softwareRaster),
      transitionLayer: surface(1, 1, options.softwareRaster),
    };
  } finally {
    releaseRenderCanvas(measureCanvas);
  }
}
/** Release native typography storage; shared preparation sources retain their separate owners. */
export function disposeTypography(prepared: PreparedTypography): void {
  const seen = new Set<TextRaster>();
  const release = (raster: TextRaster) => releaseTextRaster(raster, seen);
  for (const rasters of prepared.nodes.values())
    for (const raster of rasters.values()) release(raster);
  for (const corrections of prepared.corrections.values())
    for (const correction of corrections) release(correction.raster);
  releaseRenderCanvas(prepared.layer);
  releaseRenderCanvas(prepared.maskLayer);
  releaseRenderCanvas(prepared.transitionLayer);
}

/** Container content box in node space, matching the legacy text-box and text-layout limits. */
export function typographyContainerContent(
  node: TextNode,
  layout: ShapedLayout,
): Rect {
  if (node.textBox)
    return { x: 0, y: 0, width: node.width, height: node.height };
  const x = Math.min(...layout.lines.map((l) => l.x)),
    right = Math.max(...layout.lines.map((l) => l.x + l.width));
  return {
    x,
    y: layout.top,
    width: Math.min(right - x, node.textLayout?.width ?? Infinity),
    height: Math.min(layout.height, node.textLayout?.height ?? Infinity),
  };
}
export function displayedContainerContent(
  node: TextNode,
  prepared: PreparedTypography,
  frame: number,
  state: number,
): Rect {
  const states = prepared.nodes.get(node.id)!;
  const content = (text: string) => {
    const raster = states.get(text);
    if (!raster)
      throw new Error(`text-layout-not-prepared: ${node.id}: ${text}`);
    return typographyContainerContent(node, raster.layout);
  };
  const displayed = resolveDisplayedText(node, frame, state);
  if (displayed.kind === "single") return content(displayed.text);
  // The container eases between the two state boxes instead of snapping.
  const a = content(displayed.fromText),
    b = content(displayed.toText),
    p = displayed.progress;
  return {
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
    width: a.width + (b.width - a.width) * p,
    height: a.height + (b.height - a.height) * p,
  };
}
function pairKey(node: TextNode, t: TextTransition) {
  return `${node.id}:${t.fromState ?? 0}:${t.toState ?? 1}:${t.window.start}:${t.window.end}`;
}
function coloredRaster(
  raster: TextRaster,
  color: string,
  source = raster.canvas,
  key = color,
) {
  const cached = raster.colors.get(key);
  if (cached) return cached;
  let owned = false;
  const paint = () => {
    owned = true;
    const canvas = surface(
      raster.canvas.width,
      raster.canvas.height,
      raster.softwareRaster,
    );
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  };
  const canvas = raster.sourceCanvas
    ? raster.sourceCanvas(
        {
          kind: "glyph-tint",
          input: [raster.sourceInput, color, key],
          width: raster.canvas.width,
          height: raster.canvas.height,
        },
        paint,
        (pixels) => {
          const canvas = surface(
            raster.canvas.width,
            raster.canvas.height,
            raster.softwareRaster,
          );
          canvas
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(
                  pixels.buffer,
                  pixels.byteOffset,
                  pixels.byteLength,
                ),
                canvas.width,
                canvas.height,
              ),
              0,
              0,
            );
          return canvas;
        },
      )
    : paint();
  if (raster.colors.size >= 16) {
    const oldest = raster.colors.keys().next().value!;
    const canvas = raster.colors.get(oldest)!;
    if (!raster.sourceCanvas || localColorCanvases.has(canvas)) {
      localColorCanvases.delete(canvas);
      releaseRenderCanvas(canvas);
    }
    raster.colors.delete(oldest);
  }
  retainRenderCanvas(canvas);
  if (owned) localColorCanvases.add(canvas);
  raster.colors.set(key, canvas);
  return canvas;
}
function renderStrokedRaster(
  raster: TextRaster,
  width: number,
  color: string,
  sourceCanvas?: CanvasPixelSource,
) {
  const paint = () => {
    const canvas = surface(
      raster.canvas.width,
      raster.canvas.height,
      raster.softwareRaster,
    );
    const ctx = canvas.getContext("2d")!;
    ctx.translate(-raster.left, -raster.top);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    for (const run of raster.layout.runs) {
      applyTextStyle(ctx, run.style, raster.fonts);
      ctx.strokeText(run.text, run.x, run.baseline);
    }
    return canvas;
  };
  if (!sourceCanvas) return paint();
  const w = raster.canvas.width,
    h = raster.canvas.height;
  return sourceCanvas(
    {
      kind: "glyph-stroke",
      input: [
        raster.layout,
        rasterFonts(raster.fonts),
        raster.left,
        raster.top,
        width,
        color,
        raster.softwareRaster ?? false,
      ],
      width: w,
      height: h,
    },
    paint,
    (pixels) => {
      const canvas = surface(w, h, raster.softwareRaster);
      canvas
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(
              pixels.buffer,
              pixels.byteOffset,
              pixels.byteLength,
            ),
            w,
            h,
          ),
          0,
          0,
        );
      return canvas;
    },
  );
}
/** Outlines are cached per width, so animated widths share a 0.25 px grid. */
export function quantizeStrokeWidth(width: number) {
  return Math.round(width * 4) / 4;
}
function axisRaster(raster: TextRaster, axes: Record<string, number>) {
  const key = axisKey(axes);
  if (key === "[]") return raster;
  const variant = raster.variants.get(key);
  if (!variant)
    throw new Error(
      "text-axis-not-prepared: animated font must be prepared before drawing",
    );
  return variant;
}
function strokedRaster(raster: TextRaster, width: number, color: string) {
  const canvas = raster.strokes.get(
    `${width}:${raster.strokeCoverage ? "#ffffff" : color}`,
  );
  if (!canvas)
    throw new Error("text-stroke-not-prepared: missing cached outline");
  return raster.strokeCoverage && color !== "#ffffff"
    ? coloredRaster(raster, color, canvas, `stroke:${width}:${color}`)
    : canvas;
}
function drawCluster(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  raster: TextRaster,
  index: number,
  pose: TextPose,
) {
  if (pose.opacity <= 0) return;
  raster = axisRaster(raster, pose.axes);
  const layout = raster.layout,
    cluster = layout.clusters[index]!,
    line = layout.lines[cluster.lineIndex]!;
  const first = line.clusters[0] === index,
    last = line.clusters.at(-1) === index;
  const x = first ? raster.left : Math.round(cluster.x),
    right = last
      ? raster.left + raster.canvas.width
      : Math.round(cluster.x + cluster.advance);
  const y =
    cluster.lineIndex === 0
      ? raster.top
      : Math.round(
          (layout.lines[cluster.lineIndex - 1]!.baseline + line.baseline) / 2 -
            layout.capHeight / 2,
        );
  const bottom =
    cluster.lineIndex === layout.lines.length - 1
      ? raster.top + raster.canvas.height
      : Math.round(
          (layout.lines[cluster.lineIndex + 1]!.baseline + line.baseline) / 2 -
            layout.capHeight / 2,
        );
  if (right <= x || bottom <= y) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, pose.opacity));
  posedClusterTransform(ctx, pose);
  const paint = (canvas: HTMLCanvasElement, dx = 0, dy = 0) =>
    ctx.drawImage(
      canvas,
      x - raster.left,
      y - raster.top,
      right - x,
      bottom - y,
      x + dx,
      y + dy,
      right - x,
      bottom - y,
    );
  const strokeWidth = quantizeStrokeWidth(pose.strokeWidth);
  if (strokeWidth > 0) paint(strokedRaster(raster, strokeWidth, pose.stroke));
  paint(
    pose.fill ===
      (raster.colorCoverage
        ? "#ffffff"
        : (node.spans?.[cluster.spanIndex]?.color ?? node.color))
      ? raster.canvas
      : coloredRaster(raster, pose.fill),
  );
  ctx.restore();
}
/**
 * ET5b: one isolated segment with its shared pose, or, with `slice`, the
 * columns of one cluster of a joined unit (see `joinedUnits`): from its
 * advance boundaries inside the unit, and to the raster's edge at the
 * unit's ends so overhanging ink stays with the unit's outer clusters.
 */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  raster: TextRaster,
  first: number,
  last: number,
  pose: TextPose,
  slice?: number,
) {
  if (pose.opacity <= 0) return;
  raster = axisRaster(raster, pose.axes);
  const { raster: own, x } = isolatedSegment(node, raster, first, last);
  const origin = own.left + x;
  let from = origin,
    to = origin + own.canvas.width;
  if (slice !== undefined) {
    const cluster = raster.layout.clusters[slice]!;
    if (slice !== first) from = Math.round(cluster.x);
    if (slice !== last) to = Math.round(cluster.x + cluster.advance);
    if (to <= from) return;
  }
  const paint = (canvas: HTMLCanvasElement) =>
    ctx.drawImage(
      canvas,
      from - origin,
      0,
      to - from,
      own.canvas.height,
      from,
      own.top,
      to - from,
      own.canvas.height,
    );
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, pose.opacity));
  posedClusterTransform(ctx, pose);
  const strokeWidth = quantizeStrokeWidth(pose.strokeWidth);
  if (strokeWidth > 0) paint(isolatedStroke(own, strokeWidth, pose.stroke));
  // As drawCluster, for every cluster drawn: the raster holds each cluster's
  // span colour, so it draws as painted only when all of them are the pose's
  // fill. Clusters with different span colours share a pose when an animator
  // drives their fill to one colour; the segment is then tinted as a whole.
  const painted = (index: number) =>
    own.colorCoverage
      ? "#ffffff"
      : (node.spans?.[raster.layout.clusters[index]!.spanIndex]?.color ??
        node.color);
  let untinted = true;
  for (let i = slice ?? first; i <= (slice ?? last) && untinted; i++)
    untinted = painted(i) === pose.fill;
  paint(untinted ? own.canvas : coloredRaster(own, pose.fill));
  ctx.restore();
}
/** The canvas transform a posed cluster is drawn with (`posedGlyphPoint` maps a point by it). */
export function posedClusterTransform(
  ctx: CanvasRenderingContext2D,
  pose: TextPose,
) {
  ctx.translate(pose.anchorX + pose.x, pose.anchorY + pose.y);
  ctx.rotate((pose.rotation * Math.PI) / 180);
  ctx.transform(
    pose.scale,
    0,
    Math.tan((pose.skew * Math.PI) / 180),
    pose.scale,
    0,
    0,
  );
  ctx.translate(-pose.anchorX, -pose.anchorY);
}
function resetLayer(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);
  return ctx;
}
function textBlurRuns(poses: TextPose[]) {
  const runs: { blur: number; indices: number[] }[] = [];
  poses.forEach((pose, index) => {
    if (pose.opacity <= 0) return;
    const blur = Math.max(0, pose.blur);
    const previous = runs.at(-1);
    if (previous?.blur === blur) previous.indices.push(index);
    else runs.push({ blur, indices: [index] });
  });
  return runs;
}
export function typographyRevealPoses(
  node: TextNode,
  raster: TextRaster,
  poses: TextPose[],
  reveal: number,
) {
  if (node.revealMode === "words" && reveal < 1) {
    const words = [
      ...new Set(
        raster.layout.clusters
          .filter((c) => /\S/u.test(c.text))
          .map((c) => c.wordIndex),
      ),
    ];
    poses = poses.map((pose, i) => {
      const rank = words.indexOf(raster.layout.clusters[i]!.wordIndex);
      const progress = Math.max(
        0,
        Math.min(1, reveal * (words.length + 0.5) - rank),
      );
      return {
        ...pose,
        opacity: pose.opacity * progress,
        y: pose.y + (1 - progress) * node.fontSize * 0.2,
      };
    });
    reveal = 1;
  }
  return { poses, reveal };
}

function drawRaster(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  raster: TextRaster,
  poses: TextPose[],
  prepared: PreparedTypography,
  frame: number,
  reveal: number,
) {
  const pad = Math.ceil(
    Math.max(
      node.fontSize * 4,
      160,
      ...poses.map((p) => Math.abs(p.x) + Math.abs(p.y) + p.blur * 3),
    ),
  );
  const left = raster.left - pad,
    top = raster.top - pad,
    width = raster.canvas.width + pad * 2,
    height = raster.canvas.height + pad * 2;
  if (width * height > 32_000_000)
    throw new Error("text-raster-budget: animated text extent");
  drawTextDecorations(
    ctx,
    node,
    raster.layout,
    frame,
    prepared.scene.fps,
    true,
    poses,
  );
  ({ poses, reveal } = typographyRevealPoses(node, raster, poses, reveal));
  const distinct = linesWithDistinctPoses(raster.layout, poses);
  const units = joinedUnits(node, raster, poses, distinct);
  // Lines with one pose draw by slices; the others by isolated segments,
  // except clusters whose shaping joins them across a pose boundary, which
  // draw as slices of their joined unit. Drawn in cluster order.
  const drawIndices = (target: CanvasRenderingContext2D, indices: number[]) => {
    const sliced = indices.filter(
      (i) => !distinct.has(raster.layout.clusters[i]!.lineIndex),
    );
    sliced.forEach((i) => drawCluster(target, node, raster, i, poses[i]!));
    if (sliced.length === indices.length) return;
    const isolated = indices.filter((i) =>
      distinct.has(raster.layout.clusters[i]!.lineIndex),
    );
    const draws: [number, number, number | undefined][] = [
      ...poseSegments(
        raster.layout,
        poses,
        isolated.filter((i) => !units.has(i)),
      ).map(([first, last]): [number, number, undefined] => [
        first,
        last,
        undefined,
      ]),
      ...isolated
        .filter((i) => units.has(i))
        .map((i): [number, number, number] => [...units.get(i)!, i]),
    ].sort((a, b) => (a[2] ?? a[0]) - (b[2] ?? b[0]));
    for (const [first, last, slice] of draws)
      drawSegment(
        target,
        node,
        raster,
        first,
        last,
        poses[slice ?? first]!,
        slice,
      );
  };
  for (const group of textBlurRuns(poses)) {
    const layer = resetLayer(prepared.layer, width, height);
    layer.translate(-left, -top);
    const masked = new Map<string, number[]>();
    for (const index of group.indices) {
      const pose = poses[index]!,
        cluster = raster.layout.clusters[index]!;
      const key =
        pose.mask === "none" && reveal >= 1
          ? "plain"
          : pose.mask === "word"
            ? `word:${cluster.wordIndex}`
            : `line:${cluster.lineIndex}`;
      const list = masked.get(key) ?? [];
      list.push(index);
      masked.set(key, list);
    }
    for (const [key, indices] of masked) {
      if (key === "plain") {
        drawIndices(layer, indices);
        continue;
      }
      const mask = resetLayer(prepared.maskLayer, width, height);
      mask.translate(-left, -top);
      drawIndices(mask, indices);
      const clusters = indices.map((i) => raster.layout.clusters[i]!),
        box = clusterBox(clusters),
        pose = poses[indices[0]!]!;
      const line = raster.layout.lines[clusters[0]!.lineIndex]!;
      const feather = pose.feather * node.fontSize;
      mask.globalCompositeOperation = "destination-in";
      const vertical = pose.mask !== "none";
      const overlap = node.lineOverlap ?? 0;
      const progress = Math.max(
        0,
        Math.min(
          1,
          reveal * (1 + (raster.layout.lines.length - 1) * (1 - overlap)) -
            clusters[0]!.lineIndex * (1 - overlap),
        ),
      );
      const x = box.x - node.fontSize,
        y = vertical ? line.baseline - line.ascent : raster.top;
      const right =
        progress >= 1
          ? box.x + box.width + node.fontSize
          : box.x + box.width * progress;
      const bottom = vertical
        ? line.baseline + line.descent
        : raster.top + raster.canvas.height;
      if (progress <= 0) mask.clearRect(left, top, width, height);
      else {
        if (feather > 0 && (vertical || progress < 1)) {
          const gradient = vertical
            ? mask.createLinearGradient(0, bottom - feather, 0, bottom)
            : mask.createLinearGradient(right - feather, 0, right, 0);
          gradient.addColorStop(0, "#000000");
          gradient.addColorStop(1, "#00000000");
          mask.fillStyle = gradient;
        } else mask.fillStyle = "#000000";
        mask.fillRect(x, y, right - x, bottom - y);
      }
      mask.globalCompositeOperation = "source-over";
      layer.drawImage(prepared.maskLayer, left, top);
    }
    ctx.save();
    if (group.blur) ctx.filter = `blur(${group.blur}px)`;
    ctx.drawImage(prepared.layer, left, top);
    ctx.restore();
  }
  drawTextDecorations(
    ctx,
    node,
    raster.layout,
    frame,
    prepared.scene.fps,
    false,
    poses,
  );
}
export function typographyDrawPlan(
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
) {
  const states = prepared.nodes.get(node.id)!;
  const animators = prepared.scene.textAnimators ?? [];
  const posesFor = (r: TextRaster) =>
    evaluateTextPoses(
      node,
      r.layout,
      animators,
      Math.round(frame),
      prepared.scene,
    );
  const get = (text: string) => {
    const r = states.get(text);
    if (!r) throw new Error(`text-layout-not-prepared: ${node.id}: ${text}`);
    return r;
  };
  const displayed = resolveDisplayedText(node, frame, state.state);
  if (displayed.kind === "single") {
    const raster = get(displayed.text);
    return { kind: "single" as const, raster, poses: posesFor(raster) };
  }
  const { transition, progress: p } = displayed;
  const from = get(displayed.fromText),
    to = get(displayed.toText);
  if (transition.kind === "retype") {
    const visible = retypedClusters(from.layout, to.layout, p),
      raster = visible.layout === from.layout ? from : to,
      poses = posesFor(raster);
    poses.forEach((pose, i) => {
      if (i >= visible.count) pose.opacity = 0;
    });
    const last = raster.layout.clusters[visible.count - 1];
    return {
      kind: "retype" as const,
      raster,
      poses,
      caret: transition.caret
        ? {
            x: last ? last.x + last.advance : raster.layout.lines[0]!.x,
            y:
              (last?.baseline ?? raster.layout.lines[0]!.baseline) -
              raster.layout.capHeight,
            width: Math.max(1, node.fontSize / 30),
            height: raster.layout.capHeight,
          }
        : undefined,
    };
  }
  const before = posesFor(from),
    after = posesFor(to),
    pairs = prepared.pairs.get(pairKey(node, transition)) ?? [];
  const commonA = new Set(pairs.map(([a]) => a)),
    commonB = new Set(pairs.map(([, b]) => b));
  const rollProgress = (index: number, count: number) => {
    const lastStart = Math.min(
      transition.window.end - 1,
      transition.window.start + (count - 1) * (transition.stagger ?? 1),
    );
    const start = Math.min(
      lastStart,
      transition.window.start + index * (transition.stagger ?? 1),
    );
    return easeMotion(
      (frame - start) / Math.max(1, transition.window.end - lastStart),
      transition.easing ?? "in-out-cubic",
    );
  };
  before.forEach((pose, i) => {
    if (commonA.has(i)) return;
    const local =
      transition.kind === "roll" ? rollProgress(i, before.length) : p;
    pose.opacity *= 1 - local;
    if (transition.kind === "roll") {
      pose.y -= local * from.layout.lineHeight;
      pose.mask = "line";
    }
  });
  after.forEach((pose, i) => {
    const local =
      transition.kind === "roll" && !commonB.has(i)
        ? rollProgress(i, after.length)
        : p;
    pose.opacity *= local;
    if (transition.kind === "roll") {
      pose.y += (1 - local) * to.layout.lineHeight;
      pose.mask = "line";
    }
  });
  for (const [a, b] of pairs) {
    const dx = to.layout.clusters[b]!.x - from.layout.clusters[a]!.x,
      dy = to.layout.clusters[b]!.baseline - from.layout.clusters[a]!.baseline;
    const canSlide =
      Math.hypot(dx, dy) <=
      (prepared.slideLimits.get(pairKey(node, transition)) ?? 0);
    const motionX = canSlide ? dx : 0,
      motionY = canSlide ? dy : 0;
    before[a]!.x += motionX * p;
    before[a]!.y += motionY * p;
    before[a]!.opacity *= 1 - p;
    after[b]!.x -= motionX * (1 - p);
    after[b]!.y -= motionY * (1 - p);
    if (transition.kind === "roll") {
      after[b]!.y -= (1 - p) * to.layout.lineHeight;
      after[b]!.mask = "none";
    }
  }
  return { kind: "blend" as const, from, to, before, after };
}

/**
 * ET5a: indices of `node.decorations` that paint at `frame` while every glyph
 * they decorate is transparent (text-animator opacity, word reveal or the
 * layer's reveal), using the same draw plan and poses as the renderer.
 */
export function typographyOrphanedDecorations(
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
) {
  const marks = node.decorations ?? [];
  if (!marks.length) return [];
  const plan = typographyDrawPlan(node, state, prepared, frame);
  const draws =
    plan.kind === "blend"
      ? [
          { raster: plan.from, poses: plan.before },
          { raster: plan.to, poses: plan.after },
        ]
      : [{ raster: plan.raster, poses: plan.poses }];
  const painted = new Set<number>(),
    inked = new Set<number>();
  for (const { raster, poses } of draws) {
    const revealed = typographyRevealPoses(node, raster, poses, state.reveal);
    for (const [index, mark] of marks.entries()) {
      const behind = mark.kind === "highlight";
      // Highlights draw before the word reveal adjusts poses, other marks after.
      const segments = decorationSegments(
        node,
        raster.layout,
        mark,
        behind ? poses : revealed.poses,
      );
      const reveal = decorationReveal(mark, frame, prepared.scene.fps);
      if (
        reveal > 0 &&
        segments.some(
          (segment) =>
            segment.width > 0 &&
            (!decorationFadesWithText(mark) || segment.opacity > 0),
        )
      )
        painted.add(index);
      if (
        revealed.reveal > 0 &&
        raster.layout.clusters.some(
          (cluster, i) =>
            /\S/u.test(cluster.text) &&
            (!mark.span || node.spans?.[cluster.spanIndex]?.id === mark.span) &&
            (revealed.poses[i]?.opacity ?? 0) > 0,
        )
      )
        inked.add(index);
    }
  }
  return [...painted].filter((index) => !inked.has(index));
}
/**
 * ET6b reading motion: where each visible glyph is drawn at `frame`, after
 * text animators and the word reveal, in layer-local pixels: its centre and
 * the two ends of its advance, through the transform the glyph is drawn with
 * (`glyphMotionFromPoses`). Undefined while two copies blend.
 */
export function typographyGlyphMotion(
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
) {
  const plan = typographyDrawPlan(node, state, prepared, frame);
  if (plan.kind !== "single") return undefined;
  const { poses } = typographyRevealPoses(
    node,
    plan.raster,
    plan.poses,
    state.reveal,
  );
  return glyphMotionFromPoses(plan.raster.layout, poses);
}
/**
 * Where `posedClusterTransform` draws the layout point `x`, `y` of a posed
 * cluster: scaled, skewed and rotated about the pose anchor, then offset.
 * A word, line or whole-layer anchor is shared by its glyphs, so they move
 * apart as it scales and swing round it as it turns.
 */
export function posedGlyphPoint(
  pose: Pick<
    TextPose,
    "anchorX" | "anchorY" | "x" | "y" | "scale" | "rotation" | "skew"
  >,
  x: number,
  y: number,
): [number, number] {
  const dx = x - pose.anchorX,
    dy = y - pose.anchorY,
    sx = pose.scale * dx + Math.tan((pose.skew * Math.PI) / 180) * dy,
    sy = pose.scale * dy,
    angle = (pose.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return [
    pose.anchorX + pose.x + cos * sx - sin * sy,
    pose.anchorY + pose.y + sin * sx + cos * sy,
  ];
}
/**
 * ET6b: the reading-motion evidence of posed clusters. Each visible glyph
 * gives three points, mapped as it is drawn (`posedGlyphPoint`): the centre
 * of its advance at half cap height above its baseline, and the two ends of
 * its advance at that height.
 */
export function glyphMotionFromPoses(
  layout: ShapedLayout,
  poses: readonly TextPose[],
) {
  const points: number[] = [];
  let opacity = 1,
    blur = 0,
    strokeWidth = Infinity;
  layout.clusters.forEach((cluster, i) => {
    const pose = poses[i];
    if (!pose || !/\S/u.test(cluster.text)) return;
    const y = cluster.baseline - layout.capHeight / 2;
    for (const x of [
      cluster.x + cluster.advance / 2,
      cluster.x,
      cluster.x + cluster.advance,
    ])
      points.push(...posedGlyphPoint(pose, x, y));
    opacity = Math.min(opacity, pose.opacity);
    blur = Math.max(blur, pose.blur);
    strokeWidth = Math.min(strokeWidth, pose.strokeWidth * pose.scale);
  });
  return {
    capHeight: layout.capHeight,
    points,
    opacity,
    blur,
    strokeWidth: strokeWidth === Infinity ? 0 : strokeWidth,
  };
}
function drawTypographyContent(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
) {
  const plan = typographyDrawPlan(node, state, prepared, frame);
  if (plan.kind !== "blend") {
    drawRaster(
      ctx,
      node,
      plan.raster,
      plan.poses,
      prepared,
      frame,
      state.reveal,
    );
    if (plan.kind === "retype" && plan.caret) {
      ctx.fillStyle = node.color;
      ctx.fillRect(
        plan.caret.x,
        plan.caret.y,
        plan.caret.width,
        plan.caret.height,
      );
    }
    return;
  }
  const { from, to, before, after } = plan;
  const margin = node.fontSize * 4,
    left = Math.min(from.left, to.left) - margin,
    top = Math.min(from.top, to.top) - margin;
  const width = Math.ceil(
      Math.max(from.left + from.canvas.width, to.left + to.canvas.width) -
        left +
        margin,
    ),
    height = Math.ceil(
      Math.max(from.top + from.canvas.height, to.top + to.canvas.height) -
        top +
        margin,
    );
  const blend = resetLayer(prepared.transitionLayer, width, height);
  blend.translate(-left, -top);
  drawRaster(blend, node, from, before, prepared, frame, state.reveal);
  blend.globalCompositeOperation = "lighter";
  drawRaster(blend, node, to, after, prepared, frame, state.reveal);
  blend.globalCompositeOperation = "source-over";
  ctx.drawImage(prepared.transitionLayer, left, top);
}
/** Request the exact evaluated glyph colours before any parent surface lease is held. */
export function prepareTypographyColors(
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
) {
  const prepare = (
    node: TextNode,
    raster: TextRaster,
    animators: TextAnimator[],
  ) => {
    const poses = evaluateTextPoses(
      node,
      raster.layout,
      animators,
      Math.round(frame),
      prepared.scene,
    );
    for (const [index, pose] of poses.entries()) {
      if (pose.opacity <= 0) continue;
      const target = axisRaster(raster, pose.axes);
      const cluster = target.layout.clusters[index]!;
      const width = quantizeStrokeWidth(pose.strokeWidth);
      if (width > 0) strokedRaster(target, width, pose.stroke);
      if (
        pose.fill !==
        (target.colorCoverage
          ? "#ffffff"
          : (node.spans?.[cluster.spanIndex]?.color ?? node.color))
      )
        coloredRaster(target, pose.fill);
    }
  };
  const displayed = resolveDisplayedText(node, frame, state.state);
  const texts =
    displayed.kind === "single"
      ? [displayed.text]
      : [displayed.fromText, displayed.toText];
  for (const text of new Set(texts)) {
    const raster = prepared.nodes.get(node.id)?.get(text);
    if (!raster) throw Error(`text-layout-not-prepared: ${node.id}: ${text}`);
    prepare(node, raster, prepared.scene.textAnimators ?? []);
  }
  for (const correction of prepared.corrections.get(node.id) ?? [])
    if (frame > correction.start)
      prepare(correction.node, correction.raster, []);
}

export function resolveTypographyNodes<T extends TextEventScene>(scene: T): T {
  if (!scene.typography) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((node) => {
      if (node.type !== "text") return node;
      const style = resolvedTextStyle(node, scene.textStyles ?? {});
      return { ...node, fontAsset: style.fontAsset!, fontSize: style.size! };
    }),
  };
}
export function typographyAnimators(scene: {
  textAnimators?: TextAnimator[] | undefined;
}) {
  return scene.textAnimators ?? [];
}
export type TypographyStyles = Record<string, TextStyle>;

export function drawTypography(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  state: { state: number; reveal: number },
  prepared: PreparedTypography,
  frame: number,
  probe?: "ink-only" | "container-only",
) {
  ctx.save();
  // Containers sit behind the type and outside its overflow clip, as in the legacy renderer.
  if (node.container && state.reveal > 0 && probe !== "ink-only")
    drawTextContainerShape(
      ctx,
      node.container,
      displayedContainerContent(node, prepared, frame, state.state),
    );
  if (probe === "container-only") {
    ctx.restore();
    return;
  }
  if (node.textLayout?.overflow === "clip") {
    const width = node.textLayout.width,
      left =
        node.align === "center"
          ? -width / 2
          : node.align === "right"
            ? -width
            : 0;
    ctx.beginPath();
    ctx.rect(left, 0, width, node.textLayout.height);
    ctx.clip();
  }
  drawTypographyContent(ctx, node, state, prepared, frame);
  for (const correction of prepared.corrections.get(node.id) ?? []) {
    const p = easeMotion(
      (frame - correction.start) /
        Math.max(1, correction.end - correction.start),
      "out-cubic",
    );
    if (p <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(correction.x, correction.y + (1 - p) * node.fontSize * 0.15);
    const poses = evaluateTextPoses(
      correction.node,
      correction.raster.layout,
      [],
      frame,
      prepared.scene,
    );
    drawRaster(
      ctx,
      correction.node,
      correction.raster,
      poses,
      prepared,
      frame,
      state.reveal,
    );
    ctx.restore();
  }
  ctx.restore();
}
