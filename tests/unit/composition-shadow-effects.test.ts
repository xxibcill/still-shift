import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  shadowGaussianKernel,
  shadowCompositePixel,
  blurShadowMask,
} from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
it("uses bounded symmetric Gaussian weights and an exact neutral kernel", () => {
  expect(shadowGaussianKernel(0)).toEqual({
    radius: 0,
    weights: [4096],
    total: 4096,
  });
  const k = shadowGaussianKernel(2);
  expect(k.radius).toBe(6);
  expect(k.weights).toEqual([...k.weights].reverse());
  expect(k.weights[6]).toBeGreaterThan(k.weights[5]!);
  expect(
    compositionEffectDefinition("light.drop-shadow")!.params.safeParse({
      blur: 129,
    }).success,
  ).toBe(false);
});
it("composites an independent opaque, empty and translucent drop-shadow oracle", () => {
  const p = { color: [0, 0, 0, 1], opacity: 1 };
  expect(shadowCompositePixel(false, [255, 0, 0, 255], 255, p)).toEqual([
    255, 0, 0, 255,
  ]);
  expect(shadowCompositePixel(false, [0, 0, 0, 0], 128, p)).toEqual([
    0, 0, 0, 128,
  ]);
  expect(shadowCompositePixel(false, [128, 0, 0, 128], 255, p)).toEqual([
    128, 0, 0, 255,
  ]);
  expect(shadowCompositePixel(true, [128, 0, 0, 128], 255, p)).toEqual([
    0, 0, 0, 128,
  ]);
});
it("blurs an independent impulse with exact fixed per-axis rounding", () => {
  const mask = new Uint8Array([0, 0, 255, 0, 0]),
    kernel = { radius: 1, weights: [1, 2, 1], total: 4 };
  expect(Array.from(blurShadowMask(mask, 5, 1, kernel, [1, 0], 0))).toEqual([
    0, 64, 128, 64, 0,
  ]);
  expect(
    Array.from(
      blurShadowMask(new Uint8Array(5).fill(255), 5, 1, kernel, [1, 0], 255),
    ),
  ).toEqual([255, 255, 255, 255, 255]);
});
