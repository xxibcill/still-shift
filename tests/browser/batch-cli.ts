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

const runBatch = async (
  batchManifestPath = manifestPath,
  batchOutputDir = outputDir,
  depthAdapter = "fake",
) => {
  try {
    const { stdout } = await execFileAsync(
      cliPath,
      [
        "tools/still-shift-cli/src/cli.ts",
        "batch",
        "--manifest",
        batchManifestPath,
        "--output-dir",
        batchOutputDir,
        "--concurrency",
        "2",
      ],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          STILL_SHIFT_DEPTH_ADAPTER: depthAdapter,
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
  assert.equal(first.exitCode, 0);
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
  await writeFile(
    join(outputDir, ".batch.lock"),
    JSON.stringify({ pid: 2147483647, token: "interrupted-run" }),
  );
  const retry = await runBatch();
  assert.equal(retry.exitCode, 0);
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
  await rm(join(outputDir, ".batch-checkpoints", "second.json"));
  await writeFile(
    join(outputDir, ".batch-checkpoints", "second.in-progress.json"),
    JSON.stringify({
      requestHash: repeated[2].requestHash,
      sourceHash: secondResult.checksums.source,
      outputPath: secondResult.outputPath,
      sceneManifestPath: secondResult.sceneManifestPath,
    }),
  );
  const resumed = await runBatch();
  assert.equal(resumed.exitCode, 0);
  assert.equal(resumed.summary.reused, 1);
  const resumedRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(resumedRecords[2].status, secondResult.status);
  assert.equal(resumedRecords[2].reused, false);
  await writeFile(firstResult.outputPath, "tampered output");
  const damaged = await runBatch();
  assert.equal(damaged.exitCode, 0);
  const damagedRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(damagedRecords[0].error.code, "OUTPUT_VALIDATION_FAILED");
  assert.equal(damagedRecords[2].reused, true);

  const changedAdapter = await runBatch(
    manifestPath,
    outputDir,
    "depth-anything-v2-small",
  );
  assert.equal(changedAdapter.summary.reused, 0);
  const changedAdapterRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(changedAdapterRecords[0].error.code, "SCENE_INVALID");
  assert.equal(changedAdapterRecords[2].error.code, "SCENE_INVALID");

  const repairSourcePath = join(directory, "repair.png");
  const repairManifestPath = join(directory, "repair.jsonl");
  const repairOutputDir = join(directory, "repair-outputs");
  await writeFile(repairSourcePath, "invalid image bytes");
  await writeFile(
    repairManifestPath,
    `${JSON.stringify({ id: "repair", inputPath: "repair.png", durationMs: 3000 })}\n`,
  );
  const failedItem = await runBatch(repairManifestPath, repairOutputDir);
  assert.equal(failedItem.summary.failed, 1);
  await writeFile(repairSourcePath, await readFile(sourcePath));
  const repairedItem = await runBatch(repairManifestPath, repairOutputDir);
  assert.equal(repairedItem.summary.successful, 1);
  assert.equal(repairedItem.summary.failed, 0);
  process.stdout.write(
    "Batch CLI verified: bounded workers, failure isolation, deterministic retries, artifact validation, and repaired-item recovery\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
