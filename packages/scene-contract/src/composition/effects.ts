import { z } from "zod";
import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectScalar,
} from "./effect-definition.ts";
import { STYLIZE_EFFECT_DEFINITIONS } from "./stylize-effects.ts";
import { NOISE_EFFECT_DEFINITIONS } from "./noise-effects.ts";
import { WARP_EFFECT_DEFINITIONS } from "./warp-effects.ts";
import { SAMPLED_BLUR_DEFINITIONS } from "./blur-effects.ts";
import { COLOR_EFFECT_DEFINITIONS } from "./color-effects.ts";
import { TRANSITION_EFFECT_DEFINITIONS } from "./transition-effects.ts";
export * from "./effect-definition.ts";

function defineEffect(
  properties: Record<string, Omit<EffectScalar, "type">>,
  colors: Record<string, string> = {},
  options: Pick<
    CompositionEffectDefinition,
    "generatesContent" | "preservesOpaque" | "usesLayerSpace"
  > = {},
): CompositionEffectDefinition {
  return defineCompositionEffect({
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
  });
}

export const COMPOSITION_EFFECTS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  ...COLOR_EFFECT_DEFINITIONS,
  ...TRANSITION_EFFECT_DEFINITIONS,
  ...SAMPLED_BLUR_DEFINITIONS,
  ...WARP_EFFECT_DEFINITIONS,
  ...NOISE_EFFECT_DEFINITIONS,
  ...STYLIZE_EFFECT_DEFINITIONS,
  "blur.primitive": defineEffect({ radius: { default: 0, min: 0, max: 1000 } }),
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

const registered = new Map<string, CompositionEffectDefinition>();
let revision = 0;

/** Register before validating/rendering; cleanup cannot remove a later registration. */
export function registerCompositionEffectDefinition(
  id: string,
  definition: CompositionEffectDefinition,
): () => void {
  if (
    !/^[a-z][\w.-]*$/.test(id) ||
    id.length > 64 ||
    Object.hasOwn(Object.prototype, id) ||
    compositionEffectDefinition(id)
  )
    throw Error(`comp-effect-registration: invalid or duplicate effect ${id}`);
  if (!definition.params || typeof definition.params.safeParse !== "function")
    throw Error(
      "comp-effect-registration: a validated effect definition is required",
    );
  const declared = defineCompositionEffect(definition);
  const normalized = Object.freeze({
    ...declared,
    params: z.intersection(declared.params, definition.params),
  });
  const defaults = Object.fromEntries(
    Object.entries(declared.properties).map(([name, property]) => [
      name,
      property.default,
    ]),
  );
  if (!normalized.params.safeParse(defaults).success)
    throw Error(
      "comp-effect-registration: defaults fail the supplied parameter schema",
    );
  registered.set(id, normalized);
  revision++;
  return () => {
    if (registered.get(id) !== normalized) return;
    registered.delete(id);
    revision++;
  };
}

/** Compiled path/validation caches must not outlive plugin registration changes. */
export function compositionEffectRegistryRevision(): number {
  return revision;
}

export function compositionEffectDefinition(id: string) {
  return (
    registered.get(id) ??
    (Object.hasOwn(COMPOSITION_EFFECTS, id)
      ? COMPOSITION_EFFECTS[id]
      : undefined)
  );
}
