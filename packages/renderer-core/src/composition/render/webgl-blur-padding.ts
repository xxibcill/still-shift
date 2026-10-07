import type { Bounds } from "../evaluate/types.ts";
/** Capture offscreen input within the finite filter support before viewport clipping. */
export function blurPadding(
  width: number,
  height: number,
  bounds: Bounds,
  support: number,
  maximum: number,
) {
  const left = Math.min(support, Math.max(0, Math.ceil(-bounds.left)));
  const top = Math.min(support, Math.max(0, Math.ceil(-bounds.top)));
  const right = Math.min(support, Math.max(0, Math.ceil(bounds.right - width)));
  const bottom = Math.min(
    support,
    Math.max(0, Math.ceil(bounds.bottom - height)),
  );
  const paddedWidth = width + left + right,
    paddedHeight = height + top + bottom;
  if (
    paddedWidth > maximum ||
    paddedHeight > maximum ||
    paddedWidth * paddedHeight * 4 >
      Math.max(128 * 1024 * 1024, width * height * 16)
  )
    throw Error(
      "comp-effect-budget: offscreen primitive blur exceeds GPU surface budget",
    );
  return { left, top, right, bottom, width: paddedWidth, height: paddedHeight };
}
