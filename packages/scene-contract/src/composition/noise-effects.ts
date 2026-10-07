import {
  defineCompositionEffect,
  type EffectProperty,
  type CompositionEffectDefinition,
} from "./effect-definition.ts";
const scalar = (
  value: number,
  min: number,
  max: number,
  integer = false,
): EffectProperty => ({
  type: "scalar",
  default: value,
  min,
  max,
  ...(integer ? { integer: true } : {}),
});
const field = {
  seed: scalar(1, 0, 2147483647, true),
  scale: scalar(64, 1, 10000),
  octaves: scalar(4, 1, 8, true),
  evolution: scalar(0, -216000, 216000),
};
export const NOISE_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "stylize.fractal-noise": defineCompositionEffect({
    version: "1.0.0",
    preservesOpaque: true,
    properties: {
      ...field,
      amount: scalar(1, 0, 1),
      contrast: scalar(1, 0.1, 8),
      brightness: scalar(0, -1, 1),
      dark: { type: "color", default: "#000000" },
      light: { type: "color", default: "#ffffff" },
    },
  }),
  "distort.turbulent": defineCompositionEffect({
    version: "1.0.0",
    properties: { ...field, amount: scalar(0, -1000, 1000) },
    expandBounds: (b, p) => {
      const amount = Math.abs(p.amount as number);
      const r = amount ? amount / 2 + 1 : 0;
      return {
        left: b.left - r,
        top: b.top - r,
        right: b.right + r,
        bottom: b.bottom + r,
      };
    },
  }),
};
