import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireBatchLock,
  prepareBatchItem,
} from "../../tools/still-shift-cli/src/batch-recovery.ts";

describe("batch interruption recovery", () => {
  it("keeps a live owner from losing the output-directory lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-lock-"));
    try {
      const lockPath = join(directory, ".batch.lock");
      const release = await acquireBatchLock(lockPath, directory);
      await expect(acquireBatchLock(lockPath, directory)).rejects.toThrow(
        "already in use",
      );
      await release();
      const nextRelease = await acquireBatchLock(lockPath, directory);
      await nextRelease();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not replace outputs when the progress marker is absent or mismatched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-progress-"));
    try {
      const outputPath = join(directory, "clip.mp4");
      const markerPath = join(directory, "clip.in-progress.json");
      const progress = {
        requestHash: "request",
        sourceHash: "source",
        outputPath,
        sceneManifestPath: `${outputPath}.scene.json`,
      };
      await writeFile(outputPath, "existing clip");
      await expect(prepareBatchItem(markerPath, progress)).rejects.toThrow(
        "without a checkpoint or progress marker",
      );
      await writeFile(
        markerPath,
        JSON.stringify({ ...progress, sourceHash: "previous source" }),
      );
      await expect(prepareBatchItem(markerPath, progress)).rejects.toThrow(
        "changed after an interrupted render",
      );
      expect(await readFile(outputPath, "utf8")).toBe("existing clip");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
