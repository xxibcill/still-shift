import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  sampleStoryCamera,
  projectStoryPoint,
  validateStoryCameraAlphaCoverage,
} from "../../packages/renderer-core/src/story-camera.ts";
import {
  evaluateStoryPath,
  storyAnchorPosition,
} from "../../packages/renderer-core/src/story-geometry.ts";
import { easeMotion } from "../../packages/renderer-core/src/motion-easing.ts";
import { MotionEasingSchema } from "../../packages/scene-contract/src/motion-easing.ts";

const input = () => {
  const fixture = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/relationship-build.json",
      "utf8",
    ),
  );
  return {
    ...fixture,
    motionGrammar: "v2",
    recipe: { ...fixture.recipe, moves: [] },
    camera: {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1 },
        { frame: 80, x: 1000, y: 550, zoom: 1.03 },
        { frame: 191, x: 1100, y: 560, zoom: 1.07 },
      ],
      depth: { paper: 0, store: 0.6 },
      cover: ["paper"],
    },
  };
};

describe("story camera", () => {
  it("preserves easing endpoints and bounds response overshoot", () => {
    for (const easing of MotionEasingSchema.options) {
      expect(easeMotion(0, easing)).toBeCloseTo(0, 12);
      expect(easeMotion(1, easing)).toBe(1);
    }
    const peak = Math.max(
      ...Array.from({ length: 10001 }, (_, i) =>
        easeMotion(i / 10000, "out-back-soft"),
      ),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(1.02);
  });
  it("has continuous interior velocity and exact key positions", () => {
    const scene = StorySceneSchema.parse(input());
    expect(sampleStoryCamera(scene, 80).x).toBe(1000);
    const dt = 0.0001;
    const left =
      (sampleStoryCamera(scene, 80).x - sampleStoryCamera(scene, 80 - dt).x) /
      dt;
    const right =
      (sampleStoryCamera(scene, 80 + dt).x - sampleStoryCamera(scene, 80).x) /
      dt;
    expect(Math.abs(left - right)).toBeLessThan(0.0001);
    for (let f = 1; f < 191; f++)
      expect(sampleStoryCamera(scene, f).x).toBeGreaterThan(
        sampleStoryCamera(scene, f - 1).x,
      );
  });
  it("keeps authored endpoint tangents inside monotone camera bounds", () => {
    const raw = input();
    const scene = StorySceneSchema.parse({
      ...raw,
      camera: {
        ...raw.camera,
        keys: [
          { frame: 0, x: 960, y: 540, zoom: 1 },
          { frame: 191, x: 960, y: 540, zoom: 1.01 },
        ],
        easeIn: false,
        easeOut: false,
        startTangent: { x: 0, y: 0, zoom: -1 },
        endTangent: { x: 0, y: 0, zoom: -1 },
      },
    });
    const zooms = Array.from(
      { length: 192 },
      (_, frame) => sampleStoryCamera(scene, frame).zoom,
    );
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...zooms)).toBeLessThanOrEqual(1.01);
  });
  it("projects depth zero identically and connectors through each root", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input()));
    expect(projectStoryPoint(scene, "paper", [28, 40], 100)).toEqual([28, 40]);
    for (let f = 0; f < 192; f += 4)
      for (const binding of scene.connectors) {
        const path = scene.nodes.find((n) => n.id === binding.path)!;
        if (path.type !== "path") throw new Error("Not a path");
        expect(evaluateStoryPath(scene, path, f).points[0]).toEqual(
          storyAnchorPosition(scene, binding.from.node, binding.from.point, f),
        );
      }
    expect(projectStoryPoint(scene, "store", [960, 540], 80)[0]).toBeCloseTo(
      960 - 40 * 0.6 * 1.018,
    );
  });
  it("rejects exposed coverage with node and frame context", () => {
    const raw = input();
    raw.camera.depth.paper = 1;
    expect(() => compileStoryScene(StorySceneSchema.parse(raw))).toThrow(
      /Camera exposes uncovered edge on paper at frame \d+/,
    );
  });
  it("rejects a cover image letterboxed by contain fit", () => {
    const raw = input();
    raw.nodes.find((node: { id: string }) => node.id === "paper").states = [
      { asset: "house" },
    ];
    expect(() => compileStoryScene(StorySceneSchema.parse(raw))).toThrow(
      "Camera exposes uncovered edge on paper at frame 0",
    );
  });
  it("uses the crop aspect ratio when checking contain coverage", () => {
    const raw = input();
    raw.nodes.find((node: { id: string }) => node.id === "paper").states = [
      { asset: "house", crop: [0, 50, 600, 337.5] },
    ];
    expect(() => compileStoryScene(StorySceneSchema.parse(raw))).not.toThrow();
  });
  it("rejects transparent source pixels inside the projected viewport", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input()));
    const data = new Uint8ClampedArray(1920 * 1080 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const readPixels = () => ({ width: 1920, height: 1080, data });
    expect(() =>
      validateStoryCameraAlphaCoverage(scene, readPixels),
    ).not.toThrow();
    data[(540 * 1920 + 960) * 4 + 3] = 0;
    expect(() => validateStoryCameraAlphaCoverage(scene, readPixels)).toThrow(
      "Camera exposes uncovered edge on paper at frame 0: transparent image pixels",
    );
  });
  it("decays a jolt and keeps screen-locked content fixed", () => {
    const raw = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion/dated-system-break.json",
        "utf8",
      ),
    );
    const scene = StorySceneSchema.parse({
      ...raw,
      motionGrammar: "v2",
      camera: {
        keys: [
          { frame: 0, x: 960, y: 540, zoom: 1 },
          { frame: 191, x: 960, y: 540, zoom: 1 },
        ],
        depth: { paper: 0 },
        jolts: [{ frame: 60, dx: 8, dy: -4, decayFrames: 16 }],
      },
    });
    expect(sampleStoryCamera(scene, 60).x).toBeCloseTo(968);
    expect(sampleStoryCamera(scene, 76).x).toBeCloseTo(960);
    expect(projectStoryPoint(scene, "paper", [0, 0], 60)).toEqual([0, 0]);
  });

  it("keeps the prototype's sustained pan readable at 24 fps", () => {
    const raw = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion-v2/unequal-margins.json",
        "utf8",
      ),
    );
    const scene = compileStoryScene(StorySceneSchema.parse(raw));
    const pans = Array.from({ length: scene.frameCount - 1 }, (_, index) => {
      const before = sampleStoryCamera(scene, index);
      const after = sampleStoryCamera(scene, index + 1);
      return Math.hypot(after.x - before.x, after.y - before.y) * after.zoom;
    });
    expect(pans.slice(5, -5).every((pan) => pan >= 0.4 && pan <= 2.5)).toBe(
      true,
    );
    expect(pans.filter((pan) => pan < 0.4)).toHaveLength(10);
    const quality = analyzeStoryQuality(scene, { preset: "continuous" });
    expect(quality.continuous!.maxTextVelocity).toBeLessThanOrEqual(20);
    expect(quality.continuous!.maxZoomPerFrame).toBeLessThanOrEqual(0.0009);
  });
});
