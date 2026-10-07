import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  mapChannel,
  mapDisplacement,
  wipeCoverage,
} from "../../packages/renderer-core/src/composition/render/map-effects.ts";
it("declares a scoped map and bounded animated controls", () => {
  expect(
    compositionEffectDefinition("distort.displacement-map")!.requiresLayers,
  ).toEqual(["map"]);
  expect(
    compositionEffectDefinition("transition.gradient-wipe")!.params.safeParse({
      channel: 5,
    }).success,
  ).toBe(false);
});
it("has independent neutral, signed and transparent map displacement oracles", () => {
  expect(mapDisplacement(128, 255, 128, 160)).toBe(0);
  expect(mapDisplacement(255, 255, 128, 160)).toBe(79);
  expect(mapDisplacement(0, 255, 128, 160)).toBe(-81);
  expect(mapDisplacement(255, 0, 128, 160)).toBe(0);
  expect(mapDisplacement(255, 255, 128, -160)).toBe(-80);
  expect(mapChannel([255, 0, 0, 255], 4)).toBe(54);
});
it("preserves transition endpoints and transparent map support", () => {
  const p = { progress: 0.5, softness: 0, invert: 0 };
  expect(wipeCoverage(0, 255, { ...p, progress: 0 })).toBe(255);
  expect(wipeCoverage(255, 255, { ...p, progress: 1 })).toBe(0);
  expect(wipeCoverage(0, 255, p)).toBe(0);
  expect(wipeCoverage(255, 255, p)).toBe(255);
  expect(wipeCoverage(0, 0, p)).toBe(255);
  expect(wipeCoverage(255, 255, { ...p, invert: 1 })).toBe(0);
});
