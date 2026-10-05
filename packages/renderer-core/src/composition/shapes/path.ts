import { SHAPE_LIMITS, type BezierPath } from "@still-shift/scene-contract";
import {
  transformPoint,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import type { Bounds } from "../evaluate/types.ts";
import { ShapeGeometryBudget } from "./budget.ts";

export type Cubic = [Point, Point, Point, Point];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const midpoint = (a: Point, b: Point): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

export function* pathCubics(path: BezierPath): Generator<Cubic> {
  for (let i = 0; i < path.vertices.length - (path.closed ? 0 : 1); i++) {
    const next = (i + 1) % path.vertices.length;
    const a = path.vertices[i]!,
      d = path.vertices[next]!;
    const out = path.outTangents?.[i] ?? [0, 0],
      incoming = path.inTangents?.[next] ?? [0, 0];
    yield [
      a,
      [a[0] + out[0]!, a[1] + out[1]!],
      [d[0] + incoming[0]!, d[1] + incoming[1]!],
      d,
    ];
  }
}

export function cubicAt([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t;
  return [0, 1].map(
    (axis) =>
      u ** 3 * a[axis]! +
      3 * u ** 2 * t * b[axis]! +
      3 * u * t ** 2 * c[axis]! +
      t ** 3 * d[axis]!,
  ) as Point;
}

function extrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2),
    c = p1 - p0;
  const epsilon = 1e-12 * Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
  if (Math.abs(a) <= epsilon) return Math.abs(b) <= epsilon ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}

/** Exact cubic extrema, rather than vertex-only or tessellation bounds. */
export function bezierBounds(path: BezierPath): Bounds | null {
  if (!path.vertices.length) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  const include = ([x, y]: Point) => {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  path.vertices.forEach(include);
  for (const cubic of pathCubics(path))
    for (const axis of [0, 1])
      for (const t of extrema(
        ...(cubic.map((point) => point[axis]!) as [
          number,
          number,
          number,
          number,
        ]),
      ))
        if (t > 0 && t < 1) include(cubicAt(cubic, t));
  return { left, top, right, bottom };
}

function flat(cubic: Cubic): boolean {
  const [a, b, c, d] = cubic;
  const length = distance(a, d);
  const perpendicular = (p: Point) =>
    length
      ? Math.abs(
          (d[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (d[1] - a[1]),
        ) / length
      : distance(a, p);
  return (
    Math.max(perpendicular(b), perpendicular(c)) <=
      SHAPE_LIMITS.flattenTolerance &&
    distance(a, b) + distance(b, c) + distance(c, d) - length <=
      SHAPE_LIMITS.flattenTolerance * 2
  );
}

function split([a, b, c, d]: Cubic): [Cubic, Cubic] {
  const ab = midpoint(a, b),
    bc = midpoint(b, c),
    cd = midpoint(c, d);
  const abc = midpoint(ab, bc),
    bcd = midpoint(bc, cd),
    middle = midpoint(abc, bcd);
  return [
    [a, ab, abc, middle],
    [middle, bcd, cd, d],
  ];
}

/** Fixed error/depth policy; a closed path includes its closing endpoint. */
export function flattenBezier(
  path: BezierPath,
  budget = new ShapeGeometryBudget(),
): Point[] {
  if (!path.vertices.length) return [];
  budget.paths();
  budget.vertices(1);
  const points = [budget.point([...path.vertices[0]!] as Point)];
  for (const cubic of pathCubics(path)) {
    cubic.forEach((point) => budget.point(point));
    const pending = [{ cubic, depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!;
      if (flat(item.cubic)) {
        budget.vertices(1);
        points.push([...item.cubic[3]] as Point);
      } else {
        if (item.depth >= SHAPE_LIMITS.flattenDepth)
          budget.fail(
            "comp-shape-flatten-limit",
            "Cubic flattening cannot meet its fixed tolerance within the subdivision limit",
          );
        budget.vertices(6);
        const [first, second] = split(item.cubic);
        pending.push(
          { cubic: second, depth: item.depth + 1 },
          { cubic: first, depth: item.depth + 1 },
        );
      }
    }
  }
  return points;
}

export function polylinePath(
  points: readonly Point[],
  closed: boolean,
  budget = new ShapeGeometryBudget(),
): BezierPath {
  const count =
    closed && points.length > 1 && distance(points[0]!, points.at(-1)!) < 1e-12
      ? points.length - 1
      : points.length;
  budget.paths();
  budget.vertices(count);
  return {
    closed,
    vertices: points
      .slice(0, count)
      .map((point) => budget.point([...point] as Point)),
  };
}

export function transformBezier(
  path: BezierPath,
  matrix: Matrix,
  budget = new ShapeGeometryBudget(),
): BezierPath {
  budget.paths();
  budget.vertices(path.vertices.length * 3);
  const tangent = (point: Point) =>
    budget.point([
      matrix[0] * point[0] + matrix[2] * point[1],
      matrix[1] * point[0] + matrix[3] * point[1],
    ]);
  return {
    closed: path.closed,
    vertices: path.vertices.map((point) =>
      budget.point(transformPoint(matrix, point)),
    ),
    ...(path.inTangents ? { inTangents: path.inTangents.map(tangent) } : {}),
    ...(path.outTangents ? { outTangents: path.outTangents.map(tangent) } : {}),
  };
}

export function arcLengths(points: readonly Point[]) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1]! + distance(points[i - 1]!, points[i]!));
  return lengths;
}

export function pointAtLength(
  points: readonly Point[],
  lengths: readonly number[],
  position: number,
): Point {
  if (!points.length) return [0, 0];
  let low = 1,
    high = lengths.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (lengths[mid]! < position) low = mid + 1;
    else high = mid;
  }
  const index = Math.min(low, points.length - 1);
  if (index < 1) return [...points[0]!] as Point;
  const a = points[index - 1]!,
    b = points[index]!;
  const span = lengths[index]! - lengths[index - 1]!;
  const t = span
    ? Math.max(0, Math.min(1, (position - lengths[index - 1]!) / span))
    : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function pathSection(
  points: readonly Point[],
  lengths: readonly number[],
  start: number,
  end: number,
  budget = new ShapeGeometryBudget(),
): Point[] {
  if (end <= start || !points.length || !lengths.at(-1)) return [];
  const interior = lengths.reduce(
    (count, length) => count + Number(length > start && length < end),
    0,
  );
  budget.vertices(interior + 2);
  return [
    pointAtLength(points, lengths, start),
    ...points
      .filter((_, i) => lengths[i]! > start && lengths[i]! < end)
      .map((point) => [...point] as Point),
    pointAtLength(points, lengths, end),
  ];
}
