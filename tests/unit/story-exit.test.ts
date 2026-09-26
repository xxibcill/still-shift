import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";

describe("story lift exit", () => {
  it("lifts relative to the pose reached by an earlier move", () => {
    const input = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion-v2/unequal-margins.json",
        "utf8",
      ),
    );
    input.recipe.moves.push({
      node: "house-b",
      window: { start: 20, end: 40 },
      to: { x: 1210 },
    });
    input.recipe.exits = [
      {
        node: "house-b",
        verb: "lift",
        to: "right",
        distance: 20,
        window: { start: 120, end: 140 },
      },
    ];
    const scene = compileStoryScene(StorySceneSchema.parse(input));
    const house = scene.nodes.find((node) => node.id === "house-b")!;
    expect(evaluatePreparedNode(scene, house, 120).x).toBe(1210);
    expect(evaluatePreparedNode(scene, house, 140).x).toBe(1230);
  });
});
