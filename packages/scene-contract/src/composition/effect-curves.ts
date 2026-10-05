import { z } from "zod";
import { animatable, animatableScalar, isKeyed } from "./keys.ts";
import { finite } from "./primitives.ts";
export type EffectCurvePoints = [number, number][];
export type EffectCurveProperty = {
  type: "curve";
  default: readonly (readonly [number, number])[];
};
const unit = finite.min(0).max(1);
const point = z.tuple([unit, unit]);
const pointAnimation = z.union([
  animatable(point, { dimensions: 2 }),
  z.object({ x: animatableScalar(unit), y: animatableScalar(unit) }).strict(),
]);
export function effectCurveIssue(
  points: readonly (readonly number[])[],
): string | undefined {
  if (points.length < 2 || points.length > 16)
    return "Color curves need 2–16 control points";
  if (
    points.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
    )
  )
    return "Color curve points must be finite bounded pairs";
  if (points[0]?.[0] !== 0 || points.at(-1)?.[0] !== 1)
    return "Color curve endpoints must have x = 0 and x = 1";
  if (
    points.some(
      (p, i) =>
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
        (i > 0 && p[0]! <= points[i - 1]![0]!),
    )
  )
    return "Color curve points must be bounded and strictly increasing in x";
  return undefined;
}
const staticCurve = z
  .array(point)
  .min(2)
  .max(16)
  .superRefine((points, ctx) => {
    const issue = effectCurveIssue(points);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });
const keyedCurve = animatable(staticCurve).superRefine((value, ctx) => {
  if (!isKeyed(value) || !value.keys.length) return;
  const count = (value.keys[0]!.value as unknown[]).length;
  if (value.keys.some((k) => (k.value as unknown[]).length !== count))
    ctx.addIssue({
      code: "custom",
      message: "Animated curves must keep their control point count",
    });
});
function authoredXs(point: unknown): number[] {
  if (Array.isArray(point)) return [point[0] as number];
  if (isKeyed(point))
    return point.keys.map((key) => (key.value as number[])[0]!);
  const x = (point as { x: unknown }).x;
  return typeof x === "number"
    ? [x]
    : isKeyed(x)
      ? x.keys.map((key) => key.value as number)
      : [];
}
const separatedCurve = z
  .array(pointAnimation)
  .min(2)
  .max(16)
  .superRefine((points, ctx) => {
    const xs = points.map(authoredXs);
    if (xs[0]?.some((x) => x !== 0) || xs.at(-1)?.some((x) => x !== 1))
      ctx.addIssue({
        code: "custom",
        message: "Color curve endpoints must have x = 0 and x = 1",
      });
    for (let i = 1; i < xs.length; i++) {
      const left = xs[i - 1]!,
        right = xs[i]!;
      if (
        left.length &&
        right.length &&
        left.every((x) => x === left[0]) &&
        right.every((x) => x === right[0]) &&
        left[0]! >= right[0]!
      )
        ctx.addIssue({
          code: "custom",
          message: "Color curve control points must increase in x",
        });
    }
    if (points.every(Array.isArray)) {
      const issue = effectCurveIssue(points as number[][]);
      if (issue) ctx.addIssue({ code: "custom", message: issue });
    }
  });
/** Whole-curve keys or individually animated points, retaining bounded stable topology. */
export const EffectCurveSchema = z.union([keyedCurve, separatedCurve]);
export function effectCurvePointIndex(
  index: string | undefined,
): number | undefined {
  return index !== undefined && /^p(?:[0-9]|1[0-5])$/.test(index)
    ? Number(index.slice(1))
    : undefined;
}
export function effectCurvePointCount(
  value: unknown,
  fallback: readonly unknown[],
): number {
  return Array.isArray(value)
    ? value.length
    : isKeyed(value)
      ? ((value.keys[0]?.value as unknown[] | undefined)?.length ?? 0)
      : fallback.length;
}
/** Convert joint keys into identical per-point keys before overriding one point. */
export function splitEffectCurve(
  value: unknown,
  fallback: readonly unknown[],
): unknown[] {
  if (Array.isArray(value)) return structuredClone(value);
  if (!isKeyed(value)) return structuredClone([...fallback]);
  const count = (value.keys[0]?.value as unknown[] | undefined)?.length ?? 0;
  return Array.from({ length: count }, (_, i) => ({
    keys: value.keys.map((k) => ({
      ...structuredClone(k),
      value: structuredClone((k.value as unknown[])[i]),
    })),
  }));
}
