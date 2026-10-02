import { z } from "zod";
import { animatableScalar } from "./keys.ts";
import { finite } from "./primitives.ts";

/** The contract owns parameter validation and property paths; backends own kernels. */
export type EffectScalar = {
  type: "scalar";
  default: number;
  min: number;
  max: number;
  integer?: boolean;
};
export type CompositionEffectDefinition = {
  version: string;
  params: z.ZodType;
  properties: Readonly<Record<string, EffectScalar>>;
};

function scalarEffect(
  properties: Record<string, Omit<EffectScalar, "type">>,
): CompositionEffectDefinition {
  return {
    version: "1.0.0",
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        { ...property, type: "scalar" as const },
      ]),
    ),
    params: z
      .object(
        Object.fromEntries(
          Object.entries(properties).map(([name, property]) => {
            let number = finite.min(property.min).max(property.max);
            if (property.integer) number = number.int();
            return [name, animatableScalar(number).optional()];
          }),
        ),
      )
      .strict(),
  };
}

const definitions: Readonly<Record<string, CompositionEffectDefinition>> = {
  "blur.gaussian": scalarEffect({ radius: { default: 0, min: 0, max: 1000 } }),
  "blur.directional": scalarEffect({
    length: { default: 0, min: 0, max: 1000 },
    angle: { default: 0, min: -36000, max: 36000 },
    samples: { default: 8, min: 2, max: 64, integer: true },
  }),
  "light.glow": scalarEffect({
    radius: { default: 0, min: 0, max: 1000 },
    intensity: { default: 1, min: 0, max: 1 },
    threshold: { default: 0, min: 0, max: 1 },
  }),
  "distort.sine": scalarEffect({
    amount: { default: 0, min: -1000, max: 1000 },
    wavelength: { default: 100, min: 1, max: 100000 },
    phase: { default: 0, min: -1000000, max: 1000000 },
  }),
};

export function compositionEffectDefinition(id: string) {
  return Object.hasOwn(definitions, id) ? definitions[id] : undefined;
}
