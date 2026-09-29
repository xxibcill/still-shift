import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  analyzeMotionCraft,
  requireMotionCraft,
} from "../../packages/renderer-core/src/story-continuous-quality.ts";
import type { LayerPixelEnergy } from "../../packages/renderer-core/src/story-continuous-quality.ts";

const run = promisify(execFile);
const fixturePath = resolve(
  "benchmarks/fixtures/story-motion/relationship-build.json",
);

function focalScene(
  pressPixels: number,
  fadedOpacity: number,
  fadeEnd: number,
) {
  const source = StorySceneSchema.parse(JSON.parse(requireFixture));
  source.assets = source.assets
    .filter((asset) => ["paper", "store"].includes(asset.id))
    .map((asset) => ({
      ...asset,
      path: resolve(dirname(fixturePath), asset.path),
    }));
  source.fonts = [];
  source.nodes = source.nodes.filter((node) =>
    ["paper", "store"].includes(node.id),
  );
  source.frameCount = 24;
  source.motionModel = "curves-1";
  source.recipe = {
    preset: "generic",
    moves: [
      {
        node: "store",
        window: { start: 0, end: 20, cue: "press", easing: "in-out-cubic" },
        to: {
          x: source.nodes.find((node) => node.id === "store")!.x + pressPixels,
        },
        role: "action",
      },
      {
        node: "store",
        window: { start: 0, end: fadeEnd, cue: "fade", easing: "linear" },
        to: { opacity: fadedOpacity },
        role: "action",
      },
    ],
    emphasis: [],
  };
  source.connectors = [];
  source.flows = [];
  delete source.camera;
  source.review = {
    essentialText: [],
    focalGroups: [{ id: "store", nodes: ["store"] }],
    focalEvents: [{ node: "store", property: "x", cue: "press" }],
  };
  return StorySceneSchema.parse(source);
}

const requireFixture = await readFile(fixturePath, "utf8");

describe("MC7 focal event pixel attribution", () => {
  it("flags a same-role fade above a press and accepts the press-dominant control", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-mc7-"));
    try {
      for (const [name, scene, warned] of [
        ["fade-dominant", focalScene(12, 0.12, 4), true],
        ["press-dominant", focalScene(180, 0.95, 20), false],
      ] as const) {
        const path = join(directory, `${name}.json`);
        await writeFile(path, JSON.stringify(scene));
        const { stdout } = await run(
          process.execPath,
          [
            "--import",
            "tsx",
            "--eval",
            "const { measureSceneLayerEnergy } = await import('./scripts/story-motion/motion-craft-energy.ts'); console.log(JSON.stringify(await measureSceneLayerEnergy(process.argv[1])));",
            path,
          ],
          { cwd: resolve("."), maxBuffer: 8 * 1024 * 1024 },
        );
        const pixels = JSON.parse(stdout.trim()) as LayerPixelEnergy;
        const compiled = compileStoryScene(scene);
        const peak = pixels.total.indexOf(Math.max(...pixels.total));
        expect(peak).toBeGreaterThan(0);
        expect(pixels.focal).toBeDefined();
        expect(
          (pixels.focal!.remainder[peak] ?? 0) >
            (pixels.focal!.contribution[peak] ?? 0) * 1.25,
        ).toBe(warned);
        const diagnostics = analyzeMotionCraft(compiled, pixels);
        expect(diagnostics.some((item) => item.code === "peak-not-story")).toBe(
          warned,
        );
        if (warned)
          expect(() =>
            requireMotionCraft(diagnostics, ["peak-not-story"]),
          ).toThrow("motion-craft-gate");
        else
          expect(() =>
            requireMotionCraft(diagnostics, ["peak-not-story"]),
          ).not.toThrow();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
