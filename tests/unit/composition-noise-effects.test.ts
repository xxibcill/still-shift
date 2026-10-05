import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  noiseField,
  noiseHash,
  noiseControls,
  turbulentOffset,
  fractalNoiseColor,
} from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
it("defines bounded seeded animated field controls", () => {
  for (const id of ["stylize.fractal-noise", "distort.turbulent"]) {
    const definition = compositionEffectDefinition(id)!;
    expect(definition.params.safeParse({ octaves: 9 }).success).toBe(false);
    expect(
      definition.params.safeParse({
        seed: 2147483647,
        evolution: {
          keys: [
            { frame: 0, value: -10 },
            { frame: 10, value: 10 },
          ],
        },
      }).success,
    ).toBe(true);
  }
});
it("keeps integer hash and noise fields reproducible across seed/evolution extremes", () => {
  const params = {
    seed: 2147483647,
    scale: 73.25,
    octaves: 8,
    evolution: -215999.123,
  };
  const controls = noiseControls(params);
  const value = noiseField(controls, 20.5, 12.5);
  expect(Number.isInteger(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(65535);
  expect(value).toBe(noiseField(noiseControls({ ...params }), 20.5, 12.5));
  expect(value).not.toBe(
    noiseField(noiseControls({ ...params, seed: 1 }), 20.5, 12.5),
  );
  expect(noiseHash(0, 0, 0, 0)).toBe(0);
});
it("uses an independent signed displacement quotient with neutral amplitude", () => {
  expect(turbulentOffset(32768, 1000)).toBe(0);
  expect(turbulentOffset(0, 1000)).toBe(-501);
  expect(turbulentOffset(65535, 1000)).toBe(499);
  expect(turbulentOffset(0, -1000)).toBe(500);
  expect(turbulentOffset(12345, 0)).toBe(0);
});

it("uses independent black/white, color-alpha and coverage-free fill oracles", () => {
  const params = {
    contrast: 1,
    brightness: 0,
    amount: 1,
    dark: [0, 0, 0, 1],
    light: [1, 1, 1, 1],
  };
  expect(fractalNoiseColor(0, params, [0.2, 0.4, 0.6])).toEqual([0, 0, 0]);
  expect(fractalNoiseColor(65535, params, [0.2, 0.4, 0.6])).toEqual([1, 1, 1]);
  const partial = fractalNoiseColor(
    65535,
    { ...params, amount: 0.5, light: [1, 1, 1, 0.5] },
    [0.2, 0.4, 0.6],
  );
  for (const [i, value] of [0.4, 0.55, 0.7].entries())
    expect(partial[i]).toBeCloseTo(value, 12);
  expect(
    fractalNoiseColor(12345, { ...params, amount: 0 }, [0.2, 0.4, 0.6]),
  ).toEqual([0.2, 0.4, 0.6]);
});
it("expands turbulent bounds conservatively and preserves neutral support", () => {
  const bounds = { left: 10, top: 20, right: 30, bottom: 40 },
    expand = compositionEffectDefinition("distort.turbulent")!.expandBounds!;
  expect(expand(bounds, { amount: 0 })).toEqual(bounds);
  expect(expand(bounds, { amount: 1000 })).toEqual({
    left: -491,
    top: -481,
    right: 531,
    bottom: 541,
  });
});
