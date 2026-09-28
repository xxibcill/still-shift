import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StoryAuthoringPlanSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { parsePassageTemplate } from "../../packages/renderer-core/src/story-template.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { sampleStoryCamera } from "../../packages/renderer-core/src/story-camera.ts";

const directory = "benchmarks/fixtures/illustrated-sequence/";
const json = (file: string) =>
  JSON.parse(readFileSync(directory + file, "utf8"));
function input() {
  const plan = StoryAuthoringPlanSchema.parse(json("access-story.json"));
  const templates = new Map(
    plan.beats.map((beat) => [
      beat.template,
      parsePassageTemplate(json(beat.template)),
    ]),
  );
  return { plan, templates };
}

describe("illustrated sequence templates", () => {
  it("reveals the route, pressure and response at their authored entrances", () => {
    const { plan, templates } = input();
    const passage = compileStoryPassage(plan, templates);
    const opacity = (beat: number, id: string, frame: number) => {
      const scene = compileStoryScene(passage.beats[beat]!.scene);
      return evaluatePreparedNode(
        scene,
        scene.nodes.find((node) => node.id === id)!,
        frame,
      ).opacity;
    };
    expect(opacity(0, "access", 0)).toBe(0);
    expect(opacity(0, "access", 60)).toBe(1);
    expect(opacity(0, "pressure-top", 191)).toBe(0);
    for (const id of ["pressure-top", "pressure-bottom"]) {
      expect(opacity(1, id, 0)).toBe(0);
      expect(opacity(1, id, 48)).toBe(1);
      expect(opacity(2, id, 0)).toBe(1);
    }
    expect(opacity(1, "caption", 108)).toBe(0);
    expect(opacity(1, "caption", 132)).toBe(1);
    expect(opacity(2, "caption", 48)).toBe(1);
  });

  it("preserves the changed state across the cut into the consequence", () => {
    const { plan, templates } = input();
    const passage = compileStoryPassage(plan, templates);
    expect(passage.frameCount).toBe(720);
    expect(passage.beats.map((beat) => [beat.start, beat.end])).toEqual([
      [0, 192],
      [192, 432],
      [432, 720],
    ]);
    const stateAt = (index: number, frame: number) => {
      const scene = compileStoryScene(passage.beats[index]!.scene);
      return evaluatePreparedNode(
        scene,
        scene.nodes.find((node) => node.id === "access")!,
        frame,
      );
    };
    expect(stateAt(1, 95).state).toBe(0);
    expect(stateAt(1, 96).state).toBe(1);
    expect(stateAt(2, 0).state).toBe(1);
    expect(stateAt(1, 95).x).toBe(stateAt(1, 96).x);
    expect(stateAt(1, 95).y).toBe(stateAt(1, 96).y);
  });

  it("retimes the action, state cut and response together without changing passage boundaries", () => {
    const { plan, templates } = input();
    plan.beats[1]!.cues.find((cue) => cue.id === "restriction")!.frame = 108;
    const passage = compileStoryPassage(plan, templates);
    const events = passage.beats[1]!.events;
    expect(events.find((event) => event.id === "access-changes")?.start).toBe(
      108,
    );
    expect(events.find((event) => event.id === "pressure-arrives")?.end).toBe(
      108,
    );
    expect(
      events.find((event) => event.id === "consequence-appears")?.start,
    ).toBe(120);
    expect(passage.frameCount).toBe(720);
    expect(passage.beats[2]!.start).toBe(432);
  });

  it("accepts replacement artwork and copy without modifying the template", () => {
    const { plan, templates } = input();
    const before = JSON.stringify([...templates]);
    const template = templates.get(plan.beats[0]!.template)!;
    if (template.schemaVersion !== "story-template-1")
      throw new Error("Expected template");
    const original = template.scene.assets.find(
      (asset) => asset.id === "store",
    )!;
    plan.beats[0]!.parameters.resourceArt = {
      ...original,
      path: "replacement.svg",
    };
    plan.beats[0]!.parameters.caption = "A different dependency";
    const passage = compileStoryPassage(plan, templates);
    expect(
      passage.beats[0]!.scene.assets.find((asset) => asset.id === "store")
        ?.path,
    ).toBe("replacement.svg");
    expect(
      passage.beats[0]!.scene.nodes.find((node) => node.id === "caption"),
    ).toMatchObject({ text: "A different dependency" });
    expect(JSON.stringify([...templates])).toBe(before);
  });

  it("keeps copy fixed while the camera develops every shot", () => {
    const { plan, templates } = input();
    for (const { scene } of compileStoryPassage(plan, templates).beats) {
      expect(scene.camera!.depth.caption).toBe(0);
      for (let frame = 1; frame < scene.frameCount; frame++)
        expect(sampleStoryCamera(scene, frame)).not.toEqual(
          sampleStoryCamera(scene, frame - 1),
        );
    }
  });
});
