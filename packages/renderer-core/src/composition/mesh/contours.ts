import type { Point } from "../../node-transform.ts";
export const MAX_CONTOUR_EDGES = 65536;
export const MAX_OUTLINE_VERTICES = 8192;

/** Trace thresholded pixel-cell boundaries, keeping holes and diagonal islands. */
export function traceAlphaContours(
  pixels: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Point[][] {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192) ||
    pixels.length !== width * height * 4 ||
    !Number.isInteger(threshold) ||
    threshold < 1 ||
    threshold > 255
  )
    throw Error("comp-mesh-alpha: invalid alpha image or threshold");
  const edges = new Set<number>(),
    stride = width + 1;
  const opaque = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    pixels[(y * width + x) * 4 + 3]! >= threshold;
  const add = (x: number, y: number, direction: number) => {
    if (edges.size >= MAX_CONTOUR_EDGES)
      throw Error("comp-mesh-budget: alpha contour edge budget exceeded");
    edges.add((y * stride + x) * 4 + direction);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      if (!opaque(x, y - 1)) add(x, y, 0);
      if (!opaque(x + 1, y)) add(x + 1, y, 1);
      if (!opaque(x, y + 1)) add(x + 1, y + 1, 2);
      if (!opaque(x - 1, y)) add(x, y + 1, 3);
    }
  const contours: Point[][] = [],
    offsets = [1, stride, -1, -stride];
  let count = 0;
  while (edges.size) {
    const first = edges.values().next().value!,
      start = Math.floor(first / 4),
      firstDirection = first % 4;
    let edge = first,
      previous = -1;
    const contour: Point[] = [];
    while (true) {
      const vertex = Math.floor(edge / 4),
        direction = edge % 4;
      if (direction !== previous) {
        if (++count > MAX_OUTLINE_VERTICES)
          throw Error("comp-mesh-budget: alpha outline vertex budget exceeded");
        contour.push([vertex % stride, Math.floor(vertex / stride)]);
      }
      edges.delete(edge);
      const next = vertex + offsets[direction]!;
      if (next === start) {
        if (direction === firstDirection) {
          contour.shift();
          count--;
        }
        break;
      }
      previous = direction;
      // The opaque side stays on the right. Right turns separate diagonal contacts.
      const nextDirection = [
        (direction + 1) % 4,
        direction,
        (direction + 3) % 4,
        (direction + 2) % 4,
      ].find((candidate) => edges.has(next * 4 + candidate));
      if (nextDirection === undefined)
        throw Error("comp-mesh-alpha: open alpha contour");
      edge = next * 4 + nextDirection;
    }
    if (contour.length < 3)
      throw Error("comp-mesh-alpha: collapsed alpha contour");
    contours.push(contour);
  }
  return contours;
}
export function contourArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
export function containsPoint(points: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
