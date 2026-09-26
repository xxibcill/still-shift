import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { sampleStoryCamera } from "../../packages/renderer-core/src/story-camera.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";

const scene = compileStoryScene(
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion-buffer-press/unequal-margins.json",
        "utf8",
      ),
    ),
  ),
);

it("keeps buffer press within sustained camera and text-velocity limits", () => {
  const pans = Array.from({ length: scene.frameCount - 1 }, (_, frame) => {
    const before = sampleStoryCamera(scene, frame);
    const after = sampleStoryCamera(scene, frame + 1);
    return Math.hypot(after.x - before.x, after.y - before.y) * after.zoom;
  });
  // Only the first and last five comparisons may ease below R7's minimum.
  expect(pans.slice(5, -5).every((pan) => pan >= 0.4 && pan <= 2.5)).toBe(true);
  const quality = analyzeStoryQuality(scene, { preset: "continuous" });
  expect(quality.continuous!.maxTextVelocity).toBeLessThanOrEqual(12);
  expect(quality.continuous!.maxZoomPerFrame).toBeLessThanOrEqual(0.0009);
});
