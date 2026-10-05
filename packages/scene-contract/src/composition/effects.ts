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
export type EffectProperty = EffectScalar | EffectColor | EffectPoint;
export type EffectRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type EffectParameters = Readonly<
  Record<string, number | readonly number[]>
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
      const value =
        property.type === "vec2"
          ? {
              ...property,
              default: Object.freeze([...property.default] as [number, number]),
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
