import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import {
  storyToComposition,
  compileStoryScene,
} from "@still-shift/renderer-core";
import { evaluateStoryPath } from "../../packages/renderer-core/src/story-geometry.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  sampleStoryPath,
  StoryPathGeometrySchema,
} from "../../packages/renderer-core/src/composition/adapters/story-path.ts";

const fixture = (name: string) =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../benchmarks/fixtures/story-motion-continuous/${name}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

describe("CE4a story content", () => {
  it.each(["relationship-build", "category-swap", "motif-resolve"])(
    "preserves attached path geometry and camera coordinates: %s",
    (name) => {
      const input = fixture(name),
        scene = compileStoryScene(input),
        composition = storyToComposition(input);
      expect(validateComposition(composition).ok).toBe(true);
      for (const connector of scene.connectors) {
        const node = scene.nodes.find((n) => n.id === connector.path)!;
        if (node.type !== "path") throw new Error("Expected a path");
        const layer = composition.layers.find((l) => l.id === node.id)!;
        if (layer.type !== "provider") throw new Error("Expected a provider");
        expect(layer.provider).toBe("story.path@1.1.0");
        expect(layer.cameraDepth).toBe(0);
        const geometry = StoryPathGeometrySchema.parse(layer.params.geometry);
        for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
          expect(sampleStoryPath(node, geometry, frame).points).toEqual(
            evaluateStoryPath(scene, node, frame).points,
          );
          const state = evaluateComp(composition, frame).layers.find(
            (l) => l.id === node.id,
          )!;
          expect(state.screenMatrix).toEqual(state.worldMatrix);
        }
      }
    },
  );
  it("compiles plain rectangles to native solids", () => {
    const input = fixture("dated-system-break"),
      composition = storyToComposition(input);
    const rectangles = input.nodes.filter((n) => n.type === "rect");
    expect(rectangles.length).toBeGreaterThan(0);
    for (const node of rectangles) {
      expect(composition.layers.find((l) => l.id === node.id)).toMatchObject({
        type: "solid",
        size: [node.width, node.height],
        color: node.fill,
      });
    }
  });
  it.each([{ radius: 12 }, { stroke: "#123456", lineWidth: 3 }])(
    "preserves rectangle styling in a provider: %j",
    (style) => {
      const input = fixture("dated-system-break");
      const node = input.nodes.find((n) => n.type === "rect")!;
      Object.assign(node, style);
      const composition = storyToComposition(input);
      expect(composition.layers.find((l) => l.id === node.id)).toMatchObject({
        type: "provider",
        provider: "story.rect@1.0.0",
        params: { node, samples: [{ reveal: 1 }] },
      });
    },
  );
});
