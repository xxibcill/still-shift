import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  vignetteStrength,
  chromaticOffset,
} from "../../packages/renderer-core/src/composition/render/stylize-effects.ts";
it("validates animated vignette/chromatic controls", () => {
  expect(
    compositionEffectDefinition("stylize.vignette")!.params.safeParse({
      radius: [0, 1],
    }).success,
  ).toBe(false);
  expect(
    compositionEffectDefinition(
      "stylize.chromatic-aberration",
    )!.params.safeParse({
      offset: {
        keys: [
          { frame: 0, value: [0, 0] },
          { frame: 10, value: [4, -3] },
        ],
      },
    }).success,
  ).toBe(true);
});
it("has independent elliptical center, edge and soft shoulder oracles", () => {
  const p = {
    center: [0.5, 0.5] as [number, number],
    radius: [40, 20] as [number, number],
    softness: 0.5,
    amount: 0.8,
  };
  expect(vignetteStrength(p, 50, 30, 100, 60)).toBe(0);
  expect(vignetteStrength(p, 90, 30, 100, 60)).toBeCloseTo(0.8, 7);
  expect(vignetteStrength(p, 80, 30, 100, 60)).toBeCloseTo(0.4, 7);
  expect(vignetteStrength(p, 50, 45, 100, 60)).toBeCloseTo(0.4, 7);
  expect(vignetteStrength({ ...p, amount: 0 }, 100, 100, 100, 60)).toBe(0);
});
it("quantizes signed chromatic offsets to the common sixteenth pixel sampling grid", () => {
  expect(chromaticOffset({ offset: [3.02, -4.03] })).toEqual([3, -4]);
  expect(chromaticOffset({ offset: [0, 0] })).toEqual([0, 0]);
});
