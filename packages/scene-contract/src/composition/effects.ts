import { z } from "zod";
import { animatableScalar, AnimatableColorSchema } from "./keys.ts";
import { finite } from "./primitives.ts";

/** The contract owns parameter validation and property paths; backends own kernels. */
export type EffectScalar = {
  type: "scalar";
  default: number;
  min: number;
  max: number;
  integer?: boolean;
};
export type EffectColor = { type: "color"; default: string };
export type CompositionEffectDefinition = {
  version: string;
  params: z.ZodType;
  properties: Readonly<Record<string, EffectScalar | EffectColor>>;
  generatesContent?: boolean;
  preservesOpaque?: boolean;
  usesLayerSpace?: boolean;
};

function defineEffect(
  properties: Record<string, Omit<EffectScalar, "type">>,
  colors: Record<string, string> = {},
  options: Pick<
    CompositionEffectDefinition,
    "generatesContent" | "preservesOpaque" | "usesLayerSpace"
  > = {},
): CompositionEffectDefinition {
  return {
    version: "1.0.0",
    ...options,
    properties: Object.fromEntries([
      ...Object.entries(properties).map(([name, property]) => [
        name,
        { ...property, type: "scalar" as const },
      ]),
      ...Object.entries(colors).map(([name, value]) => [
        name,
        { type: "color" as const, default: value },
      ]),
    ]),
    params: z
      .object(
        Object.fromEntries([
          ...Object.entries(properties).map(([name, property]) => {
            let number = finite.min(property.min).max(property.max);
            if (property.integer) number = number.int();
            return [name, animatableScalar(number).optional()];
          }),
          ...Object.keys(colors).map((name) => [
            name,
            AnimatableColorSchema.optional(),
          ]),
        ]),
      )
      .strict(),
  };
}

const definitions: Readonly<Record<string, CompositionEffectDefinition>> = {
  "time.echo": defineEffect(
    {
      spacing: { default: 1, min: 1, max: 120 },
      count: { default: 3, min: 1, max: 8, integer: true },
      decay: { default: 0.5, min: 0, max: 1 },
      skipUnchanged: { default: 0, min: 0, max: 1, integer: true },
      sourceRevision: { default: 0, min: 0, max: 1000000, integer: true },
    },
    {},
    { generatesContent: true },
  ),
  "light.sweep": defineEffect(
    {
      width: { default: 100, min: 0, max: 1000000 },
      height: { default: 100, min: 0, max: 1000000 },
      left: { default: 0, min: 0, max: 1 },
      top: { default: 0, min: 0, max: 1 },
      regionWidth: { default: 1, min: 0.001, max: 1 },
      regionHeight: { default: 1, min: 0.001, max: 1 },
      band: { default: 0.1, min: 0.001, max: 1 },
      progress: { default: 0, min: 0, max: 1 },
      strength: { default: 0.5, min: 0, max: 1 },
    },
    {},
    { usesLayerSpace: true, preservesOpaque: true },
  ),
  "light.radial": defineEffect(
    {
      x: { default: 0, min: -1000000, max: 1000000 },
      y: { default: 0, min: -1000000, max: 1000000 },
      radius: { default: 100, min: 0.01, max: 10000 },
      strength: { default: 1, min: 0, max: 1 },
    },
    { color: "#ffffff" },
    { generatesContent: true, preservesOpaque: true },
  ),
  "particles.rise": defineEffect(
    {
      count: { default: 20, min: 1, max: 100, integer: true },
      radius: { default: 2, min: 0.01, max: 100 },
      opacity: { default: 0.5, min: 0, max: 1 },
      seed: { default: 1, min: 0, max: 2147483647, integer: true },
      progress: { default: 0, min: 0, max: 1000 },
    },
    { color: "#ffffff" },
    { generatesContent: true, preservesOpaque: true },
  ),
  "stylize.grain": defineEffect(
    {
      amount: { default: 0, min: 0, max: 1 },
      seed: { default: 1, min: 0, max: 2147483647, integer: true },
      evolution: { default: 0, min: -216000, max: 216000 },
    },
    {},
    { generatesContent: true, preservesOpaque: true },
  ),
  "blur.gaussian": defineEffect({ radius: { default: 0, min: 0, max: 1000 } }),
  "blur.directional": defineEffect({
    length: { default: 0, min: 0, max: 1000 },
    angle: { default: 0, min: -36000, max: 36000 },
    samples: { default: 8, min: 2, max: 64, integer: true },
  }),
  "light.glow": defineEffect({
    radius: { default: 0, min: 0, max: 1000 },
    intensity: { default: 1, min: 0, max: 1 },
    threshold: { default: 0, min: 0, max: 1 },
  }),
  "distort.sine": defineEffect({
    amount: { default: 0, min: -1000, max: 1000 },
    wavelength: { default: 100, min: 1, max: 100000 },
    phase: { default: 0, min: -1000000, max: 1000000 },
  }),
};

export function compositionEffectDefinition(id: string) {
  return Object.hasOwn(definitions, id) ? definitions[id] : undefined;
}
