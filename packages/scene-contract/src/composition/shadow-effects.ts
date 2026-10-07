import {
  defineCompositionEffect,
  type CompositionEffectDefinition,
  type EffectProperty,
} from "./effect-definition.ts";
const properties: Record<string, EffectProperty> = {
  offset: { type: "vec2", default: [6, 6], min: -1000, max: 1000 },
  blur: { type: "scalar", default: 8, min: 0, max: 128 },
  opacity: { type: "scalar", default: 1, min: 0, max: 1 },
  color: { type: "color", default: "#000000" },
};
export const SHADOW_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "light.drop-shadow": defineCompositionEffect({
    version: "1.0.0",
    properties,
    generatesContent: true,
    preservesOpaque: true,
    expandBounds: (b, p) => {
      if ((p.opacity as number) === 0) return b;
      const offset = p.offset as readonly number[],
        r = Math.ceil((p.blur as number) * 3) + 1;
      return {
        left: Math.min(b.left, b.left + offset[0]! - r),
        top: Math.min(b.top, b.top + offset[1]! - r),
        right: Math.max(b.right, b.right + offset[0]! + r),
        bottom: Math.max(b.bottom, b.bottom + offset[1]! + r),
      };
    },
  }),
  "light.inner-shadow": defineCompositionEffect({
    version: "1.0.0",
    properties,
    preservesOpaque: true,
  }),
};
