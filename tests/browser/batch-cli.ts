import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
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
    const failure = error as { code: number; stdout: string; stderr: string };
    return {
      exitCode: failure.code,
      summary: JSON.parse(failure.stdout || "null"),
      error: failure.stderr ? JSON.parse(failure.stderr) : null,
    };
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
  await mkdir(outputDir);
  const lockPath = join(outputDir, ".batch.lock");
  await mkdir(lockPath);
  const locked = await runBatch();
  assert.equal(locked.exitCode, 1);
  assert.equal(locked.error.error.code, "RENDER_FAILED");
  const staleTime = new Date(Date.now() - 60_000);
  await utimes(lockPath, staleTime, staleTime);
  const first = await runBatch();
  assert.equal(first.exitCode, 1);
  assert.equal(first.summary.itemCount, 3);
  assert.equal(first.summary.successful, 2);
  assert.equal(first.summary.failed, 1);
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
  await rm(join(outputDir, ".batch-checkpoints", "first.json"));
  await writeFile(
    join(outputDir, ".batch-checkpoints", "first.pending.json"),
    JSON.stringify({
      requestHash: records[0].requestHash,
      sourceHash: firstResult.checksums.source,
    }),
  );
  const recovered = await runBatch();
  assert.equal(recovered.exitCode, 1);
  assert.equal(recovered.summary.successful, 2);
  assert.equal(recovered.summary.reused, 1);
  const recoveredRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(recoveredRecords[0].reused, false);
  assert.equal(recoveredRecords[2].reused, true);
  const orphanRoot = join(outputDir, ".batch-orphans", "first");
  const [orphanId] = await readdir(orphanRoot);
  assert.ok(orphanId);
  assert.deepEqual((await readdir(join(orphanRoot, orphanId))).sort(), [
    "first.mp4",
    "first.mp4.scene.json",
  ]);
  const checkpointPath = join(outputDir, ".batch-checkpoints", "first.json");
  const pendingPath = join(
    outputDir,
    ".batch-checkpoints",
    "first.pending.json",
  );
  const checkpoint = await readFile(checkpointPath);
  const preservedVideo = await readFile(firstResult.outputPath);
  await rm(checkpointPath);
  await writeFile(
    pendingPath,
    JSON.stringify({
      requestHash: records[0].requestHash,
      sourceHash: `sha256:${"0".repeat(64)}`,
    }),
  );
  const changed = await runBatch();
  assert.equal(changed.exitCode, 1);
  const changedRecords = (
    await readFile(join(outputDir, "batch-results.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(changedRecords[0].error.code, "SCENE_INVALID");
  assert.deepEqual(await readFile(firstResult.outputPath), preservedVideo);
  await writeFile(checkpointPath, checkpoint);
  await rm(pendingPath);
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
    "Batch CLI verified: bounded workers, failure isolation, crash recovery, deterministic retries, and artifact validation\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
