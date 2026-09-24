import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { AnimationResultSchema } from "../../packages/scene-contract/src/index.ts";

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "still-shift-batch-test-"));
const sourcePath = join(directory, "source.png");
const manifestPath = join(directory, "batch.jsonl");
const outputDir = join(directory, "outputs");
const cliPath = resolve("node_modules/.bin/tsx");

const runBatch = async () => {
  try {
    const { stdout } = await execFileAsync(
      cliPath,
      [
        "tools/still-shift-cli/src/cli.ts",
        "batch",
        "--manifest",
        manifestPath,
        "--output-dir",
        outputDir,
        "--concurrency",
        "2",
      ],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          STILL_SHIFT_DEPTH_ADAPTER: "fake",
          STILL_SHIFT_CACHE_DIR: join(directory, "cache"),
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { exitCode: 0, summary: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { exitCode: failure.code, summary: JSON.parse(failure.stdout) };
  }
};

try {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x52606d:s=640x360:r=1:d=1",
    "-frames:v",
    "1",
    "-y",
    sourcePath,
  ]);
  await writeFile(
    manifestPath,
    [
      {
        id: "first",
        inputPath: "source.png",
        durationMs: 3000,
        preset: "slow_push",
      },
      { id: "missing", inputPath: "missing.png" },
      {
        id: "second",
        inputPath: "source.png",
        durationMs: 3000,
        preset: "cinematic_float",
      },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n") + "\n",
  );
  const first = await runBatch();
  assert.equal(first.exitCode, 1);
  assert.equal(first.summary.itemCount, 3);
  assert.equal(first.summary.successful, 2);
  assert.equal(first.summary.failed, 1);
  assert.match(first.summary.manifestSha256, /^sha256:[a-f0-9]{64}$/);
  const records = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.id),
    ["first", "missing", "second"],
  );
  assert.equal(records[1].error.code, "INPUT_UNREADABLE");
  const firstResult = AnimationResultSchema.parse(records[0].result);
  const secondResult = AnimationResultSchema.parse(records[2].result);
  assert.equal(firstResult.frameCount, 90);
  assert.equal(secondResult.frameCount, 90);
  assert.notEqual(firstResult.selectedPreset, secondResult.selectedPreset);
  const retry = await runBatch();
  assert.equal(retry.exitCode, 1);
  assert.equal(retry.summary.reused, 2);
  assert.equal(retry.summary.manifestSha256, first.summary.manifestSha256);
  assert.equal(
    retry.summary.artifactSetSha256,
    first.summary.artifactSetSha256,
  );
  const repeated = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(repeated[0].result, records[0].result);
  assert.deepEqual(repeated[2].result, records[2].result);
  assert.equal(repeated[0].reused, true);
  assert.equal(repeated[2].reused, true);
  await writeFile(firstResult.outputPath, "tampered output");
  const damaged = await runBatch();
  assert.equal(damaged.exitCode, 1);
  const damagedRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(damagedRecords[0].error.code, "OUTPUT_VALIDATION_FAILED");
  assert.equal(damagedRecords[2].reused, true);
  process.stdout.write(
    "Batch CLI verified: bounded workers, failure isolation, deterministic retries, and artifact validation\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
