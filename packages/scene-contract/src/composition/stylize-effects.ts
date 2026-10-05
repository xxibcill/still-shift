import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectProperty,
} from "./effect-definition.ts";
const scalar = (value: number, min: number, max: number): EffectProperty => ({
  type: "scalar",
  default: value,
  min,
  max,
});
const point = (
  value: readonly [number, number],
  min: number,
  max: number,
): EffectProperty => ({ type: "vec2", default: value, min, max });
export const STYLIZE_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "stylize.vignette": defineCompositionEffect({
    version: "1.0.0",
    preservesOpaque: true,
    properties: {
      center: point([0.5, 0.5], 0, 1),
      radius: point([100, 100], 0.01, 10000),
      softness: scalar(0.5, 0.001, 1),
      amount: scalar(0.5, 0, 1),
      color: { type: "color", default: "#000000" },
    },
  }),
  "stylize.chromatic-aberration": defineCompositionEffect({
    version: "1.0.0",
    preservesOpaque: true,
    properties: { offset: point([0, 0], -1000, 1000), amount: scalar(1, 0, 1) },
  }),
};
