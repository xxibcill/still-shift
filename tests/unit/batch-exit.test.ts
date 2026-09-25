import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runBatch } from "../../tools/still-shift-cli/src/batch.ts";

const runManifest = async (line: string) => {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-batch-exit-"));
  try {
    const manifestPath = join(directory, "batch.jsonl");
    const outputDir = join(directory, "outputs");
    await writeFile(manifestPath, `${line}\n`);
    const outcome = await runBatch({ manifestPath, outputDir, concurrency: 1 });
    const records = (
      await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((record) => JSON.parse(record) as { status: string });
    return { outcome, records };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe("batch exit status", () => {
  it("exits successfully after recording an item failure", async () => {
    const { outcome, records } = await runManifest(
      JSON.stringify({ id: "missing", inputPath: "missing.png" }),
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.summary).toMatchObject({ itemCount: 1, failed: 1 });
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("failed");
  });

  it("reports invalid manifest items as configuration failures", async () => {
    for (const line of [
      "not json",
      JSON.stringify({
        id: "invalid",
        inputPath: "image.png",
        durationMs: 3001,
      }),
    ]) {
      const { outcome, records } = await runManifest(line);
      expect(outcome.exitCode).toBe(2);
      expect(records).toHaveLength(1);
      expect(records[0]?.status).toBe("failed");
    }
  });
});
