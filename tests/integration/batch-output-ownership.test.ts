import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@still-shift/animation-engine", () => ({
  WebGLAnimationEngine: class {
    requestIdentity() {
      return "fixed-request";
    }
    async animate(request: { outputPath: string }) {
      await writeFile(request.outputPath, "competing video", { flag: "wx" });
      await writeFile(`${request.outputPath}.scene.json`, "competing scene", {
        flag: "wx",
      });
      throw new Error("Output already exists or changed");
    }
  },
}));

vi.mock("@still-shift/execution-runtime/locks", async (importOriginal) => ({
  ...(await importOriginal()),
  acquireArtifactLock: async () => async () => undefined,
}));

import { runBatch } from "../../tools/still-shift-cli/src/batch.ts";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

it("preserves an output created while a batch item is rendering", async () => {
  directory = await mkdtemp(join(tmpdir(), "still-shift-batch-owner-"));
  const inputPath = join(directory, "source.png");
  const manifestPath = join(directory, "batch.jsonl");
  const outputDir = join(directory, "output");
  const outputPath = join(outputDir, "clip.mp4");
  await writeFile(inputPath, "source bytes");
  await writeFile(
    manifestPath,
    JSON.stringify({ id: "clip", inputPath: "source.png" }) + "\n",
  );

  const { summary } = await runBatch({
    manifestPath,
    outputDir,
    concurrency: 1,
  });

  expect(summary.failed).toBe(1);
  expect(await readFile(outputPath, "utf8")).toBe("competing video");
  expect(await readFile(`${outputPath}.scene.json`, "utf8")).toBe(
    "competing scene",
  );
  await expect(
    readFile(join(outputDir, ".batch-checkpoints", "clip.in-progress.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
