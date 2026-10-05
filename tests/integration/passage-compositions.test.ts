import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { validateComposition } from "@still-shift/scene-contract";
import { loadPassageCompositions } from "../../packages/animation-engine/src/passage-compositions.ts";
import type { PreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";

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
