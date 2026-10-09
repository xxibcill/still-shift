import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectParameters,
  type EffectProperty,
} from "./effect-definition.ts";
const scalar = (value: number, min: number, max: number): EffectProperty => ({
  type: "scalar",
  default: value,
  min,
  max,
  integer: true,
});
const points = (
  defaultValue: readonly (readonly [number, number])[],
  minCount: number,
  maxCount: number,
  min = -1000000,
  max = 1000000,
): EffectProperty => ({
  type: "points",
  default: defaultValue,
  minCount,
  maxCount,
  min,
  max,
});
const list = (params: EffectParameters, name: string) =>
  params[name] as readonly (readonly number[])[];
function matchingRegions(
  params: EffectParameters,
  centers: string,
  settings: string,
  starch: boolean,
) {
  const positions = list(params, centers),
    values = list(params, settings);
  if (positions.length !== values.length)
    throw Error(`${centers} and ${settings} must have the same count`);
  if (
    values.some(
      (value) => value[0]! <= 0 || (starch && (value[1]! < 0 || value[1]! > 1)),
    )
  )
    throw Error(
      starch
        ? "Starch regions need a positive radius and strength from 0 to 1"
        : "Overlap regions need a positive radius",
    );
}
function validatePuppet(params: EffectParameters) {
  const rest = list(params, "rest"),
    pins = list(params, "pins");
  if (rest.length !== pins.length)
    throw Error("Puppet rest and pin positions must have the same count");
  for (let i = 0; i < rest.length; i++)
    for (let j = 0; j < i; j++)
      if (
        (rest[i]![0]! - rest[j]![0]!) ** 2 +
          (rest[i]![1]! - rest[j]![1]!) ** 2 <
        1e-12
      )
        throw Error(
          "Puppet rest pins must be distinct (at least 0.000001 pixel apart)",
        );
  matchingRegions(params, "starchCenters", "starch", true);
  matchingRegions(params, "overlapCenters", "overlap", false);
}
export const MESH_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "distort.mesh-warp": defineCompositionEffect({
    version: "1.0.0",
    usesLayerSpace: true,
    expandBounds: () => null,
    properties: {
      columns: scalar(2, 2, 8),
      rows: scalar(2, 2, 8),
      subdivisions: scalar(24, 1, 64),
      origin: { type: "vec2", default: [0, 0], min: -1000000, max: 1000000 },
      size: { type: "vec2", default: [100, 100], min: 1, max: 8192 },
      controls: points(
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
        4,
        64,
        -10,
        10,
      ),
    },
    validateParams: (params) => {
      if (
        list(params, "controls").length !==
        (params.columns as number) * (params.rows as number)
      )
        throw Error(
          "Bezier grid needs one row-major control per column and row",
        );
    },
  }),
  "distort.puppet": defineCompositionEffect({
    version: "1.0.0",
    usesLayerSpace: true,
    expandBounds: () => null,
    properties: {
      rest: points([], 0, 32),
      pins: points([], 0, 32),
      starchCenters: points([], 0, 8),
      starch: points([], 0, 8, 0, 1000000),
      overlapCenters: points([], 0, 8),
      overlap: points([], 0, 8),
      alphaThreshold: scalar(1, 1, 255),
      refinement: scalar(2, 0, 3),
    },
    validateParams: validatePuppet,
  }),
};
