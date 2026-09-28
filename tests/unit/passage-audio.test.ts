import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StoryAuthoringPlanSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";

const scene = StorySceneSchema.parse(
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  ),
);
const templates = new Map([["comparison", scene]]);
function plan() {
  return StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "audio",
    title: "Sound timing",
    fps: 24,
    sourceStartFrame: 240,
    styleProfile: { schemaVersion: "story-style-1", id: "neutral" },
    beats: [
      {
        id: "one",
        template: "comparison",
        purpose: "compare",
        takeaway: "Pressure",
        focus: ["house-a"],
        intensity: "develop",
        frameCount: 192,
        cues: [
          {
            id: "pressure",
            phrase: "Pressure",
            frame: 48,
            events: ["shared-strain"],
          },
        ],
        bindings: {
          "shared-strain": {
            anchor: { type: "cue", id: "pressure" },
            duration: 56,
          },
        },
      },
    ],
    audio: {
      schemaVersion: "passage-audio-1",
      assets: [
        { id: "tap", path: "tap.wav", sha256: "sha256:" + "a".repeat(64) },
      ],
      sounds: [
        {
          id: "arrival",
          beat: "one",
          asset: "tap",
          anchor: { type: "cue", id: "pressure" },
          offset: -2,
          durationFrames: 12,
          fadeInFrames: 2,
          fadeOutFrames: 3,
        },
        {
          id: "settled",
          beat: "one",
          asset: "tap",
          anchor: { type: "event", id: "shared-strain", edge: "end" },
          durationFrames: 12,
        },
      ],
    },
  });
}
describe("passage sound cues", () => {
  it("includes preceding beat lengths when resolving sounds in a later beat", () => {
    const input = plan();
    input.beats.push({ ...structuredClone(input.beats[0]!), id: "two" });
    input.audio!.sounds[0]!.beat = "two";
    expect(compileStoryPassage(input, templates).audio!.sounds[0]!.start).toBe(
      238,
    );
    input.beats[0]!.frameCount += 24;
    expect(compileStoryPassage(input, templates).audio!.sounds[0]!.start).toBe(
      262,
    );
  });
  it("follows resolved cue/event timing through edits and undo, independently of narration source time", () => {
    const editor = createPassageEditor(plan(), templates);
    expect(editor.passage.audio?.sounds.map((s) => [s.start, s.end])).toEqual([
      [46, 58],
      [104, 116],
    ]);
    editor.edit((p) => {
      p.beats[0]!.cues[0]!.frame += 10;
    });
    expect(editor.passage.audio?.sounds.map((s) => s.start)).toEqual([56, 114]);
    editor.undo();
    expect(editor.passage.audio?.sounds[0]!.start).toBe(46);
    editor.redo();
    expect(editor.passage.audio?.sounds[0]!.start).toBe(56);
  });
  it("allows tails across a beat cut but rejects sounds outside the passage", () => {
    const input = plan();
    input.beats.push({ ...structuredClone(input.beats[0]!), id: "two" });
    input.audio!.sounds[0]!.durationFrames = 180;
    expect(compileStoryPassage(input, templates).audio!.sounds[0]!.end).toBe(
      226,
    );
    input.audio!.sounds[0]!.durationFrames = 400;
    expect(() => compileStoryPassage(input, templates)).toThrow(
      /outside the passage/,
    );
  });
  it.each(["beat", "asset", "cue", "event"])(
    "rejects an unknown %s reference",
    (kind) => {
      const input = plan(),
        sound = input.audio!.sounds[0]!;
      if (kind === "beat" || kind === "asset") sound[kind] = "missing";
      else
        sound.anchor =
          kind === "cue"
            ? { type: "cue", id: "missing" }
            : { type: "event", id: "missing", edge: "end" };
      expect(() => compileStoryPassage(input, templates)).toThrow(
        /Unknown sound/,
      );
    },
  );
  it("rejects duplicate identities, negative starts and overlapping fades", () => {
    const input = plan();
    input.audio!.sounds.push(structuredClone(input.audio!.sounds[0]!));
    expect(() => compileStoryPassage(input, templates)).toThrow(
      /Duplicate sound/,
    );
    input.audio!.sounds.pop();
    input.audio!.sounds[0]!.offset = -49;
    expect(() => compileStoryPassage(input, templates)).toThrow(
      /outside the passage/,
    );
    input.audio!.sounds[0]!.offset = 0;
    input.audio!.sounds[0]!.fadeOutFrames = 12;
    expect(() => compileStoryPassage(input, templates)).toThrow(/fades/);
  });
  it("leaves existing plans without a sound schedule", () => {
    const input = plan();
    delete input.audio;
    expect(compileStoryPassage(input, templates).audio).toBeUndefined();
  });
});
