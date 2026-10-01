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
  clusterBox,
  type TextPose,
  type TextAnimationContext,
} from "./typography-animation.ts";
import {
  commonClusters,
  countText,
  retypedClusters,
  reserveCountWidth,
  resolveDisplayedText,
  transitionSlideLimit,
} from "./typography-transition.ts";
import { drawTextDecorations } from "./typography-decorations.ts";
import { drawTextContainerShape } from "./text-container.ts";
import type { Rect } from "./text-container-layout.ts";
import { componentTextVariants } from "./component-values.ts";
import { textVisibility } from "./typography-visibility.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";

export type TextRaster = {
  layout: ShapedLayout;
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  colors: Map<string, HTMLCanvasElement>;
  strokes: Map<string, HTMLCanvasElement>;
  fonts: Map<string, LoadedFont>;
  variants: Map<string, TextRaster>;
  /** Colour baked into unspanned clusters when it can differ from the drawn node's
   * colour (animated composition text). Unset rasters compare with `node.color`. */
  baseColor?: string;
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
const surface = (width: number, height: number) => {
  if (width * height > 32_000_000 || width > 16384 || height > 16384)
    throw new Error("text-raster-budget: text layer exceeds 32 megapixels");
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
};
export function rasterizeText(
  node: TextNode,
  layout: ShapedLayout,
  fonts: Map<string, LoadedFont>,
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
  const canvas = surface(
      right - left + pad,
      layout.top + layout.height - top + pad,
    ),
    ctx = canvas.getContext("2d")!;
  ctx.translate(-left, -top);
  for (const run of layout.runs) {
    applyTextStyle(ctx, run.style, fonts);
    const first = run.clusters[0]!,
      last = run.clusters.at(-1)!;
    const colors = [
      ...new Set(
        run.clusters.map(
          (i) =>
            node.spans?.[layout.clusters[i]!.spanIndex]?.color ?? node.color,
        ),
      ),
    ];
    for (const color of colors) {
      ctx.save();
      ctx.beginPath();
      for (const i of run.clusters) {
        const cluster = layout.clusters[i]!;
        if ((node.spans?.[cluster.spanIndex]?.color ?? node.color) !== color)
          continue;
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
  return {
    layout,
    canvas,
    left,
    top,
    colors: new Map(),
    strokes: new Map(),
    fonts,
    variants: new Map(),
  };
}
export function prepareTypography(
  scene: StoryRenderScene | CommerceRenderScene,
  fonts: Map<string, LoadedFont>,
): PreparedTypography {
  const nodes = new Map<string, Map<string, TextRaster>>(),
    pairs = new Map<string, [number, number][]>(),
    slideLimits = new Map<string, number>();
  const ctx = surface(1, 1).getContext("2d")!;
  let pixels = 0;
  const reserveCanvas = (canvas: HTMLCanvasElement) => {
    pixels += canvas.width * canvas.height;
    if (pixels > 128_000_000)
      throw new Error("text-raster-budget: scene exceeds 128 megapixels");
    return canvas;
  };
  const reserveRaster = (raster: TextRaster) => {
    reserveCanvas(raster.canvas);
    return raster;
  };
  for (const node of scene.nodes) {
    if (node.type !== "text") continue;
    const values = new Set([
      node.text,
      ...(node.states ?? []),
      ...componentTextVariants(scene, node),
    ]);
    for (const t of node.transitions ??
      (node.transition ? [node.transition] : []))
      if (t.kind === "count")
        for (let frame = t.window.start; frame <= t.window.end; frame++)
          values.add(countText(node, t, frame));
    if (values.size > 10000)
      throw new Error("text-layout-budget: more than 10000 states");
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
      rasters.set(text, reserveRaster(rasterizeText(node, layout, fonts)));
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
          reserveRaster(rasterizeText(node, layout, fonts)),
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
      for (const { frame, texts } of textVisibility(
        scene,
        node,
        layoutsByText,
      )) {
        for (const text of new Set([...staticValues, ...texts])) {
          const raster = rasters.get(text);
          if (!raster)
            throw new Error(`text-layout-not-prepared: ${node.id}: ${text}`);
          const poses = evaluateTextPoses(
            node,
            raster.layout,
            scene.textAnimators ?? [],
            frame,
            scene,
          );
          for (const pose of poses) {
            const width = quantizeStrokeWidth(pose.strokeWidth);
            if (pose.opacity <= 0 || width <= 0) continue;
            const target = axisRaster(raster, pose.axes);
            const strokeKey = `${width}:${pose.stroke}`;
            if (!target.strokes.has(strokeKey))
              target.strokes.set(
                strokeKey,
                reserveCanvas(renderStrokedRaster(target, width, pose.stroke)),
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
    const raster = reserveRaster(rasterizeText(replacement, layout, fonts));
    const entries = corrections.get(node.id) ?? [];
    entries.push({
      node: replacement,
      raster,
      start: event.start + Math.floor(event.duration / 2),
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
    layer: surface(1, 1),
    maskLayer: surface(1, 1),
    transitionLayer: surface(1, 1),
  };
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
function displayedContainerContent(
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
function coloredRaster(raster: TextRaster, color: string) {
  let canvas = raster.colors.get(color);
  if (!canvas) {
    canvas = surface(raster.canvas.width, raster.canvas.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(raster.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (raster.colors.size >= 16)
      raster.colors.delete(raster.colors.keys().next().value!);
    raster.colors.set(color, canvas);
  }
  return canvas;
}
function renderStrokedRaster(raster: TextRaster, width: number, color: string) {
  const canvas = surface(raster.canvas.width, raster.canvas.height);
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
  const canvas = raster.strokes.get(`${width}:${color}`);
  if (!canvas)
    throw new Error("text-stroke-not-prepared: missing cached outline");
  return canvas;
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
      (node.spans?.[cluster.spanIndex]?.color ?? raster.baseColor ?? node.color)
      ? raster.canvas
      : coloredRaster(raster, pose.fill),
  );
  ctx.restore();
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
        indices.forEach((i) => drawCluster(layer, node, raster, i, poses[i]!));
        continue;
      }
      const mask = resetLayer(prepared.maskLayer, width, height);
      mask.translate(-left, -top);
      indices.forEach((i) => drawCluster(mask, node, raster, i, poses[i]!));
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
        y = vertical ? line.baseline - raster.layout.ascent : raster.top;
      const right =
        progress >= 1
          ? box.x + box.width + node.fontSize
          : box.x + box.width * progress;
      const bottom = vertical
        ? line.baseline + raster.layout.descent
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
function drawTypographyContent(
  ctx: CanvasRenderingContext2D,
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
    drawRaster(
      ctx,
      node,
      raster,
      posesFor(raster),
      prepared,
      frame,
      state.reveal,
    );
    return;
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
    drawRaster(ctx, node, raster, poses, prepared, frame, state.reveal);
    if (transition.caret) {
      const last = raster.layout.clusters[visible.count - 1];
      ctx.fillStyle = node.color;
      ctx.fillRect(
        last ? last.x + last.advance : raster.layout.lines[0]!.x,
        (last?.baseline ?? raster.layout.lines[0]!.baseline) -
          raster.layout.capHeight,
        Math.max(1, node.fontSize / 30),
        raster.layout.capHeight,
      );
    }
    return;
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
