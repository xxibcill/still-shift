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
const effect = (properties: Record<string, EffectProperty>) =>
  defineCompositionEffect({ version: "1.0.1", properties });
const shared = { progress: scalar(0, 0, 1), softness: scalar(0, 0, 1) };
/** Progress removes coverage in surface space; zero preserves the input and one clears it. */
export const TRANSITION_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "transition.linear-wipe": effect({
    ...shared,
    angle: scalar(0, -36000, 36000),
  }),
  "transition.radial-wipe": effect({
    ...shared,
    angle: scalar(0, -36000, 36000),
    center: { type: "vec2", default: [0.5, 0.5], min: 0, max: 1 },
  }),
  "transition.venetian-blinds": effect({
    ...shared,
    angle: scalar(0, -36000, 36000),
    width: scalar(16, 1, 8192),
  }),
  "transition.block-dissolve": effect({
    ...shared,
    width: scalar(16, 1, 8192),
    height: scalar(16, 1, 8192),
    seed: scalar(1, 0, 2147483647, true),
  }),
};
