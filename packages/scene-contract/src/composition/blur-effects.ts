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
const center: EffectProperty = {
  type: "vec2",
  default: [0.5, 0.5],
  min: 0,
  max: 1,
};
const samples = scalar(16, 2, 64, true);
export const SAMPLED_BLUR_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "blur.radial": defineCompositionEffect({
    version: "1.0.0",
    properties: { angle: scalar(0, -180, 180), center, samples },
    expandBounds: () => null,
  }),
  "blur.zoom": defineCompositionEffect({
    version: "1.0.0",
    properties: { amount: scalar(0, -1, 1), center, samples },
    expandBounds: () => null,
  }),
  "blur.lens": defineCompositionEffect({
    version: "1.0.0",
    properties: { radius: scalar(0, 0, 1000), samples },
    expandBounds: (b, p) => {
      const radius = p.radius as number;
      const r = radius === 0 ? 0 : radius + 1;
      return {
        left: b.left - r,
        top: b.top - r,
        right: b.right + r,
        bottom: b.bottom + r,
      };
    },
  }),
};
