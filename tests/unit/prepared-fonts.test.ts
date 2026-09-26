import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const input = () => {
  const scene = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/access-constraint.json",
      "utf8",
    ),
  );
  scene.fonts = [
    ...(scene.fonts ?? []),
    {
      id: "test-display",
      path: "display.otf",
      sha256: `sha256:${"a".repeat(64)}`,
      weight: "600",
    },
  ];
  scene.nodes.find((node: { type: string }) => node.type === "text").fontAsset =
    "test-display";
  return scene;
};

describe("prepared font assets", () => {
  it("accepts a pinned font referenced by editable text", () => {
    expect(StorySceneSchema.safeParse(input()).success).toBe(true);
  });
  it("rejects unresolved and colliding font assets", () => {
    const missing = input();
    missing.fonts = [];
    expect(StorySceneSchema.safeParse(missing).success).toBe(false);
    const duplicate = input();
    duplicate.fonts.push(duplicate.fonts[0]);
    expect(StorySceneSchema.safeParse(duplicate).success).toBe(false);
    const collision = input();
    collision.fonts[0].id = collision.assets[0].id;
    expect(StorySceneSchema.safeParse(collision).success).toBe(false);
  });
});

it("switches the category caption on the same exact frame as its image", () => {
  const value = JSON.parse(
    readFileSync("benchmarks/fixtures/story-motion/category-swap.json", "utf8"),
  );
  value.nodes.push({
    id: "test-caption",
    type: "text",
    text: "Before",
    states: ["Before", "After"],
    fontSize: 48,
    color: "#211F1B",
  });
  value.recipe.stateLabels = ["test-caption"];
  const scene = compilePreparedScene(StorySceneSchema.parse(value));
  if (scene.recipe.preset !== "category_swap") throw new Error("Wrong recipe");
  const label = scene.nodes.find((node) => node.id === "test-caption")!;
  expect(
    evaluatePreparedNode(scene, label, scene.recipe.swapFrame - 1).state,
  ).toBe(0);
  expect(evaluatePreparedNode(scene, label, scene.recipe.swapFrame).state).toBe(
    1,
  );
  value.nodes.at(-1).states = ["Only one"];
  expect(StorySceneSchema.safeParse(value).success).toBe(false);
});

it("accepts clipped illustrated restriction sides and rejects unbounded groups", () => {
  const value = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/access-constraint.json",
      "utf8",
    ),
  );
  for (const id of value.recipe.sides) {
    const index = value.nodes.findIndex(
      (node: { id: string }) => node.id === id,
    );
    value.nodes[index] = {
      id,
      type: "group",
      width: 350,
      height: 110,
      clip: true,
    };
  }
  expect(StorySceneSchema.safeParse(value).success).toBe(true);
  value.nodes.find(
    (node: { id: string }) => node.id === value.recipe.sides[0],
  ).clip = false;
  expect(StorySceneSchema.safeParse(value).success).toBe(false);
});
