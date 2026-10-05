import {
  EffectCurveSchema,
  effectCurveIssue,
  type EffectCurveProperty,
} from "./effect-curves.ts";
export * from "./effect-curves.ts";
import { z } from "zod";
import { animatable, animatableScalar, AnimatableColorSchema } from "./keys.ts";
import { finite } from "./primitives.ts";

/** The contract owns validation and paths; the graph and backends execute effect stages. */
export type EffectScalar = {
  type: "scalar";
  default: number;
  min: number;
  max: number;
  integer?: boolean;
};
export type EffectColor = { type: "color"; default: string };
export type EffectPoint = {
  type: "vec2";
  default: readonly [number, number];
  min: number;
  max: number;
};
export type EffectProperty =
  | EffectScalar
  | EffectColor
  | EffectPoint
  | EffectCurveProperty;
export type EffectRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type EffectParameters = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
export type CompositionEffectDefinition = {
  version: string;
  params: z.ZodType;
  properties: Readonly<Record<string, EffectProperty>>;
  /** Pure, surface-space expansion. Null means input bounds cannot constrain output. */
  expandBounds?: (
    bounds: EffectRect,
    params: EffectParameters,
  ) => EffectRect | null;
  generatesContent?: boolean;
  preservesOpaque?: boolean;
  usesLayerSpace?: boolean;
};

function propertySchema(property: EffectProperty): z.ZodType {
  if (property.type === "color") return AnimatableColorSchema;
  if (property.type === "curve") return EffectCurveSchema;
  if (property.type !== "scalar" && property.type !== "vec2")
    throw Error("comp-effect-definition: unknown parameter type");
  if (
    !Number.isFinite(property.min) ||
    !Number.isFinite(property.max) ||
    property.min > property.max
  )
    throw Error("comp-effect-definition: invalid parameter range");
  let number = finite.min(property.min).max(property.max);
  if (property.type === "scalar") {
    if (property.integer) number = number.int();
    return animatableScalar(number);
  }
  return z.union([
    animatable(z.tuple([number, number]), { dimensions: 2 }),
    z
      .object({ x: animatableScalar(number), y: animatableScalar(number) })
      .strict(),
  ]);
}

/** One descriptor set owns schema validation, sampling defaults and property paths. */
export function defineCompositionEffect(
  definition: Omit<CompositionEffectDefinition, "params">,
): CompositionEffectDefinition {
  if (
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(definition.version) ||
    definition.version.length > 64
  )
    throw Error(
      "comp-effect-definition: a bounded semantic version is required",
    );
  const properties = Object.fromEntries(
    Object.entries(definition.properties).map(([name, property]) => {
      if (
        !/^[a-zA-Z][\w-]*$/.test(name) ||
        Object.hasOwn(Object.prototype, name)
      )
        throw Error("comp-effect-definition: invalid parameter identifier");
      if (
        property.type === "curve" &&
        (!Array.isArray(property.default) || effectCurveIssue(property.default))
      )
        throw Error(
          "comp-effect-definition: curve defaults must be static bounded ordered points",
        );
      const value =
        property.type === "curve"
          ? {
              ...property,
              default: Object.freeze(
                property.default.map((p) =>
                  Object.freeze([...p] as [number, number]),
                ),
              ),
            }
          : property.type === "vec2"
            ? {
                ...property,
                default: Object.freeze([...property.default] as [
                  number,
                  number,
                ]),
              }
            : { ...property };
      return [name, Object.freeze(value)];
    }),
  );
  const params = z
    .object(
      Object.fromEntries(
        Object.entries(properties).map(([name, property]) => [
          name,
          propertySchema(property).optional(),
        ]),
      ),
    )
    .strict();
  const defaults = Object.fromEntries(
    Object.entries(properties).map(([name, property]) => [
      name,
      property.default,
    ]),
  );
  if (!params.safeParse(defaults).success)
    throw Error(
      "comp-effect-definition: defaults must satisfy their parameter schemas",
    );
  return Object.freeze({
    ...definition,
    properties: Object.freeze(properties),
    params,
  });
}
