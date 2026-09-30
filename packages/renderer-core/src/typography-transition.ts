import type { TextTransition } from "../../scene-contract/src/typography.ts";
import type { ShapedLayout } from "./shaped-text.ts";
import type { TextNode } from "./typography-style.ts";
import { easeMotion } from "./motion-easing.ts";

export function commonClusters(a: string[], b: string[]): [number, number][] {
  const rows = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      rows[i]![j] =
        a[i] === b[j]
          ? rows[i + 1]![j + 1]! + 1
          : Math.max(rows[i + 1]![j]!, rows[i]![j + 1]!);
  const pairs: [number, number][] = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i++, j++]);
    } else if (rows[i + 1]![j]! >= rows[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}
/** Reserve one width for a count without moving its authored alignment anchor. */
export function reserveCountWidth(layouts: Iterable<ShapedLayout>) {
  const values = [...layouts];
  const maxWidth = Math.max(...values.map((layout) => layout.width));
  for (const layout of values) layout.width = maxWidth;
}
export function activeTextTransition(node: TextNode, frame: number) {
  return (node.transitions ?? (node.transition ? [node.transition] : [])).find(
    (t) => frame >= t.window.start && frame < t.window.end,
  );
}
export function textStateAtFrame(node: TextNode, frame: number, state: number) {
  let resolved = state;
  for (const t of node.transitions ??
    (node.transition ? [node.transition] : [])) {
    if (frame < t.window.start) break;
    resolved = frame < t.window.end ? (t.fromState ?? 0) : (t.toState ?? 1);
  }
  return Math.round(resolved);
}
/** The text shown outside an active transition, including a finished count. */
export function settledText(node: TextNode, frame: number, state: number) {
  const completed = (
    node.transitions ?? (node.transition ? [node.transition] : [])
  )
    .filter((transition) => frame >= transition.window.end)
    .at(-1);
  return completed?.kind === "count"
    ? countText(node, completed, completed.window.end)
    : (node.states?.[textStateAtFrame(node, frame, state)] ?? node.text);
}
export function resolveDisplayedText(
  node: TextNode,
  frame: number,
  state: number,
):
  | { kind: "single"; text: string }
  | {
      kind: "transition";
      transition: TextTransition;
      fromText: string;
      toText: string;
      progress: number;
    } {
  const transition = activeTextTransition(node, frame);
  if (!transition || transition.kind === "cut")
    return { kind: "single", text: settledText(node, frame, state) };
  if (transition.kind === "count")
    return { kind: "single", text: countText(node, transition, frame) };
  return {
    kind: "transition",
    transition,
    fromText: node.states![transition.fromState ?? 0]!,
    toText: node.states![transition.toState ?? 1]!,
    progress: transitionProgress(transition, frame),
  };
}
export function transitionProgress(t: TextTransition, frame: number) {
  return easeMotion(
    (frame - t.window.start) / (t.window.end - t.window.start),
    t.easing ?? "in-out-cubic",
  );
}
export function countText(node: TextNode, t: TextTransition, frame: number) {
  const from = Number(node.states![t.fromState ?? 0]!.replaceAll(",", "")),
    to = Number(node.states![t.toState ?? 1]!.replaceAll(",", ""));
  return new Intl.NumberFormat(node.locale ?? "en", {
    minimumFractionDigits: t.decimals ?? 0,
    maximumFractionDigits: t.decimals ?? 0,
  }).format(from + (to - from) * transitionProgress(t, Math.round(frame)));
}
export function retypedClusters(
  from: ShapedLayout,
  to: ShapedLayout,
  progress: number,
) {
  let prefix = 0;
  while (
    prefix < Math.min(from.clusters.length, to.clusters.length) &&
    from.clusters[prefix]!.text === to.clusters[prefix]!.text
  )
    prefix++;
  const deleted = from.clusters.length - prefix,
    added = to.clusters.length - prefix,
    step = Math.floor(progress * (deleted + added));
  return step < deleted
    ? { layout: from, count: from.clusters.length - step }
    : { layout: to, count: prefix + step - deleted };
}

/** Largest eased displacement between rendered frames, used to keep common clusters readable. */
export function transitionSlideLimit(t: TextTransition, fps: number) {
  let maximum = 0,
    previous = transitionProgress(t, t.window.start);
  for (let frame = t.window.start + 1; frame <= t.window.end; frame++) {
    const next = transitionProgress(t, frame);
    maximum = Math.max(maximum, Math.abs(next - previous));
    previous = next;
  }
  return maximum ? 20 / (fps * maximum) : 0;
}
