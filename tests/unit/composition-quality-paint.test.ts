import { expect, it } from "vitest";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { groupEffectMotionComposition } from "../helpers/composition-quality-fixtures.ts";

it("inspects group effects that modify visible paint", () => {
  const report = analyzeCompositionQuality(groupEffectMotionComposition());
  expect(report.diagnostics.map((d) => d.code)).not.toContain("frozen-run");
  for (const code of ["easing-monotony", "co-start", "velocity-discontinuity"])
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code,
        nodes: expect.arrayContaining(["group-0"]),
      }),
    );
});

it.each(["disabled-effect", "hidden-child", "offscreen-child", "empty-group"])(
  "excludes group modifiers without contributing paint: %s",
  (kind) => {
    const input = groupEffectMotionComposition();
    for (const layer of input.layers) {
      if (layer.type === "group" && kind === "disabled-effect")
        layer.effects![0]!.enabled = false;
      if (layer.type === "solid" && kind === "hidden-child")
        layer.enabled = false;
      if (layer.type === "solid" && kind === "offscreen-child")
        layer.transform!.position = [1000, 1000];
    }
    if (kind === "empty-group")
      input.layers = input.layers.filter((layer) => layer.type === "group");
    const codes = analyzeCompositionQuality(input).diagnostics.map(
      (d) => d.code,
    );
    expect(codes).toContain("frozen-run");
    for (const code of [
      "easing-monotony",
      "co-start",
      "velocity-discontinuity",
    ])
      expect(codes).not.toContain(code);
  },
);

it("follows effect modifiers through nested groups", () => {
  const input = groupEffectMotionComposition();
  for (const layer of input.layers) {
    if (layer.type !== "solid") continue;
    const group = layer.parent!;
    layer.parent = `inner-${group}`;
    input.layers.push({
      id: layer.parent,
      type: "group",
      size: [640, 360],
      parent: group,
      transform: { anchor: [0, 0] },
    });
  }
  expect(
    analyzeCompositionQuality(input).diagnostics.map((d) => d.code),
  ).not.toContain("frozen-run");
});
