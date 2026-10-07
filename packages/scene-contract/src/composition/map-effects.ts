import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectProperty,
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
export const MAP_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "distort.displacement-map": defineCompositionEffect({
    version: "1.0.0",
    requiresLayers: ["map"],
    properties: {
      amount: { type: "vec2", default: [0, 0], min: -1000, max: 1000 },
      channelX: scalar(0, 0, 4, true),
      channelY: scalar(1, 0, 4, true),
      midpoint: scalar(0.5, 0, 1),
    },
    expandBounds: (b, p) => {
      const a = p.amount as readonly number[],
        x = a[0] === 0 ? 0 : Math.abs(a[0]!) + 1,
        y = a[1] === 0 ? 0 : Math.abs(a[1]!) + 1;
      return {
        left: b.left - x,
        top: b.top - y,
        right: b.right + x,
        bottom: b.bottom + y,
      };
    },
  }),
  "transition.gradient-wipe": defineCompositionEffect({
    version: "1.0.0",
    requiresLayers: ["map"],
    properties: {
      progress: scalar(0, 0, 1),
      softness: scalar(0, 0, 1),
      channel: scalar(4, 0, 4, true),
      invert: scalar(0, 0, 1, true),
    },
  }),
};
