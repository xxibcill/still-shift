import type { TextAnimator } from "@still-shift/scene-contract";
import type { TextNode } from "../../typography-style.ts";

/** Stop invalidating glyph coverage after finite local animation has settled. */
export function typographyClock(
  node: Pick<TextNode, "id" | "transition" | "transitions" | "decorations">,
  animators: readonly TextAnimator[],
  corrections: readonly { end: number }[],
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
  const ends = [
    ...local.flatMap((animator) => [
      animator.end,
      ...(animator.weight?.map((key) => key.frame) ?? []),
    ]),
    ...transitions.map((transition) => transition.window.end),
    ...corrections.map((correction) => correction.end),
    ...(node.decorations ?? []).flatMap(
      (decoration) => decoration.reveal?.map((key) => key.frame) ?? [],
    ),
  ];
  if (!ends.length) return () => 0;
  // Glyph poses round their clock; transition and decoration clocks remain fractional.
  const settled = Math.ceil(Math.max(...ends)) + 1;
  return (frame) => Math.min(frame, settled);
}
