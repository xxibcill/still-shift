import { SHAPE_LIMITS, type BezierPath } from "@still-shift/scene-contract";
import type { Point } from "../../node-transform.ts";
import { noise } from "../evaluate/expression-math.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import {
  arcLengths,
  flattenBezier,
  pathCubics,
  pointAtLength,
  polylinePath,
} from "./path.ts";
import { roundedPolyline } from "./primitives.ts";

function contour(path: BezierPath, budget: ShapeGeometryBudget) {
  const points = flattenBezier(path, budget);
  if (path.closed && points.length > 1) points.pop();
  return points;
}

/** Catmull–Rom handles; endpoints remain fixed and closed handles wrap. */
function smoothPath(
  points: Point[],
  closed: boolean,
  budget: ShapeGeometryBudget,
): BezierPath {
  const path = polylinePath(points, closed, budget);
  budget.vertices(points.length * 2);
  const handles = points.map((p, i): Point => {
    const before = points[i - 1] ?? (closed ? points.at(-1)! : p);
    const after = points[i + 1] ?? (closed ? points[0]! : p);
    return budget.point([
      (after[0] - before[0]) / 6,
      (after[1] - before[1]) / 6,
    ]);
  });
  return {
    ...path,
    outTangents: handles,
    inTangents: handles.map(([x, y]) => [-x, -y] as Point),
  };
}

export function roundCorners(
  path: BezierPath,
  radius: number,
  budget: ShapeGeometryBudget,
) {
  if (!radius) return path;
  return roundedPolyline(contour(path, budget), path.closed, radius, budget);
}

/** Positive amounts move vertices toward the mean and absolute controls away. */
export function puckerBloat(
  path: BezierPath,
  amount: number,
  budget: ShapeGeometryBudget,
): BezierPath {
  if (!amount || !path.vertices.length) return path;
  budget.paths();
  budget.vertices(path.vertices.length * 3);
  const center = path.vertices.reduce<Point>(
    (sum, p) => [
      sum[0] + p[0] / path.vertices.length,
      sum[1] + p[1] / path.vertices.length,
    ],
    [0, 0],
  );
  const vertices = path.vertices.map(
    (p): Point =>
      budget.point([
        p[0] + (center[0] - p[0]) * amount,
        p[1] + (center[1] - p[1]) * amount,
      ]),
  );
  const tangents = (source: Point[] | undefined) =>
    path.vertices.map((p, i): Point => {
      const t = source?.[i] ?? [0, 0];
      const control: Point = [p[0] + t[0], p[1] + t[1]];
      return budget.point([
        control[0] + (control[0] - center[0]) * amount - vertices[i]![0],
        control[1] + (control[1] - center[1]) * amount - vertices[i]![1],
      ]);
    });
  return {
    closed: path.closed,
    vertices,
    inTangents: tangents(path.inTangents),
    outTangents: tangents(path.outTangents),
  };
}

/** Native linear radial falloff: center receives the full angle, outer radius zero. */
export function twistPath(
  path: BezierPath,
  angle: number,
  center: Point,
  budget: ShapeGeometryBudget,
): BezierPath {
  if (!angle) return path;
  const points = flattenBezier(path, budget);
  const radius = points.reduce(
    (r, p) => Math.max(r, Math.hypot(p[0] - center[0], p[1] - center[1])),
    0,
  );
  if (!radius) return path;
  const radians = (angle * Math.PI) / 180,
    k = Math.abs(radians) / radius;
  const rotated = (point: Point): Point => {
    const x = point[0] - center[0],
      y = point[1] - center[1];
    const turn = radians * (1 - Math.min(1, Math.hypot(x, y) / radius));
    return budget.point([
      center[0] + x * Math.cos(turn) - y * Math.sin(turn),
      center[1] + x * Math.sin(turn) + y * Math.cos(turn),
    ]);
  };
  const result: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Conservative curvature bound for a radially rotated line segment.
    const curvature = length ** 2 * (3 * k + k ** 2 * radius);
    const steps = Math.max(
      1,
      Math.ceil(Math.sqrt(curvature / (8 * SHAPE_LIMITS.flattenTolerance))),
    );
    budget.vertices(steps);
    for (let j = 0; j < steps; j++) {
      result.push(
        rotated([
          a[0] + ((b[0] - a[0]) * j) / steps,
          a[1] + ((b[1] - a[1]) * j) / steps,
        ]),
      );
    }
  }
  if (!path.closed && points.length) {
    budget.vertices(1);
    result.push(rotated(points.at(-1)!));
  }
  return polylinePath(result, path.closed, budget);
}

function identitySeed(id: string, seed: number) {
  let hash = seed | 0;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash;
}

type Wiggle = {
  size: number;
  detail: number;
  frequency: number;
  evolution: number;
  seed: number;
  smooth: boolean;
};
/** Pure declared identity/seed and layer-local seconds; independent of seek order. */
export function wigglePath(
  path: BezierPath,
  id: string,
  wiggle: Wiggle,
  seconds: number,
  budget: ShapeGeometryBudget,
): BezierPath {
  if (!wiggle.size || !wiggle.detail) return path;
  const points = flattenBezier(path, budget),
    lengths = arcLengths(points),
    total = lengths.at(-1)!;
  if (!total) return path;
  const segments = path.vertices.length - (path.closed ? 0 : 1);
  const count = Math.max(1, Math.ceil(wiggle.detail * segments));
  const outputCount = count + Number(!path.closed);
  budget.vertices(outputCount);
  const seed = identitySeed(id, wiggle.seed),
    clock = seconds * wiggle.frequency + wiggle.evolution / 360;
  const result = Array.from({ length: outputCount }, (_, i): Point => {
    const p = pointAtLength(points, lengths, (total * i) / count);
    return budget.point([
      p[0] + wiggle.size * noise(seed ^ Math.imul(i + 1, 15731), clock),
      p[1] + wiggle.size * noise(seed ^ Math.imul(i + 1, 789221), clock),
    ]);
  });
  return wiggle.smooth
    ? smoothPath(result, path.closed, budget)
    : polylinePath(result, path.closed, budget);
}

/** Ridges are sampled in arc length per original cubic, not per flattened edge. */
export function zigzagPath(
  path: BezierPath,
  size: number,
  ridges: number,
  smooth: boolean,
  budget: ShapeGeometryBudget,
): BezierPath {
  const count = Math.round(ridges);
  if (!size || !count) return path;
  const result: Point[] = [];
  for (const [a, b, c, d] of pathCubics(path)) {
    const segment: BezierPath = {
      closed: false,
      vertices: [a, d],
      outTangents: [
        [b[0] - a[0], b[1] - a[1]],
        [0, 0],
      ],
      inTangents: [
        [0, 0],
        [c[0] - d[0], c[1] - d[1]],
      ],
    };
    const points = flattenBezier(segment, budget),
      lengths = arcLengths(points),
      total = lengths.at(-1)!;
    if (!total) continue;
    const steps = count * 4;
    budget.vertices(steps);
    for (let i = 0; i < steps; i++) {
      const distance = (total * i) / steps,
        p = pointAtLength(points, lengths, distance);
      const before = pointAtLength(
        points,
        lengths,
        Math.max(0, distance - total / steps / 2),
      );
      const after = pointAtLength(
        points,
        lengths,
        Math.min(total, distance + total / steps / 2),
      );
      const dx = after[0] - before[0],
        dy = after[1] - before[1],
        length = Math.hypot(dx, dy);
      const displacement = size * [0, 1, 0, -1][i % 4]!;
      result.push(
        budget.point(
          length
            ? [
                p[0] - (dy / length) * displacement,
                p[1] + (dx / length) * displacement,
              ]
            : p,
        ),
      );
    }
  }
  if (!path.closed && result.length)
    result.push([...path.vertices.at(-1)!] as Point);
  return smooth
    ? smoothPath(result, path.closed, budget)
    : polylinePath(result, path.closed, budget);
}
