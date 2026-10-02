import type { Bounds } from "../evaluate/types.ts";

type Region = { bounds: Bounds; indices: number[] };
const area = (b: Bounds) => (b.right - b.left) * (b.bottom - b.top);
export const unionBounds = (a: Bounds, b: Bounds): Bounds => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});
const overlaps = (a: Bounds, b: Bounds) =>
  a.left <= b.right &&
  b.left <= a.right &&
  a.top <= b.bottom &&
  b.top <= a.bottom;

/** Keep overlapping vector coverage together; disconnected regions need no empty texels. */
export function vectorRegions(boxes: Bounds[]): Region[] {
  const regions: Region[] = [];
  let all: Region | undefined;
  boxes.forEach((bounds, index) => {
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return;
    all ??= { bounds, indices: [] };
    all.bounds = unionBounds(all.bounds, bounds);
    all.indices.push(index);
    const next: Region = { bounds, indices: [index] };
    // A merged rectangle can reach an earlier region that neither original box touched.
    for (let i = 0; i < regions.length; ) {
      const other = regions[i]!;
      if (!overlaps(next.bounds, other.bounds)) {
        i++;
        continue;
      }
      next.bounds = unionBounds(next.bounds, other.bounds);
      next.indices.push(...other.indices);
      regions.splice(i, 1);
      i = 0;
    }
    next.indices.sort((a, b) => a - b);
    regions.push(next);
  });
  if (!all) return [];
  // Avoid extra draw calls when splitting saves little texture work.
  return regions.length > 8 ||
    regions.reduce((sum, region) => sum + area(region.bounds), 0) >=
      area(all.bounds) * 0.75
    ? [all]
    : regions;
}
