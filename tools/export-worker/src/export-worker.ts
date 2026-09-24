import { spawn, execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { link, mkdir, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { chromium, type Browser } from "playwright";
import { createServer, type Plugin, type ViteDevServer } from "vite";

import type { PreviewScene } from "../../../packages/renderer-core/src/scene.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "../../..");
const EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.6.0";

export type ExportRequest = {
  scene: PreviewScene;
  sourcePath: string;
  depthPath: string | null;
  outputPath: string;
  encoder?: "libx264" | "h264_videotoolbox";
  transport?: "raw_rgba" | "png_pipe" | "jpeg_pipe";
};

export type ExportMetrics = {
  version: typeof EXPORT_WORKER_VERSION;
  frameCount: number;
  width: number;
  height: number;
  durationMs: number;
  frameRenderAverageMs: number;
  frameRenderP95Ms: number;
  encodeMs: number;
  totalWallMs: number;
  outputBytes: number;
  peakCpuMemoryBytes: number;
  browserVersion: string;
  browserExecutable: string;
  gpuRenderer: string;
  ffmpegVersion: string;
  ffmpegCodec: string;
  frameTransport: "raw_rgba" | "png_pipe" | "jpeg_pipe";
};

const ffmpegArguments = (
  scene: PreviewScene,
  temporaryPath: string,
  encoder: "libx264" | "h264_videotoolbox",
  transport: "raw_rgba" | "png_pipe" | "jpeg_pipe",
) => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  transport === "raw_rgba" ? "rawvideo" : "image2pipe",
  ...(transport === "raw_rgba"
    ? [
        "-pixel_format",
        "rgba",
        "-video_size",
        `${scene.canvas.width}x${scene.canvas.height}`,
      ]
    : ["-vcodec", transport === "png_pipe" ? "png" : "mjpeg"]),
  "-framerate",
  String(scene.timeline.fps),
  "-i",
  "pipe:0",
  ...(transport === "raw_rgba"
    ? ["-vf", "vflip"]
    : transport === "jpeg_pipe"
      ? ["-vf", "scale=in_range=pc:out_range=tv,format=yuv420p"]
      : []),
  "-an",
  "-c:v",
  encoder,
  ...(encoder === "libx264"
    ? ["-preset", "veryfast", "-crf", "18"]
    : ["-b:v", "8M", "-realtime", "true"]),
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-movflags",
  "+faststart",
  "-y",
  temporaryPath,
];

const readBodyToEncoder = async (
  request: IncomingMessage,
  encoder: ReturnType<typeof spawn>,
  expectedBytes: number | null,
): Promise<void> => {
  const contentLength = Number(request.headers["content-length"]);
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > 50_000_000 ||
    (expectedBytes !== null && contentLength !== expectedBytes)
  )
    throw new Error("Frame byte count differs from the transport contract");
  let bytes = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > contentLength)
      throw new Error("Frame upload exceeded the expected byte count");
    const stdin = encoder.stdin;
    if (!stdin) throw new Error("FFmpeg input stream is unavailable");
    await new Promise<void>((accept, reject) => {
      stdin.write(chunk, (error) => (error ? reject(error) : accept()));
    });
  }
  if (bytes !== contentLength)
    throw new Error("Frame upload ended before the expected byte count");
};

const sendAsset = async (
  path: string,
  response: ServerResponse,
): Promise<void> => {
  const file = await stat(path);
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    extname(path).toLowerCase() === ".svg"
      ? "image/svg+xml"
      : extname(path).toLowerCase() === ".jpg" ||
          extname(path).toLowerCase() === ".jpeg"
        ? "image/jpeg"
        : "image/png",
  );
  response.setHeader("Content-Length", file.size);
  createReadStream(path).pipe(response);
};

const assetPlugin = (
  request: ExportRequest,
  encoder: ReturnType<typeof spawn>,
  expectedBytes: number | null,
  frameState: { nextIndex: number; error: Error | null },
): Plugin => ({
  name: "still-shift-export-assets",
  configureServer(server) {
    server.middlewares.use((incoming, response, next) => {
      const pathname = new URL(incoming.url ?? "/", "http://localhost")
        .pathname;
      if (pathname === "/_export/source") {
        void sendAsset(request.sourcePath, response).catch((error: unknown) => {
          response.statusCode = 500;
          response.end(String(error));
        });
        return;
      }
      if (pathname === "/_export/depth") {
        if (!request.depthPath) {
          response.statusCode = 404;
          response.end("No depth asset");
          return;
        }
        void sendAsset(request.depthPath, response).catch((error: unknown) => {
          response.statusCode = 500;
          response.end(String(error));
        });
        return;
      }
      if (pathname !== "/_export/frame") return next();
      if (incoming.method !== "POST") {
        response.statusCode = 405;
        response.end("POST required");
        return;
      }
      const index = Number(incoming.headers["x-frame-index"]);
      if (frameState.error || index !== frameState.nextIndex) {
        response.statusCode = 409;
        response.end("Frame order mismatch");
        return;
      }
      void readBodyToEncoder(incoming, encoder, expectedBytes)
        .then(() => {
          frameState.nextIndex += 1;
          response.statusCode = 204;
          response.end();
        })
        .catch((error: unknown) => {
          frameState.error =
            error instanceof Error ? error : new Error(String(error));
          response.statusCode = 500;
          response.end(frameState.error.message);
        });
    });
  },
});

const verifyOutput = async (
  path: string,
  scene: PreviewScene,
): Promise<void> => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_frames,pix_fmt,duration",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    path,
  ]);
  const probe = JSON.parse(stdout) as {
    streams?: {
      width?: number;
      height?: number;
      r_frame_rate?: string;
      nb_frames?: string;
      pix_fmt?: string;
      duration?: string;
    }[];
    format?: { duration?: string };
  };
  const stream = probe.streams?.[0];
  const duration = Number(stream?.duration ?? probe.format?.duration);
  if (
    stream?.width !== scene.canvas.width ||
    stream.height !== scene.canvas.height ||
    stream.r_frame_rate !== `${scene.timeline.fps}/1` ||
    Number(stream.nb_frames) !== scene.timeline.frameCount ||
    stream.pix_fmt !== "yuv420p" ||
    !Number.isFinite(duration) ||
    Math.abs(duration * 1000 - scene.timeline.durationMs) >
      1000 / scene.timeline.fps
  ) {
    throw new Error(
      `FFprobe validation failed for exported MP4: ${JSON.stringify({ stream, duration })}`,
    );
  }
  await execFileAsync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"]);
};

export const exportScene = async (
  request: ExportRequest,
): Promise<ExportMetrics> => {
  const start = performance.now();
  const { scene } = request;
  if (
    scene.timeline.frameCount !==
    (scene.timeline.durationMs * scene.timeline.fps) / 1000
  )
    throw new Error("Scene frame count and duration disagree");
  if (scene.motion.mode === "depth" && !request.depthPath)
    throw new Error("Depth motion requires a depth image");
  const outputPath = resolve(request.outputPath);
  const temporaryPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${randomUUID()}.tmp.mp4`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await stat(outputPath);
    throw new Error("Output already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const ffmpegVersion = (
    await execFileAsync("ffmpeg", ["-version"])
  ).stdout.split("\n")[0]!;
  const encoderName = request.encoder ?? "libx264";
  const transport = request.transport ?? "png_pipe";
  const encoder = spawn(
    "ffmpeg",
    ffmpegArguments(scene, temporaryPath, encoderName, transport),
    {
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  let encoderError = "";
  encoder.stderr?.on("data", (chunk: Buffer) => {
    encoderError += chunk.toString();
  });
  const encoderClosed = new Promise<void>((accept, reject) => {
    encoder.on("error", reject);
    encoder.on("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`FFmpeg failed (${code}): ${encoderError.trim()}`)),
    );
  });
  encoderClosed.catch(() => undefined);
  const frameState = { nextIndex: 0, error: null as Error | null };
  const expectedBytes =
    transport === "raw_rgba"
      ? scene.canvas.width * scene.canvas.height * 4
      : null;
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let encodeStart = 0;
  let peakCpuMemoryBytes = process.memoryUsage().rss;
  const memoryMonitor = setInterval(() => {
    peakCpuMemoryBytes = Math.max(
      peakCpuMemoryBytes,
      process.memoryUsage().rss,
    );
  }, 100);
  try {
    server = await createServer({
      root: projectRoot,
      configFile: false,
      plugins: [assetPlugin(request, encoder, expectedBytes, frameState)],
      server: { host: "127.0.0.1", port: 0, fs: { allow: [projectRoot] } },
    });
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error("Export browser server has no local URL");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto(new URL("tools/export-worker/index.html", baseUrl).href);
    await page.waitForFunction(() => Boolean(window.runStillShiftExport));
    encodeStart = performance.now();
    const browserResult = await page.evaluate(
      ({ scene, hasDepth, transport }) =>
        window.runStillShiftExport!(scene, hasDepth, transport),
      { scene, hasDepth: request.depthPath !== null, transport },
    );
    if (frameState.error) throw frameState.error;
    if (frameState.nextIndex !== scene.timeline.frameCount)
      throw new Error("Not all frames reached the encoder");
    encoder.stdin?.end();
    await encoderClosed;
    await verifyOutput(temporaryPath, scene);
    const outputBytes = (await stat(temporaryPath)).size;
    const metrics: ExportMetrics = {
      version: EXPORT_WORKER_VERSION,
      frameCount: scene.timeline.frameCount,
      width: scene.canvas.width,
      height: scene.canvas.height,
      durationMs: scene.timeline.durationMs,
      frameRenderAverageMs: browserResult.frameRenderAverageMs,
      frameRenderP95Ms: browserResult.frameRenderP95Ms,
      encodeMs: performance.now() - encodeStart,
      totalWallMs: performance.now() - start,
      outputBytes,
      peakCpuMemoryBytes,
      browserVersion: browser.version(),
      browserExecutable: chromium.executablePath(),
      gpuRenderer: browserResult.gpuRenderer,
      ffmpegVersion,
      ffmpegCodec:
        encoderName === "libx264"
          ? "libx264 veryfast crf18 yuv420p bt709 faststart"
          : "h264_videotoolbox 8M realtime yuv420p bt709 faststart",
      frameTransport: transport,
    };
    await link(temporaryPath, outputPath);
    return metrics;
  } catch (error) {
    encoder.kill("SIGKILL");
    throw error;
  } finally {
    clearInterval(memoryMonitor);
    await browser?.close();
    await server?.close();
    await rm(temporaryPath, { force: true });
  }
};
