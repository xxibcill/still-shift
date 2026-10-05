import {
  defineCompositionEffect,
  type EffectProperty,
  type EffectScalar,
  type CompositionEffectDefinition,
} from "./effect-definition.ts";
const scalar = (
  value: number,
  min: number,
  max: number,
  integer = false,
): EffectScalar => ({
  type: "scalar",
  default: value,
  min,
  max,
  ...(integer ? { integer: true } : {}),
});
const color = (value: string): EffectProperty => ({
  type: "color",
  default: value,
});
const point = (x: number, y: number): EffectProperty => ({
  type: "vec2",
  default: [x, y],
  min: -1000000,
  max: 1000000,
});
const effect = (properties: Record<string, EffectProperty>) =>
  defineCompositionEffect({
    version: "1.0.0",
    properties,
    preservesOpaque: true,
  });
/** Color corrections preserve the input coverage; color alpha scales correction strength. */
export const COLOR_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "color.curves": effect({
    curve: {
      type: "curve",
      default: [
        [0, 0],
        [1, 1],
      ],
    },
    amount: scalar(1, 0, 1),
  }),
  "color.levels": effect({
    inputBlack: scalar(0, 0, 1),
    inputWhite: scalar(1, 0, 1),
    gamma: scalar(1, 0.05, 10),
    outputBlack: scalar(0, 0, 1),
    outputWhite: scalar(1, 0, 1),
  }),
  "color.tint": effect({
    black: color("#000000"),
    white: color("#ffffff"),
    amount: scalar(1, 0, 1),
  }),
  "color.hue-saturation": effect({
    hue: scalar(0, -36000, 36000),
    saturation: scalar(0, -100, 100),
    lightness: scalar(0, -100, 100),
  }),
  "color.exposure": effect({
    exposure: scalar(0, -20, 20),
    offset: scalar(0, -1, 1),
    gamma: scalar(1, 0.05, 10),
  }),
  "color.brightness-contrast": effect({
    brightness: scalar(0, -1, 1),
    contrast: scalar(0, -1, 1),
  }),
  "color.fill": effect({ color: color("#ffffff"), amount: scalar(1, 0, 1) }),
  "color.gradient-ramp": effect({
    start: point(0, 0),
    end: point(100, 0),
    startColor: color("#000000"),
    endColor: color("#ffffff"),
    amount: scalar(1, 0, 1),
  }),
  "color.invert": effect({ amount: scalar(1, 0, 1) }),
  "color.posterize": effect({ levels: scalar(8, 2, 256, true) }),
};
