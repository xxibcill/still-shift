import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";
const raw = () =>
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  );

describe("continuous quality policy", () => {
  it("reports frozen runs and semantic gaps without requiring a final hold", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(raw()));
    const report = analyzeStoryQuality(scene, { preset: "continuous" });
    expect(report.continuous!.longestFrozenRun).toBeGreaterThan(6);
    expect(report.continuous!.longestSemanticGap).toBeGreaterThan(48);
    expect(report.diagnostics.some((d) => d.code === "frozen-run")).toBe(true);
    expect(report.diagnostics.some((d) => d.code === "semantic-gap")).toBe(
      true,
    );
    expect(report.diagnostics.some((d) => d.code === "short-final-hold")).toBe(
      false,
    );
  });
  it("detects text screen velocity and camera pan while ignoring text entrances", () => {
    const input = raw();
    input.camera = {
      easeIn: false,
      easeOut: false,
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1.1 },
        { frame: 191, x: 1533, y: 540, zoom: 1.1 },
      ],
      depth: { paper: 0, qualifier: 0 },
    };
    const report = analyzeStoryQuality(
      compileStoryScene(StorySceneSchema.parse(input)),
      { preset: "continuous" },
    );
    expect(report.continuous!.longestFrozenRun).toBe(0);
    expect(report.diagnostics.some((d) => d.code === "camera-too-fast")).toBe(
      true,
    );
    expect(
      report.diagnostics.some(
        (d) =>
          d.code === "text-velocity" &&
          d.nodes.includes("room") &&
          d.frames[0] > 106,
      ),
    ).toBe(true);
    expect(
      report.diagnostics.some(
        (d) => d.code === "text-velocity" && d.nodes.includes("qualifier"),
      ),
    ).toBe(false);
  });
  it("does not count carrier/current ends as semantic actions", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(raw()));
    scene.motionEvents = [
      {
        node: "camera",
        window: { start: 0, end: 191 },
        kind: "camera",
        role: "carrier",
      },
    ];
    expect(
      analyzeStoryQuality(scene, { preset: "continuous" }).continuous!
        .longestSemanticGap,
    ).toBe(191);
  });
});
