import {
  difference,
  intersect,
  union,
  xor,
  inflatePaths,
  FillRule,
  JoinType,
  EndType,
  type Paths64,
} from "clipper2-ts";
import { SHAPE_LIMITS, type BezierPath } from "@still-shift/scene-contract";
import { PassageError } from "../../passage-diagnostics.ts";
import type { Point } from "../../node-transform.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import { flattenBezier, polylinePath } from "./path.ts";

type Merge = "union" | "subtract" | "intersect" | "exclude";
type Join = "miter" | "round" | "bevel";
const SCALE = SHAPE_LIMITS.polygonScale;

function polygonInputs(
  operands: BezierPath[][],
  budget: ShapeGeometryBudget,
): Paths64[] {
  let vertices = 0;
  return operands.map((paths) =>
    paths.flatMap((path) => {
      const points = flattenBezier(path, budget);
      if (
        points.length > 1 &&
        points[0]![0] === points.at(-1)![0] &&
        points[0]![1] === points.at(-1)![1]
      )
        points.pop();
      vertices += points.length;
      if (vertices > SHAPE_LIMITS.polygonVertices)
        budget.fail(
          "comp-shape-polygon-limit",
          "Polygon operations exceed their 1024-input-vertex complexity budget",
        );
      if (points.length < 3) return [];
      const result = points.map(([x, y]) => ({
        x: Math.round(x * SCALE),
        y: Math.round(y * SCALE),
      }));
      if (
        result.some(
          (point) =>
            !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y),
        )
      )
        budget.fail(
          "comp-shape-polygon-coordinate",
          "Quantized polygon coordinates must be safe integers",
        );
      return [result];
    }),
  );
}

function polygonOutputs(
  paths: Paths64,
  budget: ShapeGeometryBudget,
): BezierPath[] {
  const count = paths.reduce((total, path) => total + path.length, 0);
  budget.vertices(count);
  return paths
    .filter((path) => path.length >= 3)
    .map((path) =>
      polylinePath(
        path.map(({ x, y }): Point => budget.point([x / SCALE, y / SCALE])),
        true,
        budget,
      ),
    );
}

function polygonCall(
  run: () => Paths64,
  budget: ShapeGeometryBudget,
): BezierPath[] {
  try {
    return polygonOutputs(run(), budget);
  } catch (error) {
    if (error instanceof PassageError) throw error;
    return budget.fail(
      "comp-shape-polygon",
      `Polygon operation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Operand order is top to bottom. Subtract keeps the topmost operand. */
export function mergePaths(
  operands: BezierPath[][],
  mode: Merge,
  budget: ShapeGeometryBudget,
): BezierPath[] {
  if (!operands.length) return [];
  const input = polygonInputs(operands, budget),
    rule = FillRule.NonZero;
  return polygonCall(() => {
    if (mode === "union") return union(input.flat(), [], rule);
    if (mode === "subtract")
      return difference(input[0]!, input.slice(1).flat(), rule);
    let result = union(input[0]!, [], rule);
    for (const next of input.slice(1))
      result =
        mode === "intersect"
          ? intersect(result, next, rule)
          : xor(result, next, rule);
    return result;
  }, budget);
}

const joins = {
  miter: JoinType.Miter,
  round: JoinType.Round,
  bevel: JoinType.Bevel,
} as const;

function cleanOpen(points: Point[]): Point[] {
  return points.filter(
    (point, i) =>
      !i ||
      Math.hypot(point[0] - points[i - 1]![0], point[1] - points[i - 1]![1]) >
        1e-12,
  );
}

/** Signed parallel open offset; this deliberately does not create a stroke outline. */
function offsetOpen(
  path: BezierPath,
  amount: number,
  join: Join,
  miterLimit: number,
  budget: ShapeGeometryBudget,
): BezierPath | null {
  const points = cleanOpen(flattenBezier(path, budget));
  if (points.length < 2) return null;
  const segments = points.slice(1).map((p, i): Point => {
    const before = points[i]!,
      length = Math.hypot(p[0] - before[0], p[1] - before[1]);
    return [-(p[1] - before[1]) / length, (p[0] - before[0]) / length];
  });
  const estimate =
    join === "round"
      ? Math.ceil(
          Math.PI *
            Math.sqrt((2 * Math.abs(amount)) / SHAPE_LIMITS.flattenTolerance),
        ) + 2
      : 2;
  budget.vertices(points.length * estimate);
  const result: Point[] = [];
  const shifted = (p: Point, normal: Point): Point =>
    budget.point([p[0] + amount * normal[0], p[1] + amount * normal[1]]);
  result.push(shifted(points[0]!, segments[0]!));
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!,
      before = segments[i - 1]!,
      after = segments[i]!;
    const dot = before[0] * after[0] + before[1] * after[1],
      denominator = 1 + dot;
    const crossing = before[0] * after[1] - before[1] * after[0];
    const miter: Point | undefined =
      denominator > 1e-12
        ? [
            p[0] + (amount * (before[0] + after[0])) / denominator,
            p[1] + (amount * (before[1] + after[1])) / denominator,
          ]
        : undefined;
    const withinLimit =
      miter &&
      Math.hypot(miter[0] - p[0], miter[1] - p[1]) <=
        Math.abs(amount) * miterLimit;
    if (withinLimit && (join === "miter" || crossing * amount >= 0)) {
      result.push(budget.point(miter));
      continue;
    }
    const first = shifted(p, before),
      last = shifted(p, after);
    result.push(first);
    if (join === "round" && Math.abs(crossing) > 1e-12) {
      const start = Math.atan2(first[1] - p[1], first[0] - p[0]);
      const end = Math.atan2(last[1] - p[1], last[0] - p[0]);
      const sweep = ((end - start + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const steps = Math.max(
        1,
        Math.ceil(
          Math.abs(sweep) *
            Math.sqrt(Math.abs(amount) / (2 * SHAPE_LIMITS.flattenTolerance)),
        ),
      );
      for (let step = 1; step < steps; step++) {
        const angle = start + (sweep * step) / steps;
        result.push(
          budget.point([
            p[0] + Math.abs(amount) * Math.cos(angle),
            p[1] + Math.abs(amount) * Math.sin(angle),
          ]),
        );
      }
    }
    result.push(last);
  }
  result.push(shifted(points.at(-1)!, segments.at(-1)!));
  return polylinePath(result, false, budget);
}

/** Closed contour offsets retain hole winding; open contours retain open topology. */
export function offsetPaths(
  paths: BezierPath[],
  amount: number,
  join: Join,
  miterLimit: number,
  budget: ShapeGeometryBudget,
): BezierPath[] {
  if (!amount) return paths;
  const closed = paths.filter((path) => path.closed),
    result: BezierPath[] = [];
  if (closed.length) {
    const input = polygonInputs([closed], budget)[0]!;
    const inputVertices = input.reduce((count, path) => count + path.length, 0);
    const estimate =
      join === "round"
        ? Math.ceil(
            Math.PI *
              Math.sqrt((2 * Math.abs(amount)) / SHAPE_LIMITS.flattenTolerance),
          ) + 2
        : 3;
    budget.vertices(inputVertices * estimate);
    result.push(
      ...polygonCall(
        () =>
          inflatePaths(
            input,
            amount * SCALE,
            joins[join],
            EndType.Polygon,
            miterLimit,
            SHAPE_LIMITS.flattenTolerance * SCALE,
          ),
        budget,
      ),
    );
  }
  for (const path of paths.filter((value) => !value.closed)) {
    const open = offsetOpen(path, amount, join, miterLimit, budget);
    if (open) result.push(open);
  }
  return result;
}
