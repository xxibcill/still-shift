import { z } from "zod";
import { animatableScalar } from "./keys.ts";
import { finite } from "./primitives.ts";

/** The contract owns parameter validation and property paths; backends own kernels. */
export type EffectScalar = {
  type: "scalar";
  default: number;
  min: number;
  max: number;
};
export type CompositionEffectDefinition = {
  version: string;
  params: z.ZodType;
  properties: Readonly<Record<string, EffectScalar>>;
};

const definitions: Readonly<Record<string, CompositionEffectDefinition>> = {
  "blur.gaussian": {
    version: "1.0.0",
    params: z
      .object({ radius: animatableScalar(finite.min(0).max(1000)).optional() })
      .strict(),
    properties: { radius: { type: "scalar", default: 0, min: 0, max: 1000 } },
  },
};

export function compositionEffectDefinition(id: string) {
  return Object.hasOwn(definitions, id) ? definitions[id] : undefined;
}
