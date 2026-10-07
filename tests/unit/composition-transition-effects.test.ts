import { expect, it } from "vitest";
import {
  compositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  transitionCoverage,
  transitionBlockRank,
} from "../../packages/renderer-core/src/composition/render/transition-effects.ts";
const ids = [
  "transition.linear-wipe",
  "transition.radial-wipe",
  "transition.venetian-blinds",
  "transition.block-dissolve",
];
it("defines bounded animated transition controls with an unchanged default", () => {
  for (const effect of ids) {
    const definition = compositionEffectDefinition(effect)!;
    expect(definition.version).toBe("1.0.1");
    expect(definition.params.safeParse({ progress: 1.1 }).success).toBe(false);
    expect(
      definition.params.safeParse({
        progress: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 1 },
          ],
        },
      }).success,
    ).toBe(true);
    const params = Object.fromEntries(
      Object.entries(definition.properties).map(([name, p]) => [
        name,
        p.default,
      ]),
    ) as Record<string, number | readonly number[]>;
    for (const x of [0.5, 30.5, 63.5]) {
      expect(transitionCoverage(effect, params, x, 20.5, 64, 48)).toBe(1);
      expect(
        transitionCoverage(effect, { ...params, progress: 1 }, x, 20.5, 64, 48),
      ).toBe(0);
    }
  }
});
it("matches independent linear and repeated strip coverage", () => {
  expect(
    transitionCoverage(
      ids[0]!,
      { progress: 0.5, angle: 0, softness: 0 },
      8.5,
      5.5,
      64,
      48,
    ),
  ).toBe(0);
  expect(
    transitionCoverage(
      ids[0]!,
      { progress: 0.5, angle: 0, softness: 0 },
      48.5,
      5.5,
      64,
      48,
    ),
  ).toBe(1);
  expect(
    transitionCoverage(
      ids[2]!,
      { progress: 0.5, angle: 0, softness: 0, width: 16 },
      3.5,
      5.5,
      64,
      48,
    ),
  ).toBe(0);
  expect(
    transitionCoverage(
      ids[2]!,
      { progress: 0.5, angle: 0, softness: 0, width: 16 },
      11.5,
      5.5,
      64,
      48,
    ),
  ).toBe(1);
});
it("keeps seeded block ranks stable and decorrelates blocks and seeds", () => {
  const rank = transitionBlockRank(2, 3, 2147483647);
  expect(rank).toBe(transitionBlockRank(2, 3, 2147483647));
  expect(rank).not.toBe(transitionBlockRank(2, 3, 1));
  expect(rank).not.toBe(transitionBlockRank(3, 3, 2147483647));
  expect(rank).toBeGreaterThanOrEqual(0);
  expect(rank).toBeLessThan(1);
});
it("accepts every transition on a native adjustment layer", () => {
  for (const effect of ids) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "wipe",
      width: 64,
      height: 48,
      fps: 24,
      frameCount: 12,
      assets: [],
      layers: [
        { id: "art", type: "solid", size: [64, 48], color: "#ffffff" },
        {
          id: "wipe",
          type: "adjustment",
          effects: [{ id: "wipe", effect, params: { progress: 0.5 } }],
        },
      ],
    };
    expect(validateComposition(comp).ok).toBe(true);
  }
});

it("defines radial center coverage and repeated full-turn angles", () => {
  const params = { progress: 0.5, softness: 0, center: [0.5, 0.5], angle: 0 };
  expect(
    transitionCoverage("transition.radial-wipe", params, 32.5, 24.5, 65, 49),
  ).toBe(0);
  for (const angle of [-36000, 0, 36000])
    expect(
      transitionCoverage(
        "transition.radial-wipe",
        { ...params, angle },
        20.5,
        5.5,
        65,
        49,
      ),
    ).toBe(1);
});
