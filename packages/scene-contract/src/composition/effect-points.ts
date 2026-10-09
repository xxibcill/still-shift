import { z } from "zod";
import { animatable, animatableScalar, isKeyed } from "./keys.ts";
import { finite } from "./primitives.ts";

/** Fixed-topology geometric controls; each point is independently addressable. */
export type EffectPointsProperty = {
  type: "points";
  default: readonly (readonly [number, number])[];
  min: number;
  max: number;
  minCount: number;
  maxCount: number;
};
export function effectPointsSchema(property: EffectPointsProperty): z.ZodType {
  if (
    !Number.isFinite(property.min) ||
    !Number.isFinite(property.max) ||
    property.min > property.max ||
    !Number.isInteger(property.minCount) ||
    !Number.isInteger(property.maxCount) ||
    property.minCount < 0 ||
    property.maxCount > 64 ||
    property.minCount > property.maxCount
  )
    throw Error("comp-effect-definition: invalid point collection bounds");
  const number = finite.min(property.min).max(property.max);
  const point = z.tuple([number, number]);
  const list = z.array(point).min(property.minCount).max(property.maxCount);
  const keyed = animatable(list).superRefine((value, ctx) => {
    if (!isKeyed(value) || !value.keys.length) return;
    const count = (value.keys[0]!.value as unknown[]).length;
    if (value.keys.some((key) => (key.value as unknown[]).length !== count))
      ctx.addIssue({
        code: "custom",
        message: "Animated point collections must keep their point count",
      });
  });
  const separated = z
    .array(
      z.union([
        animatable(point, { dimensions: 2 }),
        z
          .object({ x: animatableScalar(number), y: animatableScalar(number) })
          .strict(),
      ]),
    )
    .min(property.minCount)
    .max(property.maxCount);
  return z.union([keyed, separated]);
}
/** Shared indexed geometry paths; schemas separately constrain each collection's count. */
export function effectPointIndex(
  index: string | undefined,
): number | undefined {
  if (index === undefined || !/^p(?:[0-9]|[1-5][0-9]|6[0-3])$/.test(index))
    return undefined;
  return Number(index.slice(1));
}
