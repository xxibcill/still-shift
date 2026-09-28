import type { TextContainer } from "../../scene-contract/src/story-acting.ts";

export type Rect = { x: number; y: number; width: number; height: number };
export const containerTail = (container: TextContainer) =>
  container.kind === "caption"
    ? undefined
    : (container.tail ?? {
        side: "bottom" as const,
        position: 0.3,
        length: 28,
      });

export function textContainerBounds(
  content: Rect,
  container: TextContainer,
): Rect {
  const pad = container.padding + container.strokeWidth / 2;
  const bounds = {
    x: content.x - pad,
    y: content.y - pad,
    width: content.width + pad * 2,
    height: content.height + pad * 2,
  };
  const tail = containerTail(container);
  if (tail) {
    if (tail.side === "top") bounds.y -= tail.length;
    if (tail.side === "left") bounds.x -= tail.length;
    if (tail.side === "top" || tail.side === "bottom")
      bounds.height += tail.length;
    else bounds.width += tail.length;
  }
  return bounds;
}
