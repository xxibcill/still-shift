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
const center: EffectProperty = {
  type: "vec2",
  default: [0.5, 0.5],
  min: 0,
  max: 1,
};
export const RADIAL_DISTORTION_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "distort.bulge": defineCompositionEffect({
    version: "1.0.0",
    properties: {
      center,
      radius: { type: "vec2", default: [100, 100], min: 1 / 16, max: 10000 },
      amount: scalar(0, -1, 1),
    },
    expandBounds: () => null,
  }),
  "distort.ripple": defineCompositionEffect({
    version: "1.0.0",
    properties: {
      center,
      amplitude: scalar(0, -1000, 1000),
      wavelength: scalar(64, 1, 100000),
      phase: scalar(0, -36000, 36000),
      decay: scalar(0, 0, 1),
    },
    expandBounds: (b, p) => {
      const amount = Math.abs(p.amplitude as number),
        r = amount ? amount + 1 : 0;
      return {
        left: b.left - r,
        top: b.top - r,
        right: b.right + r,
        bottom: b.bottom + r,
      };
    },
  }),
};
