export type NamedAnchor = "center" | "top" | "bottom" | "left" | "right";
export function anchorPoint(
  anchor: NamedAnchor,
  size: readonly [number, number],
): [number, number] {
  const [width, height] = size;
  const anchors: Record<NamedAnchor, [number, number]> = {
    center: [width / 2, height / 2],
    top: [width / 2, 0],
    bottom: [width / 2, height],
    left: [0, height / 2],
    right: [width, height / 2],
  };
  return anchors[anchor];
}
