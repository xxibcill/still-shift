import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { comparisonAccessProof } from "../../scripts/story-motion/proof.ts";
import {
  resourcePassage,
  resourceShots,
} from "../../scripts/story-motion/resource-passage.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

const load = (id: string) =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(`benchmarks/fixtures/story-motion/${id}.json`, "utf8"),
    ),
  );

it("preserves exact episode boundaries and household continuity in the narrated proof", () => {
  const [comparison, access] = comparisonAccessProof(
    load("unequal-margins"),
    load("access-constraint"),
  );
  expect(comparison.frameCount + access.frameCount).toBe(646);
  expect(comparison.episodeStartFrame! + comparison.frameCount).toBe(
    access.episodeStartFrame,
  );
  expect(access.episodeStartFrame! + access.frameCount).toBe(5394);
  expect(access.recipe).toMatchObject({
    preset: "access_constraint",
    route: "route-b",
  });
  for (const id of ["house-a", "house-b", "common-ground", "ground"])
    expect(comparison.nodes.find((node) => node.id === id)).toEqual(
      access.nodes.find((node) => node.id === id),
    );
});

it("conforms the resource passage to existing shots and retains the household through its match cut", () => {
  const scenes = resourcePassage(
    load("relationship-build"),
    load("unequal-margins"),
  );
  let end = 1940;
  for (const scene of scenes) {
    expect(scene.episodeStartFrame).toBe(end);
    end += scene.frameCount;
    expect(() => compileStoryScene(scene)).not.toThrow();
  }
  expect(end).toBe(3447);
  expect(resourceShots.map((shot) => shot.end - shot.start)).toEqual([
    408, 360, 739,
  ]);
  const before = compileStoryScene(scenes[1]!);
  const after = compileStoryScene(scenes[2]!);
  for (const id of ["grain", "grain-art", "home", "home-art", "home-label"]) {
    const previous = before.nodes.find((node) => node.id === id)!;
    const next = after.nodes.find((node) => node.id === id)!;
    expect(previous).toEqual(next);
    expect(
      evaluatePreparedNode(before, previous, before.frameCount - 1),
    ).toEqual(evaluatePreparedNode(after, next, 0));
  }
});
