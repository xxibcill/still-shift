import type { ShapeGeometryBudget } from "../shapes/budget.ts";
import {
  flattenBezier,
  transformBezier,
  arcLengths,
  pointAtLength,
} from "../shapes/path.ts";
import type {
  Composition,
  CompositionScope,
} from "@still-shift/scene-contract";
import {
  inverseMatrix,
  multiplyMatrix,
  transformPoint,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  localBounds,
  layerSize,
  projectBounds,
  transformMatrix,
} from "./geometry.ts";
import { motionScalar, unit } from "./sample.ts";
import type { Bounds, EvaluatedLayer, EvaluationOptions } from "./types.ts";

type Constraint = NonNullable<CompositionScope["constraints"]>[number];
type Context = {
  comp: Composition;
  scope: CompositionScope;
  time: number;
  fps: number;
  options: EvaluationOptions;
  parentMatrix: Matrix;
  budget: ShapeGeometryBudget;
  signal: (id: string) => number;
  other: (id: string) => EvaluatedLayer;
};

function inverse(matrix: Matrix, state: EvaluatedLayer): Matrix {
  try {
    return inverseMatrix(matrix);
  } catch {
    passageError(
      "comp-constraint-singular",
      "Constraint needs an invertible parent transform",
      { node: state.id, path: `${state.id}.parent` },
    );
  }
}

function rectangle(state: EvaluatedLayer, ctx: Context): Bounds {
  if (state.layer.type === "text" || state.layer.type === "shape") {
    const bounds = localBounds(ctx.comp, ctx.scope, state, ctx.options);
    if (!bounds)
      passageError(
        "comp-text-layout-missing",
        "Text constraints need measured layer bounds",
        { node: state.id, path: `${state.id}.bounds` },
      );
    return bounds;
  }
  const [w, h] = layerSize(ctx.comp, ctx.scope, state.layer);
  return { left: 0, top: 0, right: w, bottom: h };
}

function pointInLayer(
  state: EvaluatedLayer,
  point: Point,
  ctx: Context,
): Point {
  const bounds = rectangle(state, ctx);
  return [
    bounds.left + (bounds.right - bounds.left) * point[0],
    bounds.top + (bounds.bottom - bounds.top) * point[1],
  ];
}

export function applyConstraints(state: EvaluatedLayer, context: Context) {
  const constraints = (context.scope.constraints ?? []).filter(
    (c) => c.target === state.id,
  );
  const order = ["action", "response", "current", "carrier"];
  constraints.sort(
    (a, b) =>
      order.indexOf(a.layer ?? "response") -
      order.indexOf(b.layer ?? "response"),
  );
  for (const constraint of constraints)
    applyConstraint(state, constraint, context);
}

function applyConstraint(
  state: EvaluatedLayer,
  constraint: Constraint,
  ctx: Context,
) {
  const { comp, scope, time, fps, options, parentMatrix, other } = ctx;
  const weight = constraint.weight
    ? unit(motionScalar(constraint.weight, time, fps))
    : 1;
  const t = state.transform;
  // All constraint blend modes describe a correction toward a solved value.
  // Add/replace are equivalent; multiply cannot solve a zero-valued channel.
  const set = (object: object, key: number | string, value: number) => {
    const values = object as { [key: string | number]: number };
    if (constraint.blend === "multiply" && values[key] === 0) return;
    values[key] = values[key]! + (value - values[key]!) * weight;
  };
  const matrix = () => multiplyMatrix(parentMatrix, transformMatrix(t));
  const moveReference = (point: Point) => {
    const local = transformPoint(inverse(parentMatrix, state), point);
    const offset = transformPoint(
      transformMatrix({ ...t, position: [0, 0] }),
      state.constraintReference,
    );
    set(t.position, 0, local[0] - offset[0]);
    set(t.position, 1, local[1] - offset[1]);
  };
  if (constraint.type === "attach") {
    const source = other(constraint.anchor);
    const point = constraint.point ?? [0.5, 0.5];
    const location = transformPoint(
      source.worldMatrix,
      pointInLayer(source, point, ctx),
    );
    moveReference([
      location[0] + (constraint.offset?.[0] ?? 0),
      location[1] + (constraint.offset?.[1] ?? 0),
    ]);
  } else if (constraint.type === "follow-path") {
    const source = other(constraint.path),
      path = source.shapes?.paths[0];
    if (!path)
      passageError(
        "comp-shape-follow-empty",
        "Follow-path source has no contour",
        {
          node: state.id,
          path: constraint.path,
          ...ctx.budget.location,
        },
      );
    const points = flattenBezier(
      transformBezier(path, source.worldMatrix, ctx.budget),
      ctx.budget,
    );
    const lengths = arcLengths(points),
      total = lengths.at(-1) ?? 0;
    if (!total)
      passageError(
        "comp-shape-follow-empty",
        "Follow-path source has zero arc length",
        {
          node: state.id,
          path: constraint.path,
          ...ctx.budget.location,
        },
      );
    const distance = unit(ctx.signal(constraint.progress)) * total;
    if (constraint.orient === "tangent") {
      const inv = inverse(parentMatrix, state);
      const before = transformPoint(
        inv,
        pointAtLength(points, lengths, Math.max(0, distance - total * 0.001)),
      );
      const after = transformPoint(
        inv,
        pointAtLength(
          points,
          lengths,
          Math.min(total, distance + total * 0.001),
        ),
      );
      const skewDirection = Math.atan2(
        Math.tan((t.skewY * Math.PI) / 180) * t.scale[0],
        t.scale[0],
      );
      set(
        t,
        "rotation",
        ((Math.atan2(after[1] - before[1], after[0] - before[0]) -
          skewDirection) *
          180) /
          Math.PI,
      );
    }
    moveReference(pointAtLength(points, lengths, distance));
  } else if (constraint.type === "look-at") {
    const source = other(constraint.toward);
    const target = transformPoint(
      inverse(parentMatrix, state),
      transformPoint(source.worldMatrix, pointInLayer(source, [0.5, 0.5], ctx)),
    );
    const skewDirection = Math.atan2(
      Math.tan((t.skewY * Math.PI) / 180) * t.scale[0],
      t.scale[0],
    );
    set(
      t,
      "rotation",
      ((Math.atan2(target[1] - t.position[1], target[0] - t.position[0]) -
        skewDirection) *
        180) /
        Math.PI +
        (constraint.offset ?? 0),
    );
  } else if (constraint.type === "contact") {
    const surface = other(constraint.surface),
      bounds = rectangle(surface, ctx);
    const edge = constraint.edge ?? "bottom",
      horizontal = edge === "top" || edge === "bottom";
    const at = horizontal
      ? edge === "top"
        ? bounds.top
        : bounds.bottom
      : edge === "left"
        ? bounds.left
        : bounds.right;
    const a = transformPoint(
      surface.worldMatrix,
      horizontal ? [bounds.left, at] : [at, bounds.top],
    );
    const b = transformPoint(
      surface.worldMatrix,
      horizontal
        ? [Math.max(bounds.left + 1, bounds.right), at]
        : [at, Math.max(bounds.top + 1, bounds.bottom)],
    );
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-12)
      passageError(
        "comp-constraint-singular",
        "Contact surface has collapsed",
        { node: state.id, path: `${state.id}.constraints` },
      );
    const nx = -(b[1] - a[1]) / length,
      ny = (b[0] - a[0]) / length;
    const point = pointInLayer(state, constraint.point, ctx);
    const distance = () => {
      const p = transformPoint(matrix(), point);
      return nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
    };
    for (const property of constraint.solve) {
      if (property === "rotation") {
        const original = t.rotation;
        t.rotation = 0;
        const d0 = distance();
        t.rotation = 90;
        const d90 = distance();
        t.rotation = 180;
        const d180 = distance();
        t.rotation = original;
        const c = (d0 + d180) / 2,
          A = d0 - c,
          B = d90 - c,
          radius = Math.hypot(A, B);
        if (radius < 1e-12 || Math.abs(c) > radius) continue;
        const offset = Math.atan2(B, A),
          theta = Math.acos(Math.max(-1, Math.min(1, -c / radius))),
          angle = (original * Math.PI) / 180;
        const candidates = [offset + theta, offset - theta].map(
          (v) => angle + Math.atan2(Math.sin(v - angle), Math.cos(v - angle)),
        );
        candidates.sort((a, b) => Math.abs(a - angle) - Math.abs(b - angle));
        set(t, "rotation", (candidates[0]! * 180) / Math.PI);
        break;
      }
      const values = property.startsWith("scale") ? t.scale : t.position;
      const axis = property === "y" || property === "scaleY" ? 1 : 0;
      const original = values[axis]!,
        d = distance();
      values[axis] = original + 1;
      const derivative = distance() - d;
      values[axis] = original;
      if (Math.abs(derivative) > 1e-12) {
        set(values, axis, original - d / derivative);
        break;
      }
    }
  } else if (constraint.type === "keep-in-safe-area" && constraint.clamp) {
    const local = localBounds(comp, scope, state, options);
    if (!local)
      passageError(
        "comp-text-layout-missing",
        "Safe-area constraints need measured layer bounds",
        { node: state.id, path: `${state.id}.bounds` },
      );
    const bounds = projectBounds(local, matrix());
    const dx =
      bounds.left < constraint.inset
        ? constraint.inset - bounds.left
        : bounds.right > scope.width - constraint.inset
          ? scope.width - constraint.inset - bounds.right
          : 0;
    const dy =
      bounds.top < constraint.inset
        ? constraint.inset - bounds.top
        : bounds.bottom > scope.height - constraint.inset
          ? scope.height - constraint.inset - bounds.bottom
          : 0;
    const inv = inverse(parentMatrix, state);
    set(t.position, 0, t.position[0] + inv[0] * dx + inv[2] * dy);
    set(t.position, 1, t.position[1] + inv[1] * dx + inv[3] * dy);
  }
}
