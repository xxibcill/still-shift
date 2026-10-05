import { expect, it } from "vitest";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";

function easingScene(parts: number, majority = false) {
  return composition(
    (["linear", "smoothstep", "in-out-cubic", "out-cubic"] as const).map(
      (easing, i) => {
        const segments = i === (majority ? 3 : 0) ? parts : 1;
        return solid(`layer-${i}`, {
          transform: {
            position: {
              keys: Array.from({ length: segments + 1 }, (_, k) => ({
                frame: (k * 60) / segments,
                value: [80 + (k * 70) / segments, 80],
                easing: majority && i < 3 ? "linear" : easing,
              })),
            },
          },
        });
      },
    ),
    { frameCount: 61 },
  );
}

it("keeps redundant linear keys from changing the easing share", () => {
  const reports = [1, 30].map((parts) =>
    analyzeCompositionQuality(easingScene(parts), { easingMonotonyShare: 0.2 }),
  );
  for (const report of reports)
    expect(
      report.diagnostics.filter((d) => d.code === "easing-monotony"),
    ).toEqual([expect.objectContaining({ measured: 0.25 })]);
  expect(
    analyzeCompositionQuality(easingScene(30)).diagnostics.map((d) => d.code),
  ).not.toContain("easing-monotony");
});

it("finds the property majority even when a minority has more segments", () => {
  const report = analyzeCompositionQuality(easingScene(30, true), {
    easingMonotonyShare: 0.7,
  });
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({ code: "easing-monotony", measured: 0.75 }),
  );
});

it("shares each property's vote across its distinct easing profiles", () => {
  const input = composition(
    Array.from({ length: 4 }, (_, i) =>
      solid(`layer-${i}`, {
        transform: {
          position: {
            keys: [
              { frame: 0, value: [80, 80] },
              { frame: 30, value: [100, 80], easing: "linear" },
              { frame: 60, value: [150, 80], easing: "smoothstep" },
            ],
          },
        },
      }),
    ),
    { frameCount: 61 },
  );
  const report = analyzeCompositionQuality(input, { easingMonotonyShare: 0.4 });
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({ code: "easing-monotony", measured: 0.5 }),
  );
});
