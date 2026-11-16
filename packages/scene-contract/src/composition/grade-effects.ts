import {
  defineCompositionEffect,
  type EffectProperty,
  type CompositionEffectDefinition,
} from "./effect-definition.ts";
const scalar = (value: number, min: number, max: number): EffectProperty => ({
  type: "scalar",
  default: value,
  min,
  max,
});
const effect = (properties: Record<string, EffectProperty>) =>
  defineCompositionEffect({
    version: "1.0.0",
    properties,
    preservesOpaque: true,
  });
const coefficient = (value: number) => scalar(value, -4, 4);

/** Matrix coefficient names: output channel, then input channel. */
export const COLOR_MATRIX_COEFFICIENTS = [
  ["rr", "rg", "rb"],
  ["gr", "gg", "gb"],
  ["br", "bg", "bb"],
] as const;
export const COLOR_MATRIX_OFFSETS = ["ro", "go", "bo"] as const;

/**
 * CGA primary corrections for flat SDR clips. They evaluate encoded-sRGB
 * straight bytes with integer arithmetic (or host-built tables), so Canvas and
 * WebGL produce identical bytes; neutral controls preserve the input exactly.
 */
export const GRADE_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  /** out = (I + strength·(M − I))·rgb + strength·offset, in encoded sRGB. */
  "color.matrix": effect({
    ...Object.fromEntries(
      COLOR_MATRIX_COEFFICIENTS.flatMap((row, output) =>
        row.map((name, input) => [name, coefficient(output === input ? 1 : 0)]),
      ),
    ),
    ...Object.fromEntries(
      COLOR_MATRIX_OFFSETS.map((name) => [name, scalar(0, -1, 1)]),
    ),
    strength: scalar(1, 0, 1),
  }),
  /** Linear-light channel gains: temperature blue–amber, tint green–magenta. */
  "color.white-balance": effect({
    temperature: scalar(0, -100, 100),
    tint: scalar(0, -100, 100),
  }),
  /** Saturation about encoded luma; vibrance weights low-saturation pixels. */
  "color.vibrance": effect({
    vibrance: scalar(0, -100, 100),
    saturation: scalar(0, -100, 100),
    protectSkin: scalar(0.7, 0, 1),
  }),
};
