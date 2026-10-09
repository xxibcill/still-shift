import {
  inverseMatrix,
  transformPoint,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import { projectBounds } from "../evaluate/geometry.ts";
import type { Bounds } from "../evaluate/types.ts";
import type { EvaluatedEffect } from "../evaluate/effects.ts";

export function isMeshEffect(effect: EvaluatedEffect): boolean {
  return (
    effect.effect === "distort.mesh-warp" || effect.effect === "distort.puppet"
  );
}

/** Conservative output bounds without allocating or sampling the alpha mesh. */
export function meshOutputBounds(
  input: Bounds,
  effect: EvaluatedEffect,
  matrix: Matrix,
): Bounds {
  const params = effect.params;
  if (effect.effect === "distort.mesh-warp") {
    const origin = params.origin as Point,
      size = params.size as Point;
    // A Bezier patch lies inside its control hull, including after affine placement.
    return pointBounds(
      (params.controls as Point[]).map(([x, y]) =>
        transformPoint(matrix, [
          origin[0] + x * size[0],
          origin[1] + y * size[1],
        ]),
      ),
    );
  }
  const rest = params.rest as Point[],
    targets = params.pins as Point[];
  if (!rest.length) return input;
  const dx = targets[0]![0] - rest[0]![0],
    dy = targets[0]![1] - rest[0]![1];
  if (
    rest.every(
      (point, i) =>
        targets[i]![0] - point[0] === dx && targets[i]![1] - point[1] === dy,
    )
  ) {
    const x = matrix[0] * dx + matrix[2] * dy,
      y = matrix[1] * dx + matrix[3] * dy;
    return {
      left: input.left + x,
      right: input.right + x,
      top: input.top + y,
      bottom: input.bottom + y,
    };
  }
  const local = projectBounds(input, inverseMatrix(matrix));
  let radius = 0;
  for (const point of rest)
    radius = Math.max(
      radius,
      Math.hypot(
        Math.max(
          Math.abs(local.left - point[0]),
          Math.abs(local.right - point[0]),
        ),
        Math.max(
          Math.abs(local.top - point[1]),
          Math.abs(local.bottom - point[1]),
        ),
      ),
    );
  // Every rigid MLS fit rotates about a weighted rest centroid and lands at a
  // weighted target centroid. Both centroids stay in their respective pin hulls.
  // Starch blends such rigid fits, so the same convex enclosure also contains it.
  const target = pointBounds(targets);
  return projectBounds(
    {
      left: target.left - radius,
      top: target.top - radius,
      right: target.right + radius,
      bottom: target.bottom + radius,
    },
    matrix,
  );
}
function pointBounds(points: Point[]): Bounds {
  const bounds = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };
  for (const [x, y] of points) {
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
  }
  return bounds;
}
