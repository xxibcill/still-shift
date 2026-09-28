import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StoryAuthoringPlanSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { parsePassageTemplate } from "../../packages/renderer-core/src/story-template.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

const directory = "benchmarks/fixtures/illustrated-sequence/narrated/";
function passage() {
  const plan = StoryAuthoringPlanSchema.parse(
    JSON.parse(readFileSync(directory + "access-story.json", "utf8")),
  );
  const templates = new Map(
    plan.beats.map((beat) => [
      beat.template,
      parsePassageTemplate(
        JSON.parse(readFileSync(directory + beat.template, "utf8")),
      ),
    ]),
  );
  return compileStoryPassage(plan, templates);
}

describe("narration-led illustrated sequence", () => {
  it("binds the actual audio and ends after the final spoken word", () => {
    const result = passage();
    const audio = readFileSync(
      "assets/illustrated-sequence/narration-v001/narration.wav",
    );
    expect(result.plan.narration?.sha256).toBe(
      createHash("sha256").update(audio).digest("hex"),
    );
    expect(result.frameCount).toBe(495);
    expect(result.beats.map((beat) => [beat.start, beat.end])).toEqual([
      [0, 147],
      [147, 224],
      [224, 495],
    ]);
    expect(result.frameCount / 24).toBeGreaterThan(19.74);
    expect(result.frameCount / 24 - 19.74).toBeLessThan(1);
  });

  it("lands each semantic change on the measured word rather than the old silent timing", () => {
    const result = passage();
    const globalFrame = (beat: number, id: string) =>
      result.beats[beat]!.start +
      result.beats[beat]!.events.find((event) => event.id === id)!.start;
    for (const [beat, event, seconds] of [
      [0, "route-reveals", 4.8],
      [1, "access-changes", 8.1],
      [2, "access-response", 14.56],
    ] as const)
      expect(
        Math.abs(globalFrame(beat, event) / 24 - seconds),
      ).toBeLessThanOrEqual(1 / 48);
  });

  it("keeps the narrowed route across the cut and waits to show the final response", () => {
    const result = passage();
    const scene = compileStoryScene(result.beats[2]!.scene);
    const state = (id: string, frame: number) =>
      evaluatePreparedNode(
        scene,
        scene.nodes.find((node) => node.id === id)!,
        frame,
      );
    expect(state("access", 0).state).toBe(1);
    expect(state("caption", 24).opacity).toBe(1);
    expect(state("response", 124).opacity).toBe(0);
    expect(state("response", 137).opacity).toBe(1);
    expect(scene.camera?.depth.response).toBe(0);
  });
});
