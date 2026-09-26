import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";

const legacy = () =>
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  );

it("requires v2 opt-in for a story camera", () => {
  const input = legacy();
  input.camera = {
    keys: [
      { frame: 0, x: 960, y: 540, zoom: 1 },
      { frame: 191, x: 1000, y: 540, zoom: 1.02 },
    ],
    depth: { paper: 0 },
  };
  expect(StorySceneSchema.safeParse(input).success).toBe(false);

  input.motionGrammar = "v2";
  const scene = compileStoryScene(StorySceneSchema.parse(input));
  expect(scene.rendererVersion).toBe("story-canvas-0.14.0");
});

it("requires v2 opt-in for story flows", () => {
  const input = legacy();
  input.flows = [
    {
      id: "strain",
      path: "pressure-a",
      direction: 1,
      count: 1,
      shape: "dot",
      size: 2,
      color: "#8B3F36",
      window: { start: 0, end: 192 },
      speed: [{ frame: 0, pxPerFrame: 1 }],
    },
  ];
  expect(StorySceneSchema.safeParse(input).success).toBe(false);
  input.motionGrammar = "v2";
  expect(StorySceneSchema.safeParse(input).success).toBe(true);
});
