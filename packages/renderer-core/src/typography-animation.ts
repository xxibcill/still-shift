import type {
  TextAnimator,
  Signal,
} from "../../scene-contract/src/motion-craft.ts";
import type { ShapedLayout, GlyphCluster } from "./shaped-text.ts";
import { easeMotion } from "./motion-easing.ts";
import { sampleCurve } from "./curve.ts";
import {
  sampleSignal,
  scalarKeys,
  layerOrder,
  blendValue,
} from "./motion-craft.ts";
import { interpolateColor } from "./motion-appearance.ts";
import type { TextNode } from "./typography-style.ts";

type Selector = TextAnimator["selector"];
export type TextPose = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  skew: number;
  opacity: number;
  blur: number;
  tracking: number;
  leading: number;
  baselineShift: number;
  strokeWidth: number;
  fill: string;
  stroke: string;
  axes: Record<string, number>;
  anchorX: number;
  anchorY: number;
  mask: "none" | "line" | "word";
  feather: number;
};
export type TextAnimationContext = {
  fps: number;
  signals?: Signal[] | undefined;
  /** Rounded layer times reachable through composition clocks, by node id. */
  animationFrames?: Readonly<Record<string, readonly number[]>> | undefined;
};
export function* textAnimationFrames(
  scene: TextAnimationContext & { frameCount: number },
  node: TextNode,
): Generator<number> {
  if (Object.hasOwn(scene.animationFrames ?? {}, node.id)) {
    yield* scene.animationFrames![node.id]!;
    return;
  }
  for (let frame = 0; frame < scene.frameCount; frame++) yield frame;
}
export function textAnimatorSettleFrame(animator: TextAnimator) {
  return Math.max(
    animator.end,
    ...(animator.weight ?? []).map((key) => key.frame),
  );
}
export function selectorValue(
  value: Selector["start"] | undefined,
  frame: number,
  context: TextAnimationContext,
): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  if (Array.isArray(value))
    return sampleCurve(scalarKeys(value), frame, context.fps);
  const signal = context.signals?.find((s) => s.id === value.signal);
  if (!signal) throw new Error(`motion-missing-signal: ${value.signal}`);
  return (
    sampleSignal(signal, frame, context.fps) * (value.scale ?? 1) +
    (value.offset ?? 0)
  );
}
function hash(seed: number, index: number) {
  let x = Math.imul(index + 1, 0x9e3779b1) ^ seed;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
export function textOrder(count: number, selector: Selector): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  if (selector.order === "reverse") order.reverse();
  if (selector.order === "center-out")
    order.sort(
      (a, b) =>
        Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2) || a - b,
    );
  if (selector.order === "seeded")
    order.sort(
      (a, b) =>
        hash(selector.seed ?? 0, a) - hash(selector.seed ?? 0, b) || a - b,
    );
  return order;
}
export function selectorAmount(
  selector: Selector,
  index: number,
  count: number,
  frame: number,
  context: TextAnimationContext,
) {
  const offset = selectorValue(selector.offset, frame, context),
    start = selectorValue(selector.start, frame, context) + offset,
    end = selectorValue(selector.end, frame, context) + offset;
  const position = count <= 1 ? 0.5 : index / (count - 1);
  if (position < start || position > end) return 0;
  const x = end > start ? (position - start) / (end - start) : 1;
  let amount =
    selector.shape === "ramp" || selector.shape === "ramp-up"
      ? x
      : selector.shape === "ramp-down"
        ? 1 - x
        : selector.shape === "triangle"
          ? 1 - Math.abs(x * 2 - 1)
          : selector.shape === "round"
            ? Math.sqrt(Math.max(0, 1 - (x * 2 - 1) ** 2))
            : selector.shape === "smooth"
              ? Math.sin(Math.PI * x) ** 2
              : 1;
  amount = amount ** (1 + (selector.easeLow ?? 0) / 25);
  return 1 - (1 - amount) ** (1 + (selector.easeHigh ?? 0) / 25);
}
function groupsFor(layout: ShapedLayout, indices: number[], grouping: string) {
  const groups = new Map<number, number[]>();
  for (const index of indices) {
    const c = layout.clusters[index]!;
    const key =
      grouping === "all"
        ? 0
        : grouping === "line" || grouping === "lines"
          ? c.lineIndex
          : grouping === "word" || grouping === "words"
            ? c.wordIndex
            : index;
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function clusterBox(clusters: GlyphCluster[], ink = false) {
  const boxes = clusters.map((c) =>
    ink && c.ink
      ? c.ink
      : {
          x: c.x,
          y: c.baseline - c.ascent,
          width: c.advance,
          height: c.ascent + c.descent,
        },
  );
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
export function evaluateTextPoses(
  node: TextNode,
  layout: ShapedLayout,
  animators: TextAnimator[],
  frame: number,
  context: TextAnimationContext,
): TextPose[] {
  const poses: TextPose[] = layout.clusters.map((c) => ({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    skew: 0,
    opacity: 1,
    blur: 0,
    tracking: 0,
    leading: 0,
    baselineShift: 0,
    strokeWidth: 0,
    fill: node.spans?.[c.spanIndex]?.color ?? node.color,
    stroke: node.color,
    axes: {},
    anchorX: c.x + c.advance / 2,
    anchorY: c.baseline - layout.capHeight / 2,
    mask: "none",
    feather: node.feather ?? 0.35,
  }));
  const sorted = animators
    .filter((a) => a.node === node.id)
    .map((a, i) => ({ a, i }))
    .sort(
      (a, b) =>
        layerOrder.indexOf(a.a.layer ?? "action") -
          layerOrder.indexOf(b.a.layer ?? "action") ||
        a.a.start - b.a.start ||
        a.i - b.i,
    );
  for (const { a } of sorted) {
    // A held destination begins at start; entrances with no destination own their hidden pre-roll.
    if (frame < a.start && a.to) continue;
    const eligible = layout.clusters.flatMap((c, i) =>
      ((a.excludeSpaces ?? true) && /^\s*$/u.test(c.text)) ||
      (a.span && node.spans?.[c.spanIndex]?.id !== a.span)
        ? []
        : [i],
    );
    const units = groupsFor(layout, eligible, a.unit),
      order = textOrder(units.length, a.selector);
    const anchors = groupsFor(layout, eligible, a.anchor ?? a.unit);
    const selectors = [a.selector, ...(a.selectors ?? [])];
    const weights = new Map<number, number>();
    for (const [selectorIndex, selector] of selectors.entries()) {
      const groups = groupsFor(layout, eligible, selector.basedOn ?? a.unit);
      const selectorRank = textOrder(groups.length, selector).reduce<number[]>(
        (ranks, group, rank) => {
          ranks[group] = rank;
          return ranks;
        },
        [],
      );
      groups.forEach((indices, index) =>
        indices.forEach((i) => {
          const value = selectorAmount(
              selector,
              selectorRank[index]!,
              groups.length,
              frame,
              context,
            ),
            before = weights.get(i) ?? 0;
          weights.set(
            i,
            !selectorIndex
              ? value
              : selector.mode === "intersect"
                ? before * value
                : Math.min(1, before + value),
          );
        }),
      );
    }
    const stagger =
      a.unit === "line" && a.lineOverlap !== undefined
        ? Math.round(
            ((a.end - a.start) * (1 - a.lineOverlap)) /
              Math.max(1, units.length),
          )
        : a.stagger;
    const lastStart = Math.min(
      a.end - 1,
      a.start + Math.max(0, units.length - 1) * stagger,
    );
    const layerWeight = a.weight
      ? sampleCurve(scalarKeys(a.weight), frame, context.fps)
      : 1;
    const signal = a.signal
      ? context.signals?.find((s) => s.id === a.signal)
      : undefined;
    if (a.signal && !signal)
      throw new Error(`motion-missing-signal: ${a.signal}`);
    for (const [index, indices] of units.entries()) {
      const rank = order.indexOf(index);
      const start = Math.min(lastStart, a.start + rank * stagger);
      const p = signal
        ? Math.max(0, Math.min(1, sampleSignal(signal, frame, context.fps)))
        : easeMotion(
            (frame - start) / Math.max(1, a.end - lastStart),
            a.selector.easing ?? "in-out-cubic",
          );
      for (const i of indices) {
        const pose = poses[i]!,
          weight = (weights.get(i) ?? 0) * layerWeight;
        const blend =
          a.blend ??
          (a.layer === "current" || a.layer === "carrier" ? "add" : "replace");
        const neutral = (key: string) =>
          key === "opacity" || key === "scale" ? 1 : 0;
        for (const key of [
          "opacity",
          "scale",
          "rotation",
          "blur",
          "tracking",
          "leading",
          "skew",
          "baselineShift",
          "strokeWidth",
        ] as const) {
          if (a.from[key] === undefined && a.to?.[key] === undefined) continue;
          const rest = neutral(key),
            from = a.from[key] ?? rest,
            to = a.to?.[key] ?? rest,
            value = from + (to - from) * p;
          pose[key] = blendValue(
            pose[key],
            blend === "add" ? value - rest : value,
            blend,
            weight,
          );
        }
        if (a.from.offset || a.to?.offset) {
          const from = a.from.offset ?? [0, 0],
            to = a.to?.offset ?? [0, 0];
          pose.x = blendValue(
            pose.x,
            from[0] + (to[0] - from[0]) * p,
            blend,
            weight,
          );
          pose.y = blendValue(
            pose.y,
            from[1] + (to[1] - from[1]) * p,
            blend,
            weight,
          );
        }
        for (const key of ["fill", "stroke"] as const) {
          const from =
              a.from[key] ?? (key === "fill" ? a.from.color : undefined),
            to = a.to?.[key] ?? (key === "fill" ? a.to?.color : undefined);
          if (from || to)
            pose[key] = interpolateColor(
              pose[key],
              interpolateColor(from ?? pose[key], to ?? pose[key], p),
              weight,
            );
        }
        for (const tag of new Set([
          ...Object.keys(a.from.axes ?? {}),
          ...Object.keys(a.to?.axes ?? {}),
        ])) {
          const from = a.from.axes?.[tag] ?? 0,
            to = a.to?.axes?.[tag] ?? 0;
          pose.axes[tag] = blendValue(
            pose.axes[tag] ?? 0,
            from + (to - from) * p,
            blend,
            weight,
          );
        }
        const group = anchors.find((g) => g.includes(i)) ?? [i],
          box = clusterBox(
            group.map((i) => layout.clusters[i]!),
            true,
          );
        pose.anchorX = box.x + box.width * (a.anchorAlign?.[0] ?? 0.5);
        pose.anchorY = a.anchorAlign
          ? box.y + box.height * a.anchorAlign[1]
          : (Math.min(...group.map((j) => layout.clusters[j]!.baseline)) +
              Math.max(...group.map((j) => layout.clusters[j]!.baseline)) -
              layout.capHeight) /
            2;
        if (
          a.mask &&
          a.mask !== "none" &&
          (p < 1 || (a.to?.offset?.some((v) => v !== 0) ?? false))
        ) {
          pose.mask = a.mask;
          pose.feather = a.feather ?? 0.35;
        }
      }
    }
  }
  for (const line of layout.lines) {
    const indices = line.clusters;
    let shift = 0;
    const offsets = indices.map((i) => {
      const x = shift;
      shift +=
        (poses[i]!.tracking *
          (layout.runs[layout.clusters[i]!.runIndex]!.style.size ??
            node.fontSize)) /
        1000;
      return x;
    });
    indices.forEach((i, j) => {
      const p = poses[i]!,
        c = layout.clusters[i]!;
      p.x +=
        offsets[j]! -
        (node.align === "center"
          ? shift / 2
          : node.align === "right"
            ? shift
            : 0);
      p.y += p.leading * node.fontSize * c.lineIndex - p.baselineShift;
    });
  }
  return poses;
}
