import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommerceSceneSchema } from "@still-shift/scene-contract";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { sourceExposureTimeline } from "../../packages/renderer-core/src/commerce-exposure.ts";
import { textVisibility } from "../../packages/renderer-core/src/typography-visibility.ts";
import { numericTypographyVariants } from "../helpers/composition-typography.ts";

describe("source exposure preparation", () => {
  it("discovers numeric texts shown only beside a rounded glyph frame", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync("benchmarks/fixtures/typography/commerce.json", "utf8"),
      ),
    );
    const input = CommerceSceneSchema.parse(
      numericTypographyVariants(source)[0]!.scene,
    );
    input.effects = [
      ...(input.effects ?? []),
      { type: "motion-blur", shutterAngle: 360, samples: 2 },
    ];
    const scene = compileCommerceScene(input);
    const node = scene.nodes.find((node) => node.id === "headline-0")!;
    if (node.type !== "text") throw new Error("Expected numeric text");
    const integer = textVisibility(scene, node);
    const { times } = sourceExposureTimeline(scene);
    const exposed = textVisibility(scene, node, undefined, times);
    expect(
      exposed.some((sample) =>
        sample.texts.some(
          (text) => !integer[Math.round(sample.frame)]!.texts.includes(text),
        ),
      ),
    ).toBe(true);
    expect(exposed.map((sample) => sample.frame)).toEqual(times);
  });
  it("clamps cuts and includes the raw echo clocks without recursively expanding history", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/ecommerce-motion/atoms/motion-blur.json",
          "utf8",
        ),
      ),
    );
    source.effects = [
      { type: "motion-blur", shutterAngle: 360, samples: 2 },
      {
        type: "echo",
        target: "product",
        spacing: 2,
        count: 3,
        decay: 0.5,
        active: { start: 10, end: 30 },
      },
    ];
    const timeline = sourceExposureTimeline(compileCommerceScene(source));
    expect(timeline.cuts).toEqual([0, 10, 30, 240]);
    expect(timeline.times).toContain(10);
    expect(timeline.times).toContain(9.75);
    source.effects[1] = {
      type: "glow",
      target: "product",
      radius: 3,
      intensity: 0.2,
      threshold: 0.1,
      active: { start: 10, end: 30 },
    };
    expect(
      sourceExposureTimeline(compileCommerceScene(source)).times,
    ).not.toContain(9.75);
    expect(timeline.times).toContain(10.25 - 6);
    expect(timeline.times[0]).toBe(0);
    expect(timeline.times.at(-1)).toBe(239);
  });
});
