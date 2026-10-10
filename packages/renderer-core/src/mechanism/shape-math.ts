import type { MechanismVector } from "@still-shift/scene-contract";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";

export type Vector = readonly [number, number, number];
export function add(left: Vector, right: Vector): MechanismVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}
export function subtract(left: Vector, right: Vector): MechanismVector {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}
export function scale(vector: Vector, factor: number): MechanismVector {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}
export function dot(left: Vector, right: Vector) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
export function cross(left: Vector, right: Vector): MechanismVector {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}
export function normalize(vector: Vector): MechanismVector {
  const length = Math.hypot(...vector);
  if (length === 0 || !Number.isFinite(length))
    throw new MechanismEvaluationErrorV2(
      "Generated curve has a degenerate direction",
      { code: "mechanism-shape-degenerate", path: ["teachingShapes"] },
    );
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
export function perpendicular(vector: Vector): MechanismVector {
  const axis = [0, 1, 2].sort(
    (left, right) => Math.abs(vector[left]!) - Math.abs(vector[right]!),
  )[0]!;
  const basis: MechanismVector = [0, 0, 0];
  basis[axis] = 1;
  return normalize(cross(vector, basis));
}
export function transportNormal(
  previousTangent: Vector,
  tangent: Vector,
  normal: Vector,
): MechanismVector {
  const rotation = cross(previousTangent, tangent);
  const sine = Math.hypot(...rotation),
    cosine = Math.max(-1, Math.min(1, dot(previousTangent, tangent)));
  if (sine === 0) return [...normal];
  const axis = scale(rotation, 1 / sine);
  const rotated = add(
    add(scale(normal, cosine), scale(cross(axis, normal), sine)),
    scale(axis, dot(axis, normal) * (1 - cosine)),
  );
  return normalize(subtract(rotated, scale(tangent, dot(rotated, tangent))));
}
export function boundsOfPositions(positions: readonly number[]) {
  const min: MechanismVector = [Infinity, Infinity, Infinity];
  const max: MechanismVector = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index++) {
    const axis = index % 3;
    min[axis] = Math.min(min[axis]!, positions[index]!);
    max[axis] = Math.max(max[axis]!, positions[index]!);
  }
  return { min, max };
}
