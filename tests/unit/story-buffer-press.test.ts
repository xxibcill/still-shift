import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { sampleStoryCamera } from "../../packages/renderer-core/src/story-camera.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { storyAnchorPosition } from "../../packages/renderer-core/src/story-geometry.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

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

it("keeps both roof ridges on the shared band throughout the press and pulses", () => {
  for (const side of ["a", "b"]) {
    const house = scene.nodes.find((node) => node.id === `house-${side}-art`)!;
    // The visible ridge is SVG point (406, 49) in the 600 × 440 house artwork.
    const ridge: [number, number] = [
      (house.width * 406) / 600,
      (house.height * 49) / 440,
    ];
    for (let frame = 50; frame < scene.frameCount; frame++) {
      const roof = storyAnchorPosition(scene, house.id, ridge, frame);
      const band = storyAnchorPosition(
        scene,
        `pressure-${side}`,
        [0, 20],
        frame,
      );
      expect(
        Math.abs(roof[1] - band[1]),
        `house-${side} roof contact at frame ${frame}`,
      ).toBeLessThan(0.2);
    }
  }
});

it("compresses B only after its margin runs out and keeps its base planted", () => {
  const house = scene.nodes.find((node) => node.id === "house-b")!;
  for (let frame = 50; frame < 76; frame++) {
    const pose = evaluatePreparedNode(scene, house, frame);
    expect(pose.scaleY).toBe(1);
    expect(pose.rotation).toBe(0);
  }
  for (let frame = 76; frame < scene.frameCount; frame++) {
    expect(evaluatePreparedNode(scene, house, frame).y).toBe(house.y + 28);
  }
});
