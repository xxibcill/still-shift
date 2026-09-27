import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { CinematicAnimationResultSchema } from "../../packages/scene-contract/src/cinematic.ts";

const run = promisify(execFile);
const directory = await mkdtemp(
  join(tmpdir(), "still-shift-vertical-cinematic-"),
);
const outputPath = join(directory, "rising-vista.mp4");
const scenePath =
  "benchmarks/fixtures/cinematic-illustrated/vertical/ci-vertical-rising-vista.json";
const captureArg = process.argv.indexOf("--capture");
const capturePath =
  captureArg >= 0 ? resolve(process.argv[captureArg + 1]!) : undefined;

try {
  const result = CinematicAnimationResultSchema.parse(
    await new PreparedAnimationEngine().animate({ scenePath, outputPath }),
  );
  assert.equal(result.frameCount, 96);
  assert.equal(result.metrics.format, "vertical");
  assert.equal(result.metrics.width, 1080);
  assert.equal(result.metrics.height, 1920);
  assert.ok(result.cameraValidation.minimumCoverageMargin > 0);
  assert.ok((result.cameraValidation.foregroundVerticalTravelPx ?? 0) >= 192);
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,nb_frames",
    "-of",
    "json",
    outputPath,
  ]);
  const video = JSON.parse(stdout) as {
    streams: { width: number; height: number; nb_frames: string }[];
  };
  assert.deepEqual(video.streams[0], {
    width: 1080,
    height: 1920,
    nb_frames: "96",
  });
  assert.equal(
    JSON.parse(await readFile(`${outputPath}.scene.json`, "utf8")).scene
      .rendererVersion,
    "cinematic-canvas-1.0.0",
  );
  if (capturePath)
    await run("ffmpeg", [
      "-v",
      "error",
      "-i",
      outputPath,
      "-vf",
      "select=eq(n\\,48)",
      "-frames:v",
      "1",
      "-y",
      capturePath,
    ]);
  console.log("Vertical cinematic export: 1080x1920, 96 frames, coverage OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
