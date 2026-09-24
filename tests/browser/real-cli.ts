import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  AnimationResultSchema,
  SceneManifestSchema,
  type AnimationRequest,
} from "../../packages/scene-contract/src/index.ts";

const execFileAsync = promisify(execFile);
const fixture = JSON.parse(
  await readFile("tests/fixtures/explainer-shot.request.json", "utf8"),
) as Omit<AnimationRequest, "inputPath" | "outputPath">;
const directory = await mkdtemp(join(tmpdir(), "still-shift-cli-test-"));
const sourcePath = join(directory, "explainer-shot.png");
const cliPath = resolve("node_modules/.bin/tsx");
const environment = {
  ...process.env,
  STILL_SHIFT_DEPTH_ADAPTER: "fake",
  STILL_SHIFT_CACHE_DIR: join(directory, "cache"),
};

const runCli = async (
  outputPath: string,
  options: { adapter?: string; inputPath?: string } = {},
) => {
  const args = [
    "tools/still-shift-cli/src/cli.ts",
    "animate",
    "--input",
    options.inputPath ?? sourcePath,
    "--output",
    outputPath,
    "--duration",
    String(fixture.durationMs / 1000),
    "--fps",
    String(fixture.fps),
    "--preset",
    fixture.preset,
    "--intensity",
    fixture.intensity,
    "--seed",
    String(fixture.seed),
  ];
  const { stdout } = await execFileAsync(cliPath, args, {
    cwd: resolve("."),
    env: {
      ...environment,
      ...(options.adapter
        ? { STILL_SHIFT_DEPTH_ADAPTER: options.adapter }
        : {}),
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  return AnimationResultSchema.parse(JSON.parse(stdout));
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
    "-vf",
    "drawbox=x=70:y=48:w=180:h=245:color=0xa9b7bd:t=fill,drawbox=x=280:y=35:w=245:h=260:color=0x2d454f:t=fill,drawbox=x=330:y=83:w=140:h=80:color=0xe0aa74:t=fill",
    "-frames:v",
    "1",
    "-y",
    sourcePath,
  ]);
  const first = await runCli(join(directory, "first.mp4"));
  const second = await runCli(join(directory, "second.mp4"));
  assert.ok(
    first.status === "rendered" || first.status === "rendered_with_warnings",
  );
  assert.equal(first.metrics.cacheStatus, "miss");
  assert.equal(second.metrics.cacheStatus, "hit");
  assert.equal(first.frameCount, 90);
  assert.equal(second.frameCount, 90);
  assert.equal(first.selectedPreset, second.selectedPreset);
  assert.deepEqual(first.checksums, second.checksums);
  const scene = SceneManifestSchema.parse(
    JSON.parse(await readFile(first.sceneManifestPath, "utf8")),
  );
  assert.deepEqual(scene.execution, { adapter: "webgl", producesVideo: true });
  assert.ok(scene.renderScene);

  const fallback = await runCli(join(directory, "fallback.mp4"), {
    adapter: "invalid",
  });
  assert.equal(fallback.status, "fallback_2d");
  assert.ok(
    fallback.warnings.some(
      (warning) => warning.code === "DEPTH_PREPARATION_FAILED",
    ),
  );
  assert.equal(fallback.checksums.depth, undefined);

  const missingOutput = join(directory, "missing.mp4");
  await assert.rejects(
    runCli(missingOutput, { inputPath: join(directory, "missing.png") }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      String(error.stderr).includes('"code":"INPUT_UNREADABLE"'),
  );
  await assert.rejects(readFile(missingOutput), { code: "ENOENT" });
  const existingPath = join(directory, "existing.mp4");
  await writeFile(existingPath, "existing output");
  await assert.rejects(
    runCli(existingPath),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      String(error.stderr).includes('"code":"RENDER_FAILED"'),
  );
  assert.equal(await readFile(existingPath, "utf8"), "existing output");
  process.stdout.write(
    "Single-image CLI verified: 90-frame MP4, cache hit, stable hashes, 2D fallback, and errors\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
