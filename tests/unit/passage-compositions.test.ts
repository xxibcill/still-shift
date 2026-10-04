import { describe, expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import { validatePassageCompositions } from "../../packages/animation-engine/src/passage-compositions.ts";
import { passageCompositionKey } from "../../packages/animation-engine/src/passage-cache.ts";
import type { PreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";

const composition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "native",
  width: 1920,
  height: 1080,
  fps: 24,
  frameCount: 192,
  assets: [],
  layers: [
    {
      id: "panel",
      type: "solid",
      size: [200, 200],
      color: "#123456",
      blendMode: "multiply",
    },
  ],
});
const passage = () =>
  ({
    beats: [
      {
        id: "beat",
        scene: { width: 1920, height: 1080, fps: 24, frameCount: 192 },
        handoff: { mode: "cut", camera: "reset", subjects: [] },
      },
    ],
  }) as unknown as Pick<PreparedPassage, "beats">;

describe("native composition passage beats", () => {
  it("validates native pictures without mutating their authority or surrogate story", () => {
    const input = composition(),
      story = passage();
    expect(validatePassageCompositions(story, { beat: input }).beat).toEqual(
      input,
    );
    expect(input).toEqual(composition());
    expect(story).toEqual(passage());
  });
  it.each(["width", "height", "fps", "frameCount"] as const)(
    "rejects mismatched %s instead of retiming silently",
    (field) => {
      const input = composition();
      if (field === "fps") input.fps = 30;
      else input[field] += 2;
      expect(() =>
        validatePassageCompositions(passage(), { beat: input }),
      ).toThrow(/must match/);
    },
  );
  it("rejects unknown beats and reports native schema failures", () => {
    expect(() =>
      validatePassageCompositions(passage(), { missing: composition() }),
    ).toThrow(/Unknown beat/);
    const input = composition();
    input.layers[0]!.id = "";
    expect(() =>
      validatePassageCompositions(passage(), { beat: input }),
    ).toThrow();
  });
  it("rejects implicit carry on either side of a native beat", () => {
    const story = passage();
    const beat = story.beats[0]!;
    if (!("handoff" in beat)) throw new Error("handoff required");
    beat.handoff.camera = "carry";
    expect(() =>
      validatePassageCompositions(story, { beat: composition() }),
    ).toThrow(/authored transforms/);
    beat.handoff.camera = "reset";
    story.beats.push({
      ...beat,
      id: "following",
      handoff: {
        ...beat.handoff,
        subjects: [{ id: "actor", mode: "carry", properties: ["x"] }],
      },
    });
    expect(() =>
      validatePassageCompositions(story, { beat: composition() }),
    ).toThrow(/authored transforms/);
  });
  it("hashes portable native picture content, backend and runtime", () => {
    const input = composition();
    input.assets.push({
      id: "image",
      type: "image",
      path: "/first/image.png",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 20,
      height: 20,
    });
    const key = passageCompositionKey(input, "runtime");
    input.assets[0]!.path = "/relocated/image.png";
    expect(passageCompositionKey(input, "runtime")).toBe(key);
    expect(passageCompositionKey(input, "different")).not.toBe(key);
    expect(passageCompositionKey(input, "runtime", "webgl2")).not.toBe(key);
    input.layers[0]!.blendMode = "screen";
    expect(passageCompositionKey(input, "runtime")).not.toBe(key);
  });
  it("does not treat inherited object names as overrides", () => {
    const story = passage();
    story.beats[0]!.id = "constructor";
    const result = validatePassageCompositions(story);
    expect(result.constructor).toBeUndefined();
  });
});
