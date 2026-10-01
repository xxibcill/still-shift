import { MotionLayerSchema } from "../motion-craft.ts";
import type { MotionEasing } from "../motion-easing.ts";
import type { TextStyle } from "../typography.ts";
import type {
  Composition,
  CompositionAsset,
  CompositionScope,
} from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import type { IssueReporter } from "./primitives.ts";

type Bounds = readonly [number, number];
type Animator = NonNullable<CompositionScope["textAnimators"]>[number];
type TextLayer = Extract<CompositionLayer, { type: "text" }>;
type Path = (string | number)[];
const boundsOf = (...values: number[]): Bounds => [
  Math.min(...values),
  Math.max(...values),
];
const backBounds = (overshoot: number): Bounds => [
  0,
  1 + (4 * overshoot ** 3) / (27 * (overshoot + 1) ** 2),
];

/** Conservative progress bounds, including authored overshoot. */
function easingBounds(easing: MotionEasing | undefined): Bounds {
  if (typeof easing === "object") {
    if ("bezier" in easing)
      return boundsOf(0, 1, easing.bezier[1], easing.bezier[3]);
    // A damped step response is 0–2; the renderer's terminal correction adds at most ±1.
    if ("spring" in easing) return [-1, 3];
    return backBounds(easing.overshoot);
  }
  if (easing === "out-back") return backBounds(1.70158);
  if (easing === "out-back-soft") return backBounds(0.6);
  if (easing === "anticipate") return [-0.06, 1];
  return [0, 1];
}

const interpolateBounds = (from: number, to: number, progress: Bounds) =>
  boundsOf(from + (to - from) * progress[0], from + (to - from) * progress[1]);

function weightBounds(animator: Animator): Bounds {
  const keys = animator.weight;
  if (!keys) return [0, 1];
  let result = boundsOf(0, ...keys.map((key) => key.value));
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!,
      b = keys[i]!;
    const duration = b.frame - a.frame;
    if (duration <= 0 || b.interpolation === "hold") continue;
    const smooth = (key: typeof a) =>
      key.smooth || key.interpolation === "smooth";
    let segment: Bounds;
    if (a.out || b.in) {
      // Monotone smoothing limits each tangent to three times the segment slope.
      const tangent = (3 * Math.abs(b.value - a.value)) / duration;
      const outgoing =
        a.out?.speed === undefined
          ? smooth(a)
            ? ([-tangent, tangent] as const)
            : ([0, 0] as const)
          : ([a.out.speed, a.out.speed] as const);
      const incoming =
        b.in?.speed === undefined
          ? smooth(b)
            ? ([-tangent, tangent] as const)
            : ([0, 0] as const)
          : ([b.in.speed, b.in.speed] as const);
      segment = boundsOf(
        a.value,
        b.value,
        ...outgoing.map(
          (speed) => a.value + speed * duration * (a.out?.ease ?? 1 / 3),
        ),
        ...incoming.map(
          (speed) => b.value - speed * duration * (b.in?.ease ?? 1 / 3),
        ),
      );
    } else if (smooth(a) || smooth(b)) {
      segment = boundsOf(a.value, b.value);
    } else {
      const easing =
        b.interpolation === "linear"
          ? "linear"
          : b.bezier
            ? { bezier: b.bezier }
            : b.easing;
      segment = interpolateBounds(a.value, b.value, easingBounds(easing));
    }
    result = boundsOf(...result, ...segment);
  }
  return result;
}

/** Blend extrema occur at the corners of the input intervals. */
function blendBounds(
  base: Bounds,
  value: Bounds,
  weight: Bounds,
  blend: Animator["blend"],
): Bounds {
  const values: number[] = [];
  for (const before of base)
    for (const delta of value)
      for (const amount of weight) {
        values.push(
          blend === "add"
            ? before + delta * amount
            : blend === "multiply"
              ? before * (1 + (delta - 1) * amount)
              : before + (delta - before) * amount,
        );
      }
  return boundsOf(...values);
}

function declaredStyle(
  comp: Composition,
  id: string | undefined,
): TextStyle | undefined {
  return id && comp.textStyles && Object.hasOwn(comp.textStyles, id)
    ? comp.textStyles[id]
    : undefined;
}

function textRegions(comp: Composition, node: TextLayer) {
  const base = {
    fontAsset: node.fontAsset,
    ...declaredStyle(comp, node.style),
  };
  const regions = (node.spans ?? []).map((span) => ({
    span: span.id,
    style: { ...base, ...declaredStyle(comp, span.style) },
    deltas: new Map<string, Bounds>(),
  }));
  let locale = node.locale ?? node.textBox?.locale ?? "en";
  try {
    new Intl.Segmenter(locale);
  } catch {
    locale = "en";
  }
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const length = Math.max(
    ...[node.text, ...(node.states ?? [])].map(
      (text) => [...segmenter.segment(text)].length,
    ),
  );
  const covered = (node.spans ?? []).reduce(
    (sum, span) => sum + span.end - span.start,
    0,
  );
  if (covered < length)
    regions.push({ span: undefined, style: base, deltas: new Map() });
  return regions;
}

function axisPath(animator: Animator, axis: string): Path {
  const from = animator.from.axes?.[axis],
    to = animator.to?.axes?.[axis];
  const side =
    from === undefined || (to !== undefined && Math.abs(to) > Math.abs(from))
      ? "to"
      : "from";
  return [side, "axes", axis];
}

/** Validate the envelope of stacked animator deltas for each effective text style. */
export function checkTextAnimatorAxes(
  comp: Composition,
  scope: CompositionScope,
  base: Path,
  fail: IssueReporter,
  assets: Map<string, CompositionAsset>,
) {
  const animators = (scope.textAnimators ?? [])
    .map((animator, index) => ({ animator, index }))
    .filter(({ animator }) => animator.from.axes || animator.to?.axes)
    .sort(
      (a, b) =>
        MotionLayerSchema.options.indexOf(a.animator.layer ?? "action") -
          MotionLayerSchema.options.indexOf(b.animator.layer ?? "action") ||
        a.animator.start - b.animator.start ||
        a.index - b.index,
    );
  const targets = new Set(animators.map(({ animator }) => animator.node));
  const animatedLayers = new Map(
    scope.layers
      .filter(
        (node): node is TextLayer =>
          node.type === "text" && targets.has(node.id),
      )
      .map((node) => [node.id, { regions: textRegions(comp, node) }]),
  );
  for (const { animator, index } of animators) {
    const entry = animatedLayers.get(animator.node);
    if (!entry) continue;
    const progress = animator.signal
      ? ([0, 1] as const)
      : easingBounds(animator.selector.easing);
    const weight = weightBounds(animator);
    const blend =
      animator.blend ??
      (animator.layer === "current" || animator.layer === "carrier"
        ? "add"
        : "replace");
    for (const axis of new Set([
      ...Object.keys(animator.from.axes ?? {}),
      ...Object.keys(animator.to?.axes ?? {}),
    ])) {
      const path = [
        ...base,
        "textAnimators",
        index,
        ...axisPath(animator, axis),
      ];
      const delta = interpolateBounds(
        animator.from.axes?.[axis] ?? 0,
        animator.to?.axes?.[axis] ?? 0,
        progress,
      );
      for (const region of entry.regions) {
        if (animator.span && animator.span !== region.span) continue;
        const font = assets.get(region.style.fontAsset ?? "");
        const range = font?.type === "font" ? font.variable?.[axis] : undefined;
        if (!range) {
          fail(
            "comp-text-font-axis",
            path,
            `animator axis ${axis} requires that axis on every affected pinned font`,
          );
          continue;
        }
        const combined = blendBounds(
          region.deltas.get(axis) ?? [0, 0],
          delta,
          weight,
          blend,
        );
        region.deltas.set(axis, combined);
        const initial = region.style.axes?.[axis] ?? range.default;
        const low = Math.round((initial + combined[0]) * 1e6) / 1e6;
        const high = Math.round((initial + combined[1]) * 1e6) / 1e6;
        if (low < range.min || high > range.max)
          fail(
            "comp-text-font-axis",
            path,
            `animator axis ${axis} may reach ${low}–${high}, outside the pinned font's ${range.min}–${range.max} range`,
          );
      }
    }
  }
}
