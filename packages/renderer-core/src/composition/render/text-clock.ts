import type { TextAnimator, Signal } from "@still-shift/scene-contract";
import type { TextNode } from "../../typography-style.ts";

type Window = { start: number; end: number };

function curveWindows(keys: Signal["keys"]): Window[] {
  const windows: Window[] = [];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!,
      b = keys[i]!;
    if (b.interpolation === "hold") {
      if (a.value !== b.value) windows.push({ start: b.frame, end: b.frame });
    } else if (
      a.value !== b.value ||
      a.smooth ||
      b.smooth ||
      a.interpolation === "smooth" ||
      b.interpolation === "smooth" ||
      a.out ||
      b.in
    )
      windows.push({ start: a.frame, end: b.frame });
  }
  return windows;
}

/** Coverage changes only while one of its local typography inputs is active. */
export function typographyClock(
  node: Pick<TextNode, "id" | "transition" | "transitions" | "decorations">,
  animators: readonly TextAnimator[],
  corrections: readonly Window[],
  signals: readonly Signal[] = [],
): (frame: number) => number {
  const local = animators.filter((animator) => animator.node === node.id);
  const curves: Signal["keys"][] = [];
  const referenced = new Set<string>();
  const windows: Window[] = [];
  for (const animator of local) {
    if (animator.signal) {
      referenced.add(animator.signal);
      if (animator.to)
        windows.push({ start: animator.start, end: animator.start });
    } else windows.push({ start: animator.start, end: animator.end });
    if (animator.weight) curves.push(animator.weight);
    for (const selector of [animator.selector, ...(animator.selectors ?? [])])
      for (const value of [selector.start, selector.end, selector.offset]) {
        if (Array.isArray(value)) curves.push(value);
        else if (typeof value === "object") referenced.add(value.signal);
      }
  }
  for (const id of referenced) {
    const signal = signals.find((signal) => signal.id === id);
    if (!signal || signal.add?.length) return (frame) => frame;
    curves.push(signal.keys);
  }
  const transitions =
    node.transitions ?? (node.transition ? [node.transition] : []);
  windows.push(
    ...transitions.map((transition) => transition.window),
    ...corrections,
  );
  for (const decoration of node.decorations ?? [])
    if (decoration.reveal) curves.push(decoration.reveal);
  windows.push(...curves.flatMap(curveWindows));
  const padded = windows
    .map(({ start, end }) => ({
      start: Math.floor(start) - 1,
      end: Math.ceil(end) + 1,
    }))
    .sort((a, b) => a.start - b.start);
  if (!padded.length) return () => 0;
  const active: Window[] = [];
  for (const window of padded) {
    const previous = active.at(-1);
    if (previous && window.start <= previous.end)
      previous.end = Math.max(previous.end, window.end);
    else active.push({ ...window });
  }
  return (frame) => {
    let settled = active[0]!.start;
    for (const window of active) {
      if (frame < window.start) return settled;
      if (frame <= window.end) return frame;
      settled = window.end;
    }
    return settled;
  };
}
