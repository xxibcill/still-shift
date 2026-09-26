import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { comparisonAccessProof } from "../../scripts/story-motion/proof.ts";

it("preserves exact episode boundaries and household continuity in the narrated proof", () => {
  const load = (id: string) =>
    StorySceneSchema.parse(
      JSON.parse(
        readFileSync(`benchmarks/fixtures/story-motion/${id}.json`, "utf8"),
      ),
    );
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
