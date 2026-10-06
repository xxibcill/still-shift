import { expect, it } from "vitest";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { validateComposition } from "../../packages/scene-contract/src/index.ts";
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

function overriddenScene(property: "rotation" | "effect") {
  return composition(
    (["linear", "smoothstep", "in-out-cubic", "out-cubic"] as const).map(
      (easing, i) =>
        solid(`layer-${i}`, {
          transform: {
            position: {
              keys: [
                { frame: i * 5, value: [80, 80] },
                { frame: i * 5 + 50, value: [200, 80], easing },
              ],
            },
            ...(property === "rotation"
              ? {
                  rotation: {
                    keys: [
                      { frame: 0, value: 0 },
                      { frame: 89, value: 90 },
                    ],
                  },
                }
              : {}),
          },
          ...(property === "effect"
            ? {
                effects: [
                  {
                    id: "blur",
                    effect: "blur.gaussian",
                    params: {
                      radius: {
                        keys: [
                          { frame: 0, value: 0 },
                          { frame: 89, value: 20 },
                        ],
                      },
                    },
                  },
                ],
              }
            : {}),
        }),
    ),
    {
      expressions: Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `layer-${i}.${property === "rotation" ? "transform.rotation" : "effects[blur].radius"}`,
          { source: "0" },
        ]),
      ),
    },
  );
}

it.each(["rotation", "effect"] as const)(
  "does not count overridden %s keys as motion of another property",
  (property) => {
    const input = overriddenScene(property);
    const control = structuredClone(input);
    for (const layer of control.layers) {
      if (property === "rotation") layer.transform!.rotation = 0;
      else layer.effects![0]!.params!.radius = 0;
    }
    for (let frame = 0; frame < input.frameCount; frame++)
      expect(compositionQualityFrame(input, frame).signature).toBe(
        compositionQualityFrame(control, frame).signature,
      );
    for (const report of [
      analyzeCompositionQuality(input),
      analyzeCompositionQuality(control),
    ])
      expect(
        report.diagnostics.filter((d) =>
          ["co-start", "easing-monotony"].includes(d.code),
        ),
      ).toEqual([]);
  },
);

it("retains timing findings for an evaluated moving vector component", () => {
  const input = composition(
    Array.from({ length: 4 }, (_, i) =>
      solid(`layer-${i}`, {
        transform: {
          position: {
            keys: [
              { frame: 0, value: [80, 80] },
              { frame: 89, value: [200, 150], easing: "linear" },
            ],
          },
        },
      }),
    ),
    {
      expressions: Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `layer-${i}.transform.position.x`,
          { source: "80" },
        ]),
      ),
    },
  );
  const report = analyzeCompositionQuality(input);
  for (const code of ["co-start", "easing-monotony"])
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code, measured: code === "co-start" ? 4 : 1 }),
    );
});

it.each(["position", "anchor", "scale"] as const)(
  "matches joint %s timing when its components are separated",
  (property) => {
    const start = property === "scale" ? 1 : 80;
    const end = property === "scale" ? 1.1 : 120;
    const joint = composition(
      Array.from({ length: 4 }, (_, i) =>
        solid(`layer-${i}`, {
          transform: {
            anchor: [0, 0],
            position: [200, 200],
            [property]: {
              keys: [
                { frame: 0, value: [start, start] },
                { frame: 11, value: [end, end], interpolation: "linear" },
              ],
            },
          },
        }),
      ),
      { frameCount: 12 },
    );
    const separated = structuredClone(joint);
    for (const layer of separated.layers) {
      layer.transform![property] = {
        x: {
          keys: [
            { frame: 0, value: start },
            { frame: 11, value: end, interpolation: "linear" },
          ],
        },
        y: {
          keys: [
            { frame: 0, value: start },
            { frame: 11, value: end, interpolation: "linear" },
          ],
        },
      };
    }
    expect(validateComposition(separated).ok).toBe(true);
    for (let frame = 0; frame < joint.frameCount; frame++)
      expect(compositionQualityFrame(separated, frame).signature).toBe(
        compositionQualityFrame(joint, frame).signature,
      );
    for (const input of [joint, separated]) {
      const report = analyzeCompositionQuality(input);
      for (const code of ["co-start", "easing-monotony"])
        expect(report.diagnostics).toContainEqual(
          expect.objectContaining({
            code,
            measured: code === "co-start" ? 4 : 1,
          }),
        );
      expect(
        analyzeCompositionQuality(input, {
          minimumMovingProperties: 5,
        }).diagnostics.filter((d) => d.code === "easing-monotony"),
      ).toEqual([]);
    }
  },
);

it("ignores a separated component overridden by an expression", () => {
  const input = composition(
    Array.from({ length: 4 }, (_, i) =>
      solid(`layer-${i}`, {
        transform: {
          position: {
            x: {
              keys: [
                { frame: 0, value: 80 },
                { frame: 11, value: 120, interpolation: "linear" },
              ],
            },
            y: 80,
          },
        },
      }),
    ),
    {
      frameCount: 12,
      expressions: Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `layer-${i}.transform.position.x`,
          { source: "80" },
        ]),
      ),
    },
  );
  expect(validateComposition(input).ok).toBe(true);
  expect(
    analyzeCompositionQuality(input).diagnostics.filter((d) =>
      ["co-start", "easing-monotony"].includes(d.code),
    ),
  ).toEqual([]);
});
