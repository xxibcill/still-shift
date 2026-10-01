import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadComposition,
  renderComposition,
} from "../../packages/animation-engine/src/composition-render.ts";

describe("composition MP4 dimensions", () => {
  it.each([
    [201, 100],
    [200, 101],
    [201, 101],
  ])(
    "rejects %i × %i before encoding while allowing preview loading",
    async (width, height) => {
      const directory = await mkdtemp(
        join(tmpdir(), "composition-dimensions-"),
      );
      try {
        const compositionPath = join(directory, "input.json");
        await writeFile(
          compositionPath,
          JSON.stringify({
            schemaVersion: "composition-1",
            id: "odd",
            width,
            height,
            fps: 30,
            frameCount: 1,
            assets: [],
            layers: [],
          }),
        );
        expect((await loadComposition(compositionPath)).scene.canvas).toEqual({
          width,
          height,
        });
        await expect(
          renderComposition({
            compositionPath,
            outputPath: join(directory, "output.mp4"),
          }),
        ).rejects.toMatchObject({
          code: "SCENE_INVALID",
          message: `MP4 export requires even width and height; received ${width} × ${height}`,
        });
        expect(await readdir(directory)).toEqual(["input.json"]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
