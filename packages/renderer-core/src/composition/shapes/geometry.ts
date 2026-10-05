import type { BezierPath } from "@still-shift/scene-contract";
import type { Matrix, Point } from "../../node-transform.ts";
import { transformPoint } from "../../node-transform.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import { arcLengths, flattenBezier, transformBezier } from "./path.ts";

export type GeometryPath = {
  /** Declared source identity, retained through virtual copies for brush texture. */
  id: string;
  path: BezierPath;
  opacity: number;
  /** Full geometry before trimming and its retained normalized arc-length span. */
  source?: { points: Point[]; span: [number, number] };
};

export type ShapeTransform = {
  anchor: Point;
  position: Point;
  scale: Point;
  rotation: number;
  skewX: number;
  skewY: number;
};

export function shapeMatrix(transform: ShapeTransform): Matrix {
  const angle = (transform.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const x = Math.tan((transform.skewX * Math.PI) / 180),
    y = Math.tan((transform.skewY * Math.PI) / 180);
  const a = (cos - sin * y) * transform.scale[0],
    b = (sin + cos * y) * transform.scale[0];
  const c = (cos * x - sin) * transform.scale[1],
    d = (sin * x + cos) * transform.scale[1];
  return [
    a,
    b,
    c,
    d,
    transform.position[0] - a * transform.anchor[0] - c * transform.anchor[1],
    transform.position[1] - b * transform.anchor[0] - d * transform.anchor[1],
  ];
}

export function geometrySource(
  geometry: GeometryPath,
  budget: ShapeGeometryBudget,
) {
  return (
    geometry.source ?? {
      points: flattenBezier(geometry.path, budget),
      span: [0, 1] as [number, number],
    }
  );
}

function mappedSpan(
  before: readonly Point[],
  after: readonly Point[],
  span: [number, number],
): [number, number] {
  const oldLengths = arcLengths(before),
    newLengths = arcLengths(after);
  const oldTotal = oldLengths.at(-1)!,
    newTotal = newLengths.at(-1)!;
  if (!oldTotal || !newTotal) return [...span];
  const mapped = (progress: number) => {
    const distance = progress * oldTotal;
    let index = 1;
    while (index < oldLengths.length - 1 && oldLengths[index]! < distance)
      index++;
    const segment = oldLengths[index]! - oldLengths[index - 1]!;
    const fraction = segment
      ? (distance - oldLengths[index - 1]!) / segment
      : 0;
    return (
      (newLengths[index - 1]! +
        fraction * (newLengths[index]! - newLengths[index - 1]!)) /
      newTotal
    );
  };
  return [mapped(span[0]), mapped(span[1])];
}

export function transformedGeometry(
  geometry: GeometryPath,
  matrix: Matrix,
  budget: ShapeGeometryBudget,
): GeometryPath {
  const path = transformBezier(geometry.path, matrix, budget);
  if (!geometry.source) return { ...geometry, path };
  budget.vertices(geometry.source.points.length);
  const points = geometry.source.points.map((point) =>
    budget.point(transformPoint(matrix, point)),
  );
  return {
    ...geometry,
    path,
    source: {
      points,
      span: mappedSpan(geometry.source.points, points, geometry.source.span),
    },
  };
}
