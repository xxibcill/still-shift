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
import type { EvaluatedLayer, EvaluationOptions } from "./types.ts";

type Constraint = NonNullable<CompositionScope["constraints"]>[number];
type Context = {
  comp: Composition;
  scope: CompositionScope;
  time: number;
  fps: number;
  options: EvaluationOptions;
  parentMatrix: Matrix;
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
    const source = other(constraint.anchor),
      [w, h] = layerSize(comp, scope, source.layer);
    const point = constraint.point ?? [0.5, 0.5];
    const location = transformPoint(source.worldMatrix, [
      w * point[0],
      h * point[1],
    ]);
    moveReference([
      location[0] + (constraint.offset?.[0] ?? 0),
      location[1] + (constraint.offset?.[1] ?? 0),
    ]);
  } else if (constraint.type === "look-at") {
    const source = other(constraint.toward),
      [w, h] = layerSize(comp, scope, source.layer);
    const target = transformPoint(
      inverse(parentMatrix, state),
      transformPoint(source.worldMatrix, [w / 2, h / 2]),
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
      [w, h] = layerSize(comp, scope, surface.layer);
    const edge = constraint.edge ?? "bottom",
      horizontal = edge === "top" || edge === "bottom";
    const at = horizontal ? (edge === "top" ? 0 : h) : edge === "left" ? 0 : w;
    const a = transformPoint(
      surface.worldMatrix,
      horizontal ? [0, at] : [at, 0],
    );
    const b = transformPoint(
      surface.worldMatrix,
      horizontal ? [Math.max(1, w), at] : [at, Math.max(1, h)],
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
    const size = layerSize(comp, scope, state.layer);
    const point: Point = [
      size[0] * constraint.point[0],
      size[1] * constraint.point[1],
    ];
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
