import type { TextAnimator } from "@still-shift/scene-contract";
import type { TextNode } from "../../typography-style.ts";

/** Stop invalidating glyph coverage after finite local animation has settled. */
export function typographyClock(
  node: Pick<TextNode, "id" | "transition" | "transitions" | "decorations">,
  animators: readonly TextAnimator[],
  corrections: readonly { start: number; end: number }[],
): (frame: number) => number {
  const local = animators.filter((animator) => animator.node === node.id);
  if (
    local.some(
      (animator) =>
        animator.signal ||
        [animator.selector, ...(animator.selectors ?? [])].some((selector) =>
          [selector.start, selector.end, selector.offset].some(
            (value) => typeof value === "object",
          ),
        ),
    )
  )
    return (frame) => frame;
  const transitions =
    node.transitions ?? (node.transition ? [node.transition] : []);
  const curves = [
    ...local.flatMap((animator) => (animator.weight ? [animator.weight] : [])),
    ...(node.decorations ?? []).flatMap((decoration) =>
      decoration.reveal ? [decoration.reveal] : [],
    ),
  ];
  const windows = [
    ...local.map((animator) => ({ start: animator.start, end: animator.end })),
    ...transitions.map((transition) => transition.window),
    ...corrections,
    ...curves.map((keys) => ({
      start: keys[0]!.frame,
      end: keys.at(-1)!.frame,
    })),
  ]
    .map(({ start, end }) => ({
      start: Math.floor(start) - 1,
      end: Math.ceil(end) + 1,
    }))
    .sort((a, b) => a.start - b.start);
  if (!windows.length) return () => 0;
  const active: { start: number; end: number }[] = [];
  for (const window of windows) {
    const previous = active.at(-1);
    if (previous && window.start <= previous.end)
      previous.end = Math.max(previous.end, window.end);
    else active.push({ ...window });
  }
  // Glyph poses round their clock; preserve fractional clocks throughout active windows.
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
