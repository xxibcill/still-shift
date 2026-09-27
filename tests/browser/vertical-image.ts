import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { WebGLAnimationEngine } from "../../packages/animation-engine/src/webgl-animation-engine.ts";
import { SceneManifestSchema } from "../../packages/scene-contract/src/contracts.ts";

const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "vertical-image-"));
const oldAdapter = process.env.STILL_SHIFT_DEPTH_ADAPTER;
const oldCache = process.env.STILL_SHIFT_CACHE_DIR;
try {
  process.env.STILL_SHIFT_DEPTH_ADAPTER = "fake";
  process.env.STILL_SHIFT_CACHE_DIR = join(directory, "cache");
  const inputPath = resolve(
    "benchmarks/fixtures/depth-image/vertical/focal-block.png",
  );
  const outputPath = join(directory, "vertical.mp4");
  const result = await new WebGLAnimationEngine().animate({
    inputPath,
    outputPath,
    durationMs: 3000,
    fps: 30,
    width: 1080,
    height: 1920,
    preset: "horizontal_drift",
    intensity: "subtle",
    seed: 1842,
    focus: [0.76, 0.5],
  });
  const manifest = SceneManifestSchema.parse(
    JSON.parse(await readFile(result.sceneManifestPath, "utf8")),
  );
  assert.equal(manifest.renderScene?.rendererVersion, "preview-render-0.6.0");
  assert.equal(manifest.framing?.source, "provided");
  assert.equal(manifest.framing?.focus[0], 0.76);
  assert.ok((manifest.framing?.crop.x ?? 0) > 0.5);
  assert.deepEqual(manifest.canvas, { width: 1080, height: 1920 });
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,nb_read_frames,codec_name,profile,level",
    "-of",
    "json",
    outputPath,
  ]);
  const video = JSON.parse(stdout).streams[0];
  assert.deepEqual(
    [video.width, video.height, Number(video.nb_read_frames)],
    [1080, 1920, 90],
  );
  assert.equal(video.codec_name, "h264");
  assert.ok(video.level <= 42);
  const captureAt = process.argv.indexOf("--capture");
  if (captureAt >= 0) {
    const capture = process.argv[captureAt + 1];
    if (!capture) throw new Error("--capture requires a PNG path");
    const destination = resolve(capture);
    await mkdir(dirname(destination), { recursive: true });
    await run("ffmpeg", [
      "-v",
      "error",
      "-i",
      outputPath,
      "-vf",
      "select=eq(n\\,45)",
      "-frames:v",
      "1",
      "-y",
      destination,
    ]);
  }
  const playerPath = join(directory, "player.html");
  await writeFile(
    playerPath,
    '<!doctype html><video src="vertical.mp4" muted playsinline></video>',
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(pathToFileURL(playerPath).href);
    await page
      .locator("video")
      .evaluate((element: HTMLVideoElement) => element.play());
    await page.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0.1,
      null,
      { timeout: 10000 },
    );
    assert.deepEqual(
      await page
        .locator("video")
        .evaluate((element: HTMLVideoElement) => [
          element.videoWidth,
          element.videoHeight,
        ]),
      [1080, 1920],
    );
  } finally {
    await browser.close();
  }
  console.log("Vertical image export verified: 1080×1920, 90 H.264 frames");
} finally {
  if (oldAdapter === undefined) delete process.env.STILL_SHIFT_DEPTH_ADAPTER;
  else process.env.STILL_SHIFT_DEPTH_ADAPTER = oldAdapter;
  if (oldCache === undefined) delete process.env.STILL_SHIFT_CACHE_DIR;
  else process.env.STILL_SHIFT_CACHE_DIR = oldCache;
  await rm(directory, { recursive: true, force: true });
}
