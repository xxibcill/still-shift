import type { Matrix, Point } from "../node-transform.ts";
import type { Bounds } from "./evaluate/types.ts";
import type { Homography } from "./evaluate/spatial-geometry.ts";
export function homographicPoint(h: Homography, [x, y]: Point): Point | null {
  const w = h[6] * x + h[7] * y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  const point: Point = [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w,
  ];
  return point.every(Number.isFinite) ? point : null;
}
/** A rectangle crossing the projective horizon has unbounded conservative support. */
export function homographicBounds(
  bounds: Bounds,
  h: Homography,
  viewport: Bounds,
): Bounds {
  const corners: Point[] = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ];
  const denominators = corners.map(([x, y]) => h[6] * x + h[7] * y + h[8]);
  if (Math.min(...denominators) <= 0 && Math.max(...denominators) >= 0)
    return { ...viewport };
  const points = corners.map((point) => homographicPoint(h, point));
  if (points.some((point) => !point)) return { ...viewport };
  return {
    left: Math.min(...points.map((point) => point![0])),
    top: Math.min(...points.map((point) => point![1])),
    right: Math.max(...points.map((point) => point![0])),
    bottom: Math.max(...points.map((point) => point![1])),
  };
}
/** Actual projective tangents at the artwork anchor; old affine arithmetic is separate. */
export function homographicScale(
  h: Homography,
  anchor: Point,
): [number, number] {
  const [x, y] = anchor,
    w = h[6] * x + h[7] * y + h[8],
    nx = h[0] * x + h[1] * y + h[2],
    ny = h[3] * x + h[4] * y + h[5];
  if (Math.abs(w) < 1e-12) return [0, 0];
  return [
    Math.hypot(
      (h[0] * w - nx * h[6]) / (w * w),
      (h[3] * w - ny * h[6]) / (w * w),
    ),
    Math.hypot(
      (h[1] * w - nx * h[7]) / (w * w),
      (h[4] * w - ny * h[7]) / (w * w),
    ),
  ];
}
export function homographicVelocityPoints(
  h: Homography,
  anchor: Point,
): number[] {
  return [
    anchor,
    [anchor[0] + 100, anchor[1]],
    [anchor[0], anchor[1] + 100],
  ].flatMap((point) => homographicPoint(h, point as Point) ?? [0, 0]);
}
export function normalizedHomography(h: Homography): Homography {
  const divisor = h[8] || Math.max(...h.map(Math.abs));
  return h.map((value) => value / divisor) as Homography;
}
export function affineViewportCovered(
  matrix: Matrix,
  bounds: Bounds,
  width: number,
  height: number,
) {
  const [a, b, c, d, e, f] = matrix,
    determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return false;
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].every(([x, y]) => {
    const lx = (d * (x! - e) - c * (y! - f)) / determinant,
      ly = (-b * (x! - e) + a * (y! - f)) / determinant;
    return (
      lx >= bounds.left - 1e-6 &&
      lx <= bounds.right + 1e-6 &&
      ly >= bounds.top - 1e-6 &&
      ly <= bounds.bottom + 1e-6
    );
  });
}
