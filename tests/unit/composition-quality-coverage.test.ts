import { expect, it } from "vitest";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { nestedCoverageComposition } from "../helpers/composition-quality-fixtures.ts";

it.each([
  [0, 15, [[15, 29]]],
  [10, 30, [[0, 9]]],
  [
    10,
    15,
    [
      [0, 9],
      [15, 29],
    ],
  ],
] as const)(
  "reports coverage outside a host's %s..%s lifetime",
  (start, end, ranges) => {
    const report = analyzeCompositionQuality(
      nestedCoverageComposition(start, end),
      { coverageLayers: ["host/bg"] },
    );
    expect(report.status).toBe("failed");
    const findings = report.diagnostics.filter((d) => d.code === "coverage");
    expect(findings.map((d) => d.frames)).toEqual(ranges);
    expect(
      findings.every(
        (d) => d.path === "precomps.0.layers.0" && d.node === "host/bg",
      ),
    ).toBe(true);
  },
);

it("follows coverage declarations through multiple precomp instances", () => {
  const input = nestedCoverageComposition(0, 15);
  input.precomps!.push({ ...input.precomps![0]!, id: "nested" });
  input.precomps![0]!.layers = [
    {
      id: "inner",
      type: "precomp",
      comp: "nested",
      transform: { anchor: [0, 0] },
    },
  ];
  expect(
    analyzeCompositionQuality(input, { coverageLayers: ["host/inner/bg"] })
      .diagnostics,
  ).toContainEqual(
    expect.objectContaining({
      code: "coverage",
      frames: [15, 29],
      node: "host/inner/bg",
      path: "precomps.1.layers.0",
    }),
  );
});

it("splits unavailable coverage findings at shot boundaries", () => {
  const report = analyzeCompositionQuality(nestedCoverageComposition(0, 15), {
    coverageLayers: ["host/bg"],
    shots: [
      { id: "first", start: 0, end: 20 },
      { id: "second", start: 20, end: 30 },
    ],
  });
  expect(
    report.diagnostics
      .filter((d) => d.code === "coverage")
      .map((d) => [d.shot, d.frames]),
  ).toEqual([
    ["first", [15, 19]],
    ["second", [20, 29]],
  ]);
});

it("distinguishes hidden coverage from a nonexistent declaration", () => {
  const input = nestedCoverageComposition();
  input.layers[0]!.enabled = false;
  const report = analyzeCompositionQuality(input, {
    coverageLayers: ["host/bg", "host/missing"],
  });
  const findings = report.diagnostics.filter((d) => d.code === "coverage");
  expect(findings).toContainEqual(
    expect.objectContaining({
      node: "host/bg",
      frames: [0, 29],
      path: "precomps.0.layers.0",
    }),
  );
  expect(findings.find((d) => d.node === "host/bg")!.message).not.toContain(
    "does not exist",
  );
  expect(findings.find((d) => d.node === "host/missing")!.message).toContain(
    "does not exist",
  );
});
