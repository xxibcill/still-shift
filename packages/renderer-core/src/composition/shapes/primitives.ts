import type { BezierPath } from "@still-shift/scene-contract";
import type { Point } from "../../node-transform.ts";
import { ShapeGeometryBudget } from "./budget.ts";

export const ELLIPSE_KAPPA = (4 * (Math.SQRT2 - 1)) / 3;

function makePath(
  vertices: Point[],
  inTangents: Point[],
  outTangents: Point[],
  budget: ShapeGeometryBudget,
): BezierPath {
  budget.paths();
  budget.vertices(vertices.length * 3);
  vertices.forEach((point) => budget.point(point));
  inTangents.forEach((point) => budget.point(point));
  outTangents.forEach((point) => budget.point(point));
  return { closed: true, vertices, inTangents, outTangents };
}

function sizeValid(size: Point, budget: ShapeGeometryBudget) {
  budget.point(size);
  if (size.some((value) => value < 0))
    budget.fail("comp-shape-range", "Shape dimensions cannot be negative");
  return size[0] > 0 && size[1] > 0;
}

export function rectanglePath(
  {
    size,
    position = [0, 0],
    roundness = 0,
  }: { size: Point; position?: Point; roundness?: number },
  budget = new ShapeGeometryBudget(),
): BezierPath | null {
  if (!sizeValid(size, budget)) return null;
  budget.point([roundness, 0]);
  const radius = Math.max(0, Math.min(roundness, size[0] / 2, size[1] / 2));
  const left = position[0] - size[0] / 2,
    top = position[1] - size[1] / 2;
  const right = left + size[0],
    bottom = top + size[1];
  if (!radius)
    return makePath(
      [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ],
      Array.from({ length: 4 }, () => [0, 0]),
      Array.from({ length: 4 }, () => [0, 0]),
      budget,
    );
  const k = radius * ELLIPSE_KAPPA;
  return makePath(
    [
      [left + radius, top],
      [right - radius, top],
      [right, top + radius],
      [right, bottom - radius],
      [right - radius, bottom],
      [left + radius, bottom],
      [left, bottom - radius],
      [left, top + radius],
    ],
    [
      [-k, 0],
      [0, 0],
      [0, -k],
      [0, 0],
      [k, 0],
      [0, 0],
      [0, k],
      [0, 0],
    ],
    [
      [0, 0],
      [k, 0],
      [0, 0],
      [0, k],
      [0, 0],
      [-k, 0],
      [0, 0],
      [0, -k],
    ],
    budget,
  );
}

export function ellipsePath(
  { size, position = [0, 0] }: { size: Point; position?: Point },
  budget = new ShapeGeometryBudget(),
): BezierPath | null {
  if (!sizeValid(size, budget)) return null;
  const [rx, ry] = [size[0] / 2, size[1] / 2],
    [x, y] = position;
  const kx = ELLIPSE_KAPPA * rx,
    ky = ELLIPSE_KAPPA * ry;
  return makePath(
    [
      [x + rx, y],
      [x, y + ry],
      [x - rx, y],
      [x, y - ry],
    ],
    [
      [0, -ky],
      [kx, 0],
      [0, ky],
      [-kx, 0],
    ],
    [
      [0, ky],
      [-kx, 0],
      [0, -ky],
      [kx, 0],
    ],
    budget,
  );
}

/** Circular fillets, clamped so adjacent corner cuts never cross. */
export function roundedPolyline(
  points: readonly Point[],
  closed: boolean,
  radius: number | ((index: number, angle: number, edge: number) => number),
  budget = new ShapeGeometryBudget(),
): BezierPath {
  budget.paths();
  budget.vertices(points.length * 6);
  const vertices: Point[] = [],
    inTangents: Point[] = [],
    outTangents: Point[] = [];
  const add = (
    point: Point,
    incoming: Point = [0, 0],
    outgoing: Point = [0, 0],
  ) => {
    vertices.push(budget.point(point));
    inTangents.push(budget.point(incoming));
    outTangents.push(budget.point(outgoing));
  };
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!closed && (i === 0 || i === points.length - 1)) {
      add([...p] as Point);
      continue;
    }
    const before = points[(i + points.length - 1) % points.length]!,
      after = points[(i + 1) % points.length]!;
    const a = Math.hypot(before[0] - p[0], before[1] - p[1]),
      b = Math.hypot(after[0] - p[0], after[1] - p[1]);
    if (a < 1e-12 || b < 1e-12) {
      add([...p] as Point);
      continue;
    }
    const u: Point = [(before[0] - p[0]) / a, (before[1] - p[1]) / a];
    const v: Point = [(after[0] - p[0]) / b, (after[1] - p[1]) / b];
    const angle = Math.acos(
      Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])),
    );
    const requested =
      typeof radius === "number" ? radius : radius(i, angle, Math.min(a, b));
    if (requested <= 0 || angle < 1e-6 || Math.PI - angle < 1e-6) {
      add([...p] as Point);
      continue;
    }
    const effective = Math.min(
      requested,
      (Math.min(a, b) / 2) * Math.tan(angle / 2),
    );
    const cut = effective / Math.tan(angle / 2),
      k = (4 / 3) * Math.tan((Math.PI - angle) / 4) * effective;
    add([p[0] + u[0] * cut, p[1] + u[1] * cut], [0, 0], [-u[0] * k, -u[1] * k]);
    add([p[0] + v[0] * cut, p[1] + v[1] * cut], [-v[0] * k, -v[1] * k]);
  }
  return { closed, vertices, inTangents, outTangents };
}

type PolystarOptions = {
  kind: "star" | "polygon";
  points: number;
  outerRadius: number;
  innerRadius?: number;
  outerRoundness?: number;
  innerRoundness?: number;
  position?: Point;
  rotation?: number;
};

export function polystarPath(
  {
    kind,
    points,
    outerRadius,
    innerRadius = outerRadius / 2,
    outerRoundness = 0,
    innerRoundness = 0,
    position = [0, 0],
    rotation = 0,
  }: PolystarOptions,
  budget = new ShapeGeometryBudget(),
): BezierPath | null {
  if (
    !Number.isFinite(points) ||
    points < 2 ||
    points > 256 ||
    outerRadius < 0 ||
    innerRadius < 0
  )
    budget.fail("comp-shape-range", "Invalid polystar points or radii");
  if (!outerRadius) return null;
  const count = Math.round(points) * (kind === "star" ? 2 : 1);
  budget.vertices(count);
  const vertices = Array.from({ length: count }, (_, i): Point => {
    const angle = ((rotation - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / count;
    const radius = kind === "star" && i % 2 ? innerRadius : outerRadius;
    return budget.point([
      position[0] + Math.cos(angle) * radius,
      position[1] + Math.sin(angle) * radius,
    ]);
  });
  return roundedPolyline(
    vertices,
    true,
    (i, angle, edge) => {
      const amount = kind === "star" && i % 2 ? innerRoundness : outerRoundness;
      return ((amount * edge) / 2) * Math.tan(angle / 2);
    },
    budget,
  );
}
