import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  radialDistortionControls,
  radialSourcePoint,
} from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
it("validates bounded animated radial geometry", () => {
  expect(
    compositionEffectDefinition("distort.bulge")!.params.safeParse({
      radius: [0, 50],
    }).success,
  ).toBe(false);
  expect(
    compositionEffectDefinition("distort.ripple")!.params.safeParse({
      wavelength: 0,
    }).success,
  ).toBe(false);
});
it("keeps center, exterior and neutral bulge positions exact", () => {
  const p = { center: [0.5, 0.5], radius: [32, 16], amount: 1 },
    c = radialDistortionControls("distort.bulge", p, 128, 64);
  expect(radialSourcePoint(c, 64, 32)).toEqual([64, 32]);
  expect(radialSourcePoint(c, 100, 32)).toEqual([100, 32]);
  // Half-radius: factor = 1 - (1 - 1/4)^2 = 7/16.
  expect(radialSourcePoint(c, 80, 32)).toEqual([71, 32]);
  expect(
    radialSourcePoint(
      radialDistortionControls("distort.bulge", { ...p, amount: 0 }, 128, 64),
      80,
      32,
    ),
  ).toEqual([80, 32]);
});
it("uses independently known ripple quarter-cycle displacement", () => {
  const c = radialDistortionControls(
    "distort.ripple",
    { center: [0.5, 0.5], amplitude: 4, wavelength: 32, phase: 0, decay: 0 },
    128,
    64,
  );
  expect(radialSourcePoint(c, 72, 32)).toEqual([76, 32]);
  expect(radialSourcePoint(c, 64, 32)).toEqual([64, 32]);
  expect(radialSourcePoint(c, 56, 32)).toEqual([52, 32]);
});
it("keeps neutral bounds and covers signed ripple displacement", () => {
  const bounds = { left: 10, top: 20, right: 30, bottom: 40 },
    expand = compositionEffectDefinition("distort.ripple")!.expandBounds!;
  expect(expand(bounds, { amplitude: 0 })).toEqual(bounds);
  expect(expand(bounds, { amplitude: -1000 })).toEqual({
    left: -991,
    top: -981,
    right: 1031,
    bottom: 1041,
  });
});
