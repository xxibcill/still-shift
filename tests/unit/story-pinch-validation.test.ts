import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";

const accessSceneWithPinch = (
  lineStyle: "brush" | "ink" | "uniform" | undefined,
) => {
  const scene = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/access-constraint.json",
      "utf8",
    ),
  );
  scene.recipe.pinch = {
    path: scene.recipe.route,
    window: scene.recipe.narrow,
    amount: 0.65,
  };
  const route = scene.nodes.find(
    (node: { id: string }) => node.id === scene.recipe.route,
  );
  route.lineStyle = lineStyle;
  return scene;
};

describe("access constraint pinch", () => {
  it("accepts pinch on a brush route", () => {
    expect(
      StorySceneSchema.safeParse(accessSceneWithPinch("brush")).success,
    ).toBe(true);
  });

  it.each(["uniform", "ink", undefined] as const)(
    "rejects pinch on a %s route",
    (lineStyle) => {
      const result = StorySceneSchema.safeParse(
        accessSceneWithPinch(lineStyle),
      );
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]?.message).toContain("brush");
    },
  );
});
