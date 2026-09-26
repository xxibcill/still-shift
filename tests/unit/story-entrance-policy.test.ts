import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

it("uses authored bindings and text hierarchy when choosing implicit v2 entrances", () => {
  const input = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  );
  const rename = (before: string, after: string) => {
    input.nodes.find((node: { id: string }) => node.id === before).id = after;
  };
  rename("reference", "opening");
  rename("question", "prompt");
  rename("room", "editorial-title-label");
  rename("qualifier", "caveat");
  input.recipe.reference = "opening";
  input.recipe.labels[0] = "editorial-title-label";
  input.review.essentialText = input.review.essentialText.map((id: string) =>
    id === "room"
      ? "editorial-title-label"
      : id === "qualifier"
        ? "caveat"
        : id,
  );
  input.motionGrammar = "v2";
  input.recipe.entrances = [
    { node: "opening", window: { start: 0, end: 18 } },
    { node: "prompt", window: { start: 8, end: 30 } },
    { node: "editorial-title-label", window: { start: 86, end: 106 } },
    { node: "caveat", window: { start: 140, end: 164 } },
  ];

  const scene = compileStoryScene(StorySceneSchema.parse(input));
  const pose = (id: string, frame: number) =>
    evaluatePreparedNode(
      scene,
      scene.nodes.find((node) => node.id === id)!,
      frame,
    );
  const role = (id: string) =>
    scene.motionEvents.find(
      (event) => event.node === id && event.kind === "entrance",
    )?.role;

  expect(pose("opening", 0).reveal).toBe(0);
  expect(pose("prompt", 8).reveal).toBe(0);
  expect(pose("caveat", 140).reveal).toBe(0);
  expect(pose("editorial-title-label", 86).reveal).toBe(1);
  expect(pose("editorial-title-label", 86).opacity).toBe(0);
  expect(role("opening")).toBe("action");
  expect(role("prompt")).toBe("action");
  expect(role("caveat")).toBe("action");
  expect(role("editorial-title-label")).toBe("response");
});
