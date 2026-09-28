import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseNarrationTiming,
  narrationTimingEntries,
} from "../../packages/renderer-core/src/narration-timing.ts";
import { importNarrationTiming } from "../../packages/renderer-core/src/narration-timing-import.ts";
import { StoryAuthoringPlanSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";

const options = {
  mode: "match" as const,
  reference: "voice.wav",
  sha256: "b".repeat(64),
  durationSeconds: 20,
};
function plan() {
  return StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "timing",
    title: "Timing import",
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
            phrase: "Pressure builds",
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
          id: "tap",
          beat: "one",
          asset: "tap",
          anchor: { type: "event", id: "shared-strain", edge: "start" },
          durationFrames: 12,
        },
      ],
    },
  });
}
const timing = () =>
  parseNarrationTiming(
    JSON.stringify({
      words: [
        { word: "Pressure", start: 12.5, end: 12.9 },
        { word: "builds.", start: 12.9, end: 13.3 },
      ],
    }),
    "json",
  );
describe("narration timing import", () => {
  it("assigns rounded boundary onsets once at 30 fps with a source offset", () => {
    const source = plan();
    source.fps = 30;
    source.sourceStartFrame = 300;
    source.beats[0]!.frameCount = 60;
    source.beats[0]!.cues = [];
    source.beats[0]!.bindings = {};
    source.audio = undefined;
    source.beats.push({ ...structuredClone(source.beats[0]!), id: "two" });
    const subtitles = parseNarrationTiming(
      "1\n00:00:11,980 --> 00:00:11,990\nBefore.\n\n2\n00:00:11,990 --> 00:00:12,200\nBoundary.\n\n3\n00:00:14,000 --> 00:00:14,500\nOutside.",
      "srt",
    );
    const result = importNarrationTiming(source, subtitles, {
      ...options,
      mode: "add",
    });
    expect(result.changes.map(({ beat, frame }) => ({ beat, frame }))).toEqual([
      { beat: "one", frame: 59 },
      { beat: "two", frame: 0 },
    ]);
  });
  it("requires a whole subtitle for matching and rejects malformed word containers", () => {
    const subtitles = parseNarrationTiming(
      "1\n00:00:12,500 --> 00:00:13,500\nPressure builds slowly.",
      "srt",
    );
    expect(() => importNarrationTiming(plan(), subtitles, options)).toThrow(
      "complete subtitle",
    );
    expect(() => parseNarrationTiming('{"segments":{}}', "json")).toThrow(
      "word timing JSON",
    );
    expect(() =>
      importNarrationTiming(plan(), timing(), {
        ...options,
        sha256: "invalid",
      }),
    ).toThrow();
  });
  it("reads word timing and SRT without inventing word-level SRT timing", () => {
    expect(narrationTimingEntries(timing())).toEqual([
      { text: "Pressure builds.", start: 12.5, end: 13.3 },
    ]);
    const subtitles = parseNarrationTiming(
      "\uFEFF1\r\n00:00:12,500 --> 00:00:13,300\r\nPressure\r\nbuilds.\r\n",
      "srt",
    );
    expect(subtitles.granularity).toBe("subtitle");
    expect(subtitles.segments[0]).toEqual({
      text: "Pressure builds.",
      start: 12.5,
      end: 13.3,
    });
  });
  it("retimes visual and sound anchors from source seconds with atomic undo and manual overrides", () => {
    const source = plan();
    const scene = StorySceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/story-motion/unequal-margins.json",
          "utf8",
        ),
      ),
    );
    const editor = createPassageEditor(
      source,
      new Map([["comparison", scene]]),
    );
    const result = importNarrationTiming(source, timing(), options);
    expect(source.beats[0]!.cues[0]!.frame).toBe(48);
    expect(result.plan.beats[0]!.cues[0]!.frame).toBe(60);
    editor.edit((draft) => Object.assign(draft, result.plan));
    expect(editor.passage.audio!.sounds[0]!.start).toBe(60);
    expect(editor.passage.plan.narration?.sha256).toBe(options.sha256);
    editor.edit((draft) => {
      draft.beats[0]!.cues[0]!.frame = 62;
    });
    expect(editor.passage.audio!.sounds[0]!.start).toBe(62);
    editor.undo();
    expect(editor.passage.audio!.sounds[0]!.start).toBe(60);
    editor.undo();
    expect(editor.passage.audio!.sounds[0]!.start).toBe(48);
  });
  it("adds unbound editable cues while preserving existing bindings", () => {
    const result = importNarrationTiming(plan(), timing(), {
      ...options,
      mode: "add",
    });
    expect(result.plan.beats[0]!.cues.at(-1)).toMatchObject({
      id: "narration-1",
      frame: 60,
      events: [],
    });
    expect(result.plan.beats[0]!.bindings).toEqual(plan().beats[0]!.bindings);
    expect(() =>
      importNarrationTiming(result.plan, timing(), { ...options, mode: "add" }),
    ).toThrow("already exists");
  });
  it("refuses missing or ambiguous phrases and audio/timing mismatches without modifying the plan", () => {
    const source = plan();
    const before = structuredClone(source);
    const duplicate = {
      ...timing(),
      segments: [
        ...timing().segments,
        ...timing().segments.map((s) => ({
          ...s,
          start: s.start + 2,
          end: s.end + 2,
        })),
      ],
    };
    expect(() => importNarrationTiming(source, duplicate, options)).toThrow(
      "ambiguous",
    );
    expect(() =>
      importNarrationTiming(
        source,
        { ...timing(), segments: [{ text: "Different", start: 12, end: 13 }] },
        options,
      ),
    ).toThrow("No timing match");
    expect(() =>
      importNarrationTiming(source, timing(), {
        ...options,
        durationSeconds: 12,
      }),
    ).toThrow("cover");
    expect(() =>
      importNarrationTiming(
        source,
        { ...timing(), segments: [{ text: "Late", start: 21, end: 22 }] },
        options,
      ),
    ).toThrow("beyond");
    expect(source).toEqual(before);
  });
  it.each([
    "1\n00:00:01,000 --> 00:00:00,500\nBackwards",
    "1\n00:99:00,000 --> 01:00:00,000\nInvalid",
    "not a subtitle",
  ])("rejects malformed subtitles: %s", (text) => {
    expect(() => parseNarrationTiming(text, "srt")).toThrow();
  });
  it("rejects unordered word times and matches Unicode words", () => {
    expect(() =>
      parseNarrationTiming(
        JSON.stringify({
          words: [
            { word: "late", start: 2, end: 3 },
            { word: "early", start: 1, end: 2 },
          ],
        }),
        "json",
      ),
    ).toThrow();
    const source = plan();
    source.beats[0]!.cues[0]!.phrase = "Café déjà";
    const words = parseNarrationTiming(
      JSON.stringify({
        segments: [
          {
            words: [
              { word: "Café", start: 12, end: 12.4 },
              { word: "déjà!", start: 12.4, end: 13 },
            ],
          },
        ],
      }),
      "json",
    );
    expect(
      importNarrationTiming(source, words, options).plan.beats[0]!.cues[0]!
        .frame,
    ).toBe(48);
  });
});
