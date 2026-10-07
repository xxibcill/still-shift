import { expect, it } from "vitest";
import {
  compositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  colorEffectPixel,
  colorEffectChannel,
} from "../../packages/renderer-core/src/composition/render/color-effects.ts";
const base: Composition = {
  schemaVersion: "composition-1",
  id: "color",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [{ id: "box", type: "solid", color: "#ffffff", size: [10, 10] }],
};
it.each([
  "color.levels",
  "color.tint",
  "color.hue-saturation",
  "color.exposure",
  "color.brightness-contrast",
  "color.fill",
  "color.gradient-ramp",
  "color.invert",
  "color.posterize",
])("validates animated native %s parameters", (effect) => {
  const definition = compositionEffectDefinition(effect);
  expect(definition).toBeDefined();
  expect(
    validateComposition({
      ...base,
      layers: [{ ...base.layers[0]!, effects: [{ id: "correction", effect }] }],
    }).ok,
  ).toBe(true);
  expect(definition!.params.safeParse({ unknown: 1 }).success).toBe(false);
});
it("has independent color correction reference values and preserves source coverage", () => {
  expect(
    colorEffectPixel("color.invert", [0.2, 0.4, 0.6, 0.5], { amount: 1 }, 0, 0),
  ).toEqual([0.8, 0.6, 0.4, 0.5]);
  expect(
    colorEffectPixel(
      "color.fill",
      [0.2, 0.4, 0.6, 0.5],
      { color: [1, 0, 0, 1], amount: 1 },
      0,
      0,
    ),
  ).toEqual([1, 0, 0, 0.5]);
  expect(
    colorEffectPixel(
      "color.exposure",
      [0.2, 0.4, 0.6, 0.5],
      { exposure: 1, offset: 0, gamma: 1 },
      0,
      0,
    ),
  ).toEqual([0.4, 0.8, 1, 0.5]);
  expect(
    colorEffectPixel(
      "color.posterize",
      [0.2, 0.4, 0.6, 0.5],
      { levels: 3 },
      0,
      0,
    ),
  ).toEqual([0, 0.5, 0.5, 0.5]);
  expect(
    colorEffectPixel(
      "color.tint",
      [0, 0, 0, 0.5],
      { black: [1, 0, 0, 1], white: [0, 1, 0, 1], amount: 1 },
      0,
      0,
    ),
  ).toEqual([1, 0, 0, 0.5]);
  expect(
    colorEffectPixel(
      "color.tint",
      [1, 1, 1, 0.5],
      { black: [1, 0, 0, 1], white: [0, 1, 0, 1], amount: 1 },
      0,
      0,
    ),
  ).toEqual([0, 1, 0, 0.5]);
});
it("projects gradient endpoints, including reversed and coincident points", () => {
  const p = {
    start: [0, 0],
    end: [10, 0],
    startColor: [1, 0, 0, 1],
    endColor: [0, 0, 1, 1],
    amount: 1,
  };
  expect(
    colorEffectPixel("color.gradient-ramp", [0, 0, 0, 0.5], p, 5, 0),
  ).toEqual([0.5, 0, 0.5, 0.5]);
  expect(
    colorEffectPixel(
      "color.gradient-ramp",
      [0, 0, 0, 0.5],
      { ...p, start: [10, 0], end: [0, 0] },
      0,
      0,
    ),
  ).toEqual([0, 0, 1, 0.5]);
  expect(
    colorEffectPixel(
      "color.gradient-ramp",
      [0, 0, 0, 0.5],
      { ...p, end: [0, 0] },
      5,
      0,
    ),
  ).toEqual([1, 0, 0, 0.5]);
});
it("does not change neutral correction controls or fully transparent colors", () => {
  const pixel: [number, number, number, number] = [0.2, 0.4, 0.6, 0.5];
  for (const [effect, p] of [
    [
      "color.levels",
      {
        inputBlack: 0,
        inputWhite: 1,
        gamma: 1,
        outputBlack: 0,
        outputWhite: 1,
      },
    ],
    ["color.hue-saturation", { hue: 0, saturation: 0, lightness: 0 }],
    ["color.brightness-contrast", { brightness: 0, contrast: 0 }],
    ["color.fill", { color: [1, 0, 0, 0], amount: 1 }],
  ] as const) {
    const result = colorEffectPixel(effect, pixel, p, 0, 0);
    result.forEach((value, index) =>
      expect(value).toBeCloseTo(pixel[index]!, 12),
    );
  }
});

it("recovers every valid premultiplied byte pair and gives half-byte ties a stable rule", () => {
  expect(colorEffectChannel(76, 50)).toBe(77 / 255);
  expect(colorEffectChannel(76, 30)).toBe(77 / 255);
  expect(colorEffectChannel(255, 0)).toBe(0);
  for (let alpha = 1; alpha <= 255; alpha++)
    for (let premultiplied = 0; premultiplied <= alpha; premultiplied++) {
      const straight = Math.round((premultiplied * 255) / alpha);
      const corrected = colorEffectChannel(straight, alpha);
      expect(Math.round(corrected * alpha)).toBe(premultiplied);
    }
});
