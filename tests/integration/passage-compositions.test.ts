import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { validateComposition } from "@still-shift/scene-contract";
import { loadPassageCompositions } from "../../packages/animation-engine/src/passage-compositions.ts";
import {
  readStoryPassage,
  type PreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";

it("retains every native schema diagnostic with field, beat and source context", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "native-passage-diagnostics-"),
  );
  try {
    const input = {
      schemaVersion: "composition-1",
      id: "",
      width: 1920,
      height: 1080,
      fps: 24,
      frameCount: 192,
      assets: [],
      layers: [{ id: "", type: "solid", size: [200, 200], color: "#123456" }],
    };
    const sourcePath = join(directory, "picture.json");
    const mapPath = join(directory, "beats.json");
    await writeFile(sourcePath, JSON.stringify(input));
    await writeFile(mapPath, JSON.stringify({ beat: "picture.json" }));
    const passage = {
      beats: [{ id: "beat" }],
    } as Pick<PreparedPassage, "beats">;
    const result = validateComposition(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      "id",
      "layers[0].id",
    ]);
    await expect(
      loadPassageCompositions(mapPath, passage),
    ).rejects.toMatchObject({
      name: "PassageError",
      diagnostics: result.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        beat: "beat",
        sourcePath,
      })),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects a native picture that leaves an event-anchored sound on template timing", async () => {
  const passage = await readStoryPassage(
    "benchmarks/fixtures/story-authoring/linked-comparison.json",
  );
  const map = "benchmarks/fixtures/composition/ce4a/native-beats.json";
  const withSound = (anchor: string) => ({
    ...passage,
    audio: {
      schemaVersion: "passage-audio-1" as const,
      masterGainDb: 0,
      narrationGainDb: 0,
      assets: [],
      sounds: [
        {
          id: "room-hit",
          beat: "reset",
          asset: "hit",
          anchor: {
            type: "event" as const,
            id: anchor,
            edge: "start" as const,
          },
          offset: 0,
          sourceStartFrame: 0,
          durationFrames: 6,
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          start: 0,
          end: 6,
        },
      ],
    },
  });
  await expect(
    loadPassageCompositions(map, withSound("more-room")),
  ).rejects.toMatchObject({
    name: "PassageError",
    diagnostics: [
      expect.objectContaining({
        code: "comp-passage-binding",
        beat: "reset",
        event: "more-room",
      }),
    ],
  });
  await expect(
    loadPassageCompositions(map, withSound("shared-strain")),
  ).resolves.toHaveProperty("reset");
});
