import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { chromium } from "playwright";
import { createServer } from "vite";

import {
  compareFrameMotion,
  compareFrameSamples,
} from "../../packages/renderer-core/src/parity.ts";
import type { PreviewScene } from "../../packages/renderer-core/src/scene.ts";
import { SHADER_VERSION } from "../../packages/renderer-core/src/webgl-renderer.ts";
import { exportScene } from "../../tools/export-worker/src/export-worker.ts";
import { GOLDEN_SCENES } from "../visual/golden-scenes.ts";

const sampleWidth = 64;
const sampleHeight = 36;
const baselinePath = resolve("tests/visual/golden-baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");

type Baseline = {
  version: "golden-parity-0.7.0";
  format: "rgb24-64x36-gzip-base64";
  rendererVersion: string;
  shaderVersion: string;
  browserVersion: string;
  gpuRenderer: string;
  ffmpegVersion: string;
  samples: Record<string, string>;
};

const ffmpegRgb = async (
  path: string,
  frameIndex?: number,
): Promise<Uint8Array> => {
  const filter = [
    ...(frameIndex === undefined ? [] : [`select=eq(n\\,${frameIndex})`]),
    `scale=${sampleWidth}:${sampleHeight}:flags=bicubic`,
  ].join(",");
  const args = [
    "-v",
    "error",
    "-i",
    path,
    "-vf",
    filter,
    "-fps_mode",
    "vfr",
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ];
  const process = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  process.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  process.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  await new Promise<void>((accept, reject) => {
    process.on("error", reject);
    process.on("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(Buffer.concat(stderr).toString())),
    );
  });
  const pixels = Buffer.concat(stdout);
  assert.equal(pixels.length, sampleWidth * sampleHeight * 3);
  return pixels;
};

const directory = await mkdtemp(join(tmpdir(), "still-shift-goldens-"));
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 4177, strictPort: true },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:4177/");
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#preview");
    if (!canvas) throw new Error("Lab preview canvas is missing");
    canvas.width = 1920;
    canvas.height = 1080;
  });
  const gpuRenderer = await page.evaluate(() => {
    const gl = document
      .querySelector<HTMLCanvasElement>("#preview")
      ?.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 is unavailable");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });
  const saved = writeBaseline
    ? null
    : (JSON.parse(await readFile(baselinePath, "utf8")) as Baseline);
  if (saved) {
    assert.equal(saved.version, "golden-parity-0.7.0");
    assert.equal(saved.format, "rgb24-64x36-gzip-base64");
    assert.equal(saved.shaderVersion, SHADER_VERSION);
  }
  const samples: Record<string, string> = {};
  const scores: {
    id: string;
    frame: number;
    transport: string;
    mae: number;
    edge: number;
    color: number;
  }[] = [];
  const modes: Record<string, string> = {};
  let browserVersion = "";
  let ffmpegVersion = "";
  let rendererVersion = "";
  for (const golden of GOLDEN_SCENES) {
    const sourcePath = join(directory, `${golden.id}-source.svg`);
    const depthPath = join(directory, `${golden.id}-depth.svg`);
    await writeFile(sourcePath, golden.source);
    await writeFile(depthPath, golden.depth);
    await page.locator("#preset").selectOption(golden.preset);
    await page.locator("#intensity").selectOption(golden.intensity);
    await page.locator("#local-source").setInputFiles({
      name: `${golden.id}.svg`,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(golden.source),
    });
    await page.locator("#local-depth").setInputFiles({
      name: `${golden.id}-depth.svg`,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(golden.depth),
    });
    await page.locator("#load-local").click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector("#status")
          ?.textContent?.includes(`${id}.svg ready`) ||
        document.querySelector("#status")?.classList.contains("error"),
      golden.id,
      { timeout: 30_000 },
    );
    const status = await page.locator("#status").textContent();
    assert.ok(status?.includes("ready"), status ?? "No lab status");
    const parameters = JSON.parse(
      (await page.locator("#parameters").textContent()) ?? "{}",
    );
    const { evaluatedFrame: _evaluatedFrame, ...scene } =
      parameters as PreviewScene & {
        evaluatedFrame: unknown;
      };
    void _evaluatedFrame;
    rendererVersion = scene.rendererVersion;
    assert.equal(
      scene.motion.mode,
      "depth",
      `${golden.id} must use depth mode: ${JSON.stringify(scene.quality)}`,
    );
    modes[golden.id] = scene.motion.mode;
    const frameIndices = [
      0,
      Math.floor(scene.timeline.frameCount / 2),
      scene.timeline.frameCount - 1,
    ];
    const previewPaths = new Map<number, string>();
    for (const frameIndex of frameIndices) {
      const base64 = await page.evaluate((index) => {
        const slider = document.querySelector<HTMLInputElement>("#frame");
        const canvas = document.querySelector<HTMLCanvasElement>("#preview");
        if (!slider || !canvas) throw new Error("Preview controls are missing");
        slider.value = String(index);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        return canvas.toDataURL("image/png").split(",")[1]!;
      }, frameIndex);
      const previewPath = join(
        directory,
        `${golden.id}-${frameIndex}-preview.png`,
      );
      await writeFile(previewPath, Buffer.from(base64, "base64"));
      previewPaths.set(frameIndex, previewPath);
    }
    const outputPath = join(directory, `${golden.id}.mp4`);
    const metrics = await exportScene({
      scene,
      sourcePath,
      depthPath,
      outputPath,
    });
    const jpegOutputPath = join(directory, `${golden.id}-jpeg.mp4`);
    const jpegMetrics = await exportScene({
      scene,
      sourcePath,
      depthPath,
      outputPath: jpegOutputPath,
      transport: "jpeg_pipe",
    });
    assert.equal(jpegMetrics.frameCount, metrics.frameCount);
    browserVersion = metrics.browserVersion;
    ffmpegVersion = metrics.ffmpegVersion;
    const transports = [
      ["png_pipe", outputPath],
      ["jpeg_pipe", jpegOutputPath],
    ] as const;
    const previewFrames = new Map<number, Uint8Array>();
    const exportFrames = new Map<string, Uint8Array>();
    for (const frameIndex of frameIndices) {
      const preview = await ffmpegRgb(previewPaths.get(frameIndex)!);
      previewFrames.set(frameIndex, preview);
      for (const [transport, renderedPath] of transports) {
        const exported = await ffmpegRgb(renderedPath, frameIndex);
        exportFrames.set(`${transport}:${frameIndex}`, exported);
        const comparison = compareFrameSamples(
          preview,
          exported,
          sampleWidth,
          sampleHeight,
        );
        if (comparison.warning)
          throw new Error(
            `${comparison.warning.code} ${golden.id} ${transport} frame ${frameIndex}: ${JSON.stringify(comparison)}`,
          );
        scores.push({
          id: golden.id,
          frame: frameIndex,
          transport,
          mae: comparison.meanAbsoluteError,
          edge: comparison.edgeAbsoluteError,
          color: comparison.channelMeanError,
        });
      }
      const key = `${golden.id}:${frameIndex}`;
      samples[key] = gzipSync(preview).toString("base64");
      if (saved) {
        const reference = saved.samples[key];
        assert.ok(reference, `Missing baseline for ${key}`);
        const baseline = gunzipSync(Buffer.from(reference, "base64"));
        const regression = compareFrameSamples(
          baseline,
          preview,
          sampleWidth,
          sampleHeight,
        );
        if (regression.warning)
          throw new Error(
            `${regression.warning.code} golden baseline ${key}: ${JSON.stringify(regression)}`,
          );
      }
    }
    for (const [first, last] of [
      [frameIndices[0]!, frameIndices[1]!],
      [frameIndices[1]!, frameIndices[2]!],
    ] as const) {
      const previewFirst = previewFrames.get(first)!;
      const previewLast = previewFrames.get(last)!;
      if (saved) {
        const baselineFirst = gunzipSync(
          Buffer.from(saved.samples[`${golden.id}:${first}`]!, "base64"),
        );
        const baselineLast = gunzipSync(
          Buffer.from(saved.samples[`${golden.id}:${last}`]!, "base64"),
        );
        const motion = compareFrameMotion(
          baselineFirst,
          baselineLast,
          previewFirst,
          previewLast,
        );
        if (motion.warning)
          throw new Error(
            `${motion.warning.code} golden baseline ${golden.id} frames ${first}-${last}: ${JSON.stringify(motion)}`,
          );
      }
      for (const [transport] of transports) {
        const motion = compareFrameMotion(
          previewFirst,
          previewLast,
          exportFrames.get(`${transport}:${first}`)!,
          exportFrames.get(`${transport}:${last}`)!,
        );
        if (motion.warning)
          throw new Error(
            `${motion.warning.code} ${golden.id} ${transport} frames ${first}-${last}: ${JSON.stringify(motion)}`,
          );
      }
    }
  }
  assert.deepEqual(pageErrors, []);
  if (writeBaseline) {
    const baseline: Baseline = {
      version: "golden-parity-0.7.0",
      format: "rgb24-64x36-gzip-base64",
      rendererVersion,
      shaderVersion: SHADER_VERSION,
      browserVersion,
      gpuRenderer,
      ffmpegVersion,
      samples,
    };
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  } else {
    assert.equal(saved!.rendererVersion, rendererVersion);
    assert.deepEqual(
      Object.keys(samples).sort(),
      Object.keys(saved!.samples).sort(),
    );
  }
  process.stdout.write(
    JSON.stringify({
      sceneCount: GOLDEN_SCENES.length,
      sampleCount: Object.keys(samples).length,
      parityComparisons: scores.length,
      modes,
      maximumMaE: Math.max(...scores.map((score) => score.mae)),
      maximumEdgeError: Math.max(...scores.map((score) => score.edge)),
      maximumColorError: Math.max(...scores.map((score) => score.color)),
      browserVersion,
      gpuRenderer,
      rendererVersion,
      shaderVersion: SHADER_VERSION,
      ffmpegVersion,
      wroteBaseline: writeBaseline,
    }) + "\n",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
