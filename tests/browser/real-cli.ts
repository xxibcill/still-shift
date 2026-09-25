import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
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
const invalidProfilePath = join(directory, "invalid-profile.png");
const ffmpegWrapperDirectory = join(directory, "ffmpeg-wrapper");
const cliPath = resolve("node_modules/.bin/tsx");
const cliScriptPath = resolve("tools/still-shift-cli/src/cli.ts");
const environment = {
  ...process.env,
  STILL_SHIFT_DEPTH_ADAPTER: "fake",
  STILL_SHIFT_CACHE_DIR: join(directory, "cache"),
};

const runCli = async (
  outputPath: string,
  options: {
    adapter?: string;
    inputPath?: string;
    cwd?: string;
    cacheDir?: string;
    viaPnpm?: boolean;
    failSafetyAnalysis?: boolean;
  } = {},
) => {
  const args = [
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
  const command = options.viaPnpm ? "pnpm" : cliPath;
  const commandArgs = options.viaPnpm
    ? ["--silent", "still-shift", ...args]
    : [cliScriptPath, ...args];
  const { stdout } = await execFileAsync(command, commandArgs, {
    cwd: options.cwd ?? resolve("."),
    env: {
      ...environment,
      ...(options.cacheDir ? { STILL_SHIFT_CACHE_DIR: options.cacheDir } : {}),
      ...(options.adapter
        ? { STILL_SHIFT_DEPTH_ADAPTER: options.adapter }
        : {}),
      ...(options.failSafetyAnalysis
        ? {
            PATH: `${ffmpegWrapperDirectory}:${process.env.PATH ?? ""}`,
            STILL_SHIFT_TEST_FFMPEG_REAL: realFfmpegPath,
          }
        : {}),
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  return AnimationResultSchema.parse(JSON.parse(stdout));
};

const realFfmpegPath = (await execFileAsync("which", ["ffmpeg"])).stdout.trim();
await mkdir(ffmpegWrapperDirectory);
const ffmpegWrapperPath = join(ffmpegWrapperDirectory, "ffmpeg");
await writeFile(
  ffmpegWrapperPath,
  '#!/bin/sh\nfor arg in "$@"; do\n  if [ "$arg" = "pipe:1" ]; then exit 77; fi\ndone\nexec "$STILL_SHIFT_TEST_FFMPEG_REAL" "$@"\n',
);
await chmod(ffmpegWrapperPath, 0o755);

const occupiedPort = createServer();
const ownsPort = await new Promise<boolean>((accept, reject) => {
  occupiedPort.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") accept(false);
    else reject(error);
  });
  occupiedPort.listen(5173, "127.0.0.1", () => accept(true));
});

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
  const first = await runCli(join(directory, "first.mp4"), {
    viaPnpm: true,
  });
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
  assert.deepEqual(scene.execution, {
    adapter: "webgl",
    producesVideo: true,
    frameTransport: "jpeg_pipe",
  });
  assert.ok(scene.renderScene);
  assert.equal(scene.model?.adapter, "fake");
  assert.deepEqual(scene.model, first.metrics.versions.model);
  assert.match(scene.model.weightsChecksum, /^sha256:[a-f0-9]{64}$/);

  const alternateCache = await runCli(join(directory, "alternate-cache.mp4"), {
    cacheDir: join(directory, "other-cache"),
  });
  const alternateScene = SceneManifestSchema.parse(
    JSON.parse(await readFile(alternateCache.sceneManifestPath, "utf8")),
  );
  assert.deepEqual(alternateScene, scene);
  assert.equal(alternateCache.checksums.scene, first.checksums.scene);
  assert.notEqual(
    alternateCache.assetPaths?.normalizedSource,
    first.assetPaths?.normalizedSource,
  );

  await execFileAsync("uv", [
    "run",
    "--no-sync",
    "python",
    "-c",
    "from PIL import Image; import sys; image = Image.open(sys.argv[1]); image.save(sys.argv[2], icc_profile=b'invalid ICC profile')",
    sourcePath,
    invalidProfilePath,
  ]);
  const normalizedWithWarning = await runCli(
    join(directory, "invalid-profile.mp4"),
    { inputPath: invalidProfilePath },
  );
  assert.equal(normalizedWithWarning.status, "rendered_with_warnings");
  assert.ok(
    normalizedWithWarning.warnings.some(
      (warning) =>
        warning.code === "SOURCE_NORMALIZATION_WARNING" &&
        warning.context?.workerCode === "INVALID_ICC_PROFILE_TREATED_AS_SRGB",
    ),
  );
  const warningScene = SceneManifestSchema.parse(
    JSON.parse(await readFile(normalizedWithWarning.sceneManifestPath, "utf8")),
  );
  assert.deepEqual(
    warningScene.quality.warnings,
    normalizedWithWarning.warnings,
  );
  assert.deepEqual(
    warningScene.renderScene?.warnings,
    normalizedWithWarning.warnings,
  );

  const externalCaller = await runCli(join(directory, "external.mp4"), {
    inputPath: "explainer-shot.png",
    cwd: directory,
    cacheDir: "relative-cache",
  });
  assert.equal(externalCaller.checksums.source, first.checksums.source);
  assert.equal(externalCaller.metrics.cacheStatus, "miss");
  assert.ok(externalCaller.assetPaths);
  assert.ok(
    (await realpath(externalCaller.assetPaths.normalizedSource)).startsWith(
      await realpath(join(directory, "relative-cache", "depth")),
    ),
  );

  const fallback = await runCli(join(directory, "fallback.mp4"), {
    adapter: "invalid",
    inputPath: invalidProfilePath,
    cwd: directory,
    cacheDir: "relative-fallback-cache",
  });
  assert.equal(fallback.status, "fallback_2d");
  assert.ok(
    fallback.warnings.some(
      (warning) => warning.code === "DEPTH_PREPARATION_FAILED",
    ),
  );
  assert.equal(fallback.checksums.depth, undefined);
  assert.equal(fallback.metrics.versions.model, null);
  assert.ok(fallback.assetPaths);
  assert.ok(
    (await realpath(fallback.assetPaths.normalizedSource)).startsWith(
      await realpath(join(directory, "relative-fallback-cache", "depth")),
    ),
  );
  assert.ok(
    fallback.warnings.some(
      (warning) => warning.code === "SOURCE_NORMALIZATION_WARNING",
    ),
  );

  const analysisFallback = await runCli(
    join(directory, "analysis-fallback.mp4"),
    {
      failSafetyAnalysis: true,
    },
  );
  assert.equal(analysisFallback.status, "fallback_2d");
  assert.equal(analysisFallback.metrics.versions.model?.adapter, "fake");
  assert.ok(
    analysisFallback.warnings.some(
      (warning) => warning.code === "DEPTH_SAFETY_ANALYSIS_FAILED",
    ),
  );
  assert.ok(
    !analysisFallback.warnings.some(
      (warning) => warning.code === "DEPTH_PREPARATION_FAILED",
    ),
  );
  const analysisScene = SceneManifestSchema.parse(
    JSON.parse(await readFile(analysisFallback.sceneManifestPath, "utf8")),
  );
  assert.equal(
    analysisScene.renderScene?.quality?.fallbackReason,
    "DEPTH_SAFETY_ANALYSIS_FAILED",
  );

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
  if (ownsPort) {
    await new Promise<void>((accept, reject) => {
      occupiedPort.close((error) => (error ? reject(error) : accept()));
    });
  }
  await rm(directory, { recursive: true, force: true });
}
