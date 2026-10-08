import { expect, it } from "vitest";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";

const scaleStep = (value: [number, number]) => ({
  keys: [
    { frame: 0, value: [1, 1] as [number, number] },
    { frame: 20, value, interpolation: "hold" as const },
  ],
});
const findings = (input: Parameters<typeof analyzeCompositionQuality>[0]) =>
  analyzeCompositionQuality(input).diagnostics.filter(
    (d) => d.code === "scale-pop",
  );

it.each([
  [-1, 1],
  [1, -1],
  [-1, -1],
] as [number, number][])("detects a held scale reflection to %j", (x, y) => {
  const input = composition([
    solid("paint", {
      transform: {
        anchor: [0, 0],
        position: [80, 80],
        scale: scaleStep([x, y]),
      },
    }),
  ]);
  expect(findings(input)).toContainEqual(
    expect.objectContaining({ node: "paint", frames: [19, 20], measured: 2 }),
  );
  expect(
    analyzeCompositionQuality(input, { intentionalCuts: [20] }).diagnostics.map(
      (d) => d.code,
    ),
  ).not.toContain("scale-pop");
});

it("detects a reflection inherited from a null parent", () => {
  const input = composition([
    { id: "parent", type: "null", transform: { scale: scaleStep([-1, 1]) } },
    solid("paint", { parent: "parent" }),
  ]);
  expect(findings(input)).toContainEqual(
    expect.objectContaining({ node: "paint", frames: [19, 20] }),
  );
});

it("detects a reflection across a precomp instance", () => {
  const input = composition(
    [
      {
        id: "host",
        type: "precomp",
        comp: "source",
        transform: {
          anchor: [0, 0],
          position: [320, 180],
          scale: scaleStep([-1, 1]),
        },
      },
    ],
    {
      precomps: [
        {
          id: "source",
          width: 100,
          height: 100,
          frameCount: 90,
          layers: [solid("paint", { transform: { position: [50, 50] } })],
        },
      ],
    },
  );
  expect(findings(input)).toContainEqual(
    expect.objectContaining({ node: "host/paint", frames: [19, 20] }),
  );
});

it("keeps rotation out of scale-pop findings", () => {
  const input = composition([
    solid("paint", {
      transform: {
        rotation: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 20, value: 180, interpolation: "hold" },
          ],
        },
      },
    }),
  ]);
  expect(findings(input)).toEqual([]);
});

it("does not report reflections canceled by a child scale", () => {
  const input = composition([
    { id: "parent", type: "null", transform: { scale: scaleStep([-1, 1]) } },
    solid("paint", {
      parent: "parent",
      transform: { scale: scaleStep([-1, 1]) },
    }),
  ]);
  expect(findings(input)).toEqual([]);
});

it("does not report reflections canceled across rotated child axes", () => {
  const input = composition([
    {
      id: "parent",
      type: "null",
      transform: { position: [200, 200], scale: scaleStep([-1, 1]) },
    },
    solid("paint", {
      parent: "parent",
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 20, value: [10, 0], interpolation: "hold" },
          ],
        },
        rotation: 90,
        scale: scaleStep([1, -1]),
      },
    }),
  ]);
  expect(findings(input)).toEqual([]);
});
