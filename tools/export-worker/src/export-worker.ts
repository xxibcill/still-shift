import { spawn, execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { link, mkdir, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { availableParallelism, cpus } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { chromium, type Browser } from "playwright";
import { createServer, type Plugin, type ViteDevServer } from "vite";

import type { PreviewScene } from "../../../packages/renderer-core/src/scene.ts";
import type { IllustratedScene } from "../../../packages/renderer-core/src/prepared-scene.ts";
import { assertNever, type FrameTransport } from "./transport.ts";

export type ExportableScene = PreviewScene | IllustratedScene;

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "../../..");
const EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.6.0";

export type ExportRequest = {
  scene: ExportableScene;
  sourcePath: string;
  depthPath: string | null;
  assetPaths?: Record<string, string>;
  outputPath: string;
  sceneManifestContents?: string;
  encoder?: "libx264" | "h264_videotoolbox";
  transport?: FrameTransport;
};

export type ExportMetrics = {
  version: typeof EXPORT_WORKER_VERSION;
  sceneManifestPath: string;
  sceneChecksum: string;
  sourceChecksum: string;
  depthChecksum: string | null;
  frameCount: number;
  width: number;
  height: number;
  durationMs: number;
  frameRenderAverageMs: number;
  frameRenderP95Ms: number;
  frameUploadAverageMs: number;
  frameUploadP95Ms: number;
  ffmpegCpuMs: number;
  encodePathWallMs: number;
  validationWallMs: number;
  totalWallMs: number;
  outputBytes: number;
  outputChecksum: string;
  peakParentRssBytes: number;
  peakSampledProcessTreeRssBytes: number | null;
  cpuModel: string;
  cpuLogicalCores: number;
  browserVersion: string;
  browserExecutable: string;
  gpuRenderer: string;
  ffmpegVersion: string;
  ffmpegCodec: string;
  frameTransport: FrameTransport;
};

export type ExportSceneManifest = {
  schemaVersion: "0.6";
  sourceChecksum: string;
  depthChecksum: string | null;
  scene: ExportableScene;
};

const codecArguments = (encoder: "libx264" | "h264_videotoolbox") => [
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
  "-bsf:v",
  "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
  "-movflags",
  "+faststart",
];

const frameTransportArguments = (
  scene: ExportableScene,
  transport: FrameTransport,
): { input: string[]; filter: string[] } => {
  switch (transport) {
    case "raw_rgba":
      return {
        input: [
          "-f",
          "rawvideo",
          "-pixel_format",
          "rgba",
          "-video_size",
          `${scene.canvas.width}x${scene.canvas.height}`,
        ],
        filter: ["-vf", "vflip"],
      };
    case "png_pipe":
      return {
        input: ["-f", "image2pipe", "-vcodec", "png"],
        filter: [],
      };
    case "jpeg_pipe":
      return {
        input: ["-f", "image2pipe", "-vcodec", "mjpeg"],
        filter: ["-vf", "scale=in_range=pc:out_range=tv,format=yuv420p"],
      };
    default:
      return assertNever(transport);
  }
};

const ffmpegArguments = (
  scene: ExportableScene,
  temporaryPath: string,
  encoder: "libx264" | "h264_videotoolbox",
  transport: FrameTransport,
) => {
  const transportArguments = frameTransportArguments(scene, transport);
  return [
    "-hide_banner",
    "-loglevel",
    "info",
    "-nostats",
    "-benchmark",
    ...transportArguments.input,
    "-framerate",
    String(scene.timeline.fps),
    "-i",
    "pipe:0",
    ...transportArguments.filter,
    "-an",
    ...codecArguments(encoder),
    "-y",
    temporaryPath,
  ];
};

const ffmpegCpuTimeMs = (output: string): number => {
  const benchmark = output.match(
    /bench:\s+utime=([\d.]+)s stime=([\d.]+)s rtime=[\d.]+s/,
  );
  if (!benchmark) throw new Error("FFmpeg did not report CPU time");
  return (Number(benchmark[1]) + Number(benchmark[2])) * 1000;
};

const fileChecksum = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
};

const contentChecksum = (content: string): string =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

export const processTreeRssBytes = (
  processList: string,
  rootPid: number,
  rootRssBytes: number,
): number => {
  const children = new Map<number, { pid: number; rssBytes: number }[]>();
  for (const line of processList.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || basename(match[4]!) === "ps") continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    const rssBytes = Number(match[3]) * 1024;
    const siblings = children.get(parentPid) ?? [];
    siblings.push({ pid, rssBytes });
    children.set(parentPid, siblings);
  }
  let total = rootRssBytes;
  const visited = new Set([rootPid]);
  const pending = [rootPid];
  while (pending.length > 0) {
    for (const child of children.get(pending.pop()!) ?? []) {
      if (visited.has(child.pid)) continue;
      visited.add(child.pid);
      total += child.rssBytes;
      pending.push(child.pid);
    }
  }
  return total;
};

const sampleProcessTreeRssBytes = async (
  rootRssBytes: number,
): Promise<number> => {
  const { stdout } = await execFileAsync(
    "ps",
    ["-A", "-o", "pid=,ppid=,rss=,comm="],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return processTreeRssBytes(stdout, process.pid, rootRssBytes);
};

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
      if (pathname.startsWith("/_export/assets/")) {
        const id = pathname.slice("/_export/assets/".length);
        const assetPath = Object.hasOwn(request.assetPaths ?? {}, id)
          ? request.assetPaths?.[id]
          : undefined;
        if (!assetPath) {
          response.statusCode = 404;
          response.end("Unknown scene asset");
          return;
        }
        void sendAsset(assetPath, response).catch((error: unknown) => {
          response.statusCode = 500;
          response.end(String(error));
        });
        return;
      }
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
  scene: ExportableScene,
): Promise<void> => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_frames,pix_fmt,duration,color_range,color_space,color_transfer,color_primaries",
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
      color_range?: string;
      color_space?: string;
      color_transfer?: string;
      color_primaries?: string;
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
    stream.color_range !== "tv" ||
    stream.color_space !== "bt709" ||
    stream.color_transfer !== "bt709" ||
    stream.color_primaries !== "bt709" ||
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
  if ("motion" in scene && scene.motion.mode === "depth" && !request.depthPath)
    throw new Error("Depth motion requires a depth image");
  const outputPath = resolve(request.outputPath);
  const sceneManifestPath = `${outputPath}.scene.json`;
  const exportId = randomUUID();
  const temporaryPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${exportId}.tmp.mp4`,
  );
  const temporaryScenePath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${exportId}.scene.tmp.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  for (const [path, label] of [
    [outputPath, "Output"],
    [sceneManifestPath, "Scene manifest"],
  ] as const) {
    try {
      await stat(path);
      throw new Error(`${label} already exists`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
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
  let encodePathStart = 0;
  let peakParentRssBytes = process.memoryUsage().rss;
  let peakSampledProcessTreeRssBytes: number | null = null;
  let memorySample: Promise<void> | null = null;
  let published = false;
  let scenePublished = false;
  const sampleMemory = (): Promise<void> => {
    if (memorySample) return memorySample;
    memorySample = (async () => {
      const parentRssBytes = process.memoryUsage().rss;
      peakParentRssBytes = Math.max(peakParentRssBytes, parentRssBytes);
      try {
        const treeRssBytes = await sampleProcessTreeRssBytes(parentRssBytes);
        peakSampledProcessTreeRssBytes = Math.max(
          peakSampledProcessTreeRssBytes ?? 0,
          treeRssBytes,
        );
      } catch {
        // Export remains usable when OS process accounting is unavailable.
      }
    })().finally(() => {
      memorySample = null;
    });
    return memorySample;
  };
  const memoryMonitor = setInterval(() => void sampleMemory(), 500);
  void sampleMemory();
  try {
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: "silent",
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
    encodePathStart = performance.now();
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
    await sampleMemory();
    const validationStart = performance.now();
    await verifyOutput(temporaryPath, scene);
    const validationWallMs = performance.now() - validationStart;
    const outputBytes = (await stat(temporaryPath)).size;
    const outputChecksum = await fileChecksum(temporaryPath);
    const sourceChecksum = await fileChecksum(request.sourcePath);
    const depthChecksum = request.depthPath
      ? await fileChecksum(request.depthPath)
      : null;
    const sceneManifest: ExportSceneManifest = {
      schemaVersion: "0.6",
      sourceChecksum,
      depthChecksum,
      scene,
    };
    const serializedScene =
      request.sceneManifestContents ??
      `${JSON.stringify(sceneManifest, null, 2)}\n`;
    const sceneChecksum = contentChecksum(serializedScene);
    await writeFile(temporaryScenePath, serializedScene, { flag: "wx" });
    const metrics: ExportMetrics = {
      version: EXPORT_WORKER_VERSION,
      sceneManifestPath,
      sceneChecksum,
      sourceChecksum,
      depthChecksum,
      frameCount: scene.timeline.frameCount,
      width: scene.canvas.width,
      height: scene.canvas.height,
      durationMs: scene.timeline.durationMs,
      frameRenderAverageMs: browserResult.frameRenderAverageMs,
      frameRenderP95Ms: browserResult.frameRenderP95Ms,
      frameUploadAverageMs: browserResult.frameUploadAverageMs,
      frameUploadP95Ms: browserResult.frameUploadP95Ms,
      ffmpegCpuMs: ffmpegCpuTimeMs(encoderError),
      encodePathWallMs: performance.now() - encodePathStart,
      validationWallMs,
      totalWallMs: performance.now() - start,
      outputBytes,
      outputChecksum,
      peakParentRssBytes,
      peakSampledProcessTreeRssBytes,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuLogicalCores: availableParallelism(),
      browserVersion: browser.version(),
      browserExecutable: chromium.executablePath(),
      gpuRenderer: browserResult.gpuRenderer,
      ffmpegVersion,
      ffmpegCodec: codecArguments(encoderName).join(" "),
      frameTransport: transport,
    };
    clearInterval(memoryMonitor);
    await memorySample;
    await browser.close();
    browser = undefined;
    await server.close();
    server = undefined;
    await link(temporaryScenePath, sceneManifestPath);
    scenePublished = true;
    await link(temporaryPath, outputPath);
    published = true;
    return metrics;
  } catch (error) {
    encoder.kill("SIGKILL");
    throw error;
  } finally {
    clearInterval(memoryMonitor);
    const cleanup = await Promise.allSettled([
      published ? null : memorySample,
      published ? null : browser?.close(),
      published ? null : server?.close(),
      rm(temporaryPath, { force: true }),
      rm(temporaryScenePath, { force: true }),
      scenePublished && !published
        ? rm(sceneManifestPath, { force: true })
        : null,
    ]);
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (cleanupErrors.length > 0) {
      for (const error of cleanupErrors) {
        process.stderr.write(`Export cleanup failed: ${String(error)}\n`);
      }
    }
  }
};
