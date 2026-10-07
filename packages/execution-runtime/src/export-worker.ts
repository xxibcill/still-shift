import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Writable } from "node:stream";

import { chromium, type Browser } from "playwright";
import { createServer, type Plugin, type ViteDevServer } from "vite";

import type {
  CompositionScene,
  PreviewScene,
  IllustratedScene,
  PassageDiagnostic,
} from "@still-shift/renderer-core";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { COMPOSITION_EVALUATOR_VERSION } from "../../renderer-core/src/composition/evaluate/version.ts";
import {
  AnimationEngineError,
  CompositionPreparedAudioSchema,
  compositionMediaMappingDocument,
} from "@still-shift/scene-contract";
import {
  compositionPcmWavHeader,
  verifyCompositionAudioPcm,
} from "./composition-pcm.ts";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "./browser.ts";
import { assertNever, type FrameTransport } from "./transport.ts";
import { publishArtifacts } from "./artifact-publication.ts";
import { runProcess } from "./subprocess.ts";
import {
  compositionOutputProfile,
  compositionOutputArguments,
  compositionOutputCodecArguments,
  validateCompositionOutput,
  type CompositionOutputFormat,
} from "./composition-output.ts";
import { compositionOutputInput } from "./composition-output-input.ts";
import { prepareCompositionOutputArtifacts } from "./composition-output-artifacts.ts";
import { verifyCompositionOutputAudio } from "./composition-output-audio.ts";
export type { CompositionOutputFormat } from "./composition-output.ts";
export {
  COMPOSITION_OUTPUT_FORMATS,
  COMPOSITION_OUTPUT_VERSION,
} from "./composition-output.ts";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  type RenderBrowserProfile,
  type RenderEnvironment,
} from "./render-browser.ts";

export type ExportableScene =
  | PreviewScene
  | IllustratedScene
  | CompositionScene;

const EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.6.7";
const COMPOSITION_EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.7.0";

export type ExportAudioInput = {
  path: string;
  sha256: string;
  byteLength: number;
  sampleCount: number;
};

export type ExportRequest = {
  runtime?: BrowserRuntimeOptions;
  scene: ExportableScene;
  signal?: AbortSignal | undefined;
  sourcePath: string;
  depthPath: string | null;
  assetPaths?: Record<string, string>;
  /** Verified complete 48 kHz stereo Float32 WAV, muxed before artifact publication. */
  audioInput?: ExportAudioInput;
  outputPath: string;
  sceneManifestContents?: string;
  resultManifestContents?: (metrics: ExportMetrics) => string | Promise<string>;
  validateResult?: (metrics: ExportMetrics) => void | Promise<void>;
  /** Recheck pinned source assets immediately before publication. */
  validateSources?: () => Promise<void>;
  encoder?: "libx264" | "h264_videotoolbox";
  transport?: FrameTransport;
  /** Opt into a BT.709 composition delivery profile; omission retains legacy MP4. */
  format?: CompositionOutputFormat;
  expectedSourceChecksum?: string;
  /**
   * Verification hook only. Export always requires the pinned profile; any other
   * value makes it fail with `export-renderer-mismatch` before rendering.
   */
  browserProfile?: RenderBrowserProfile;
};

export type ExportMetrics = {
  version:
    | typeof EXPORT_WORKER_VERSION
    | typeof COMPOSITION_EXPORT_WORKER_VERSION;
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
  renderEnvironment: RenderEnvironment;
  ffmpegVersion: string;
  ffmpegCodec: string;
  frameTransport: FrameTransport;
  audio?: {
    sourceChecksum: string;
    sampleCount: number;
    sampleRate: 48000;
    channels: 2;
    codec: "aac" | "pcm_f32le" | "opus";
    decodedSampleCount?: number;
    decodedChecksum?: string;
  };
  output?: {
    version: "composition-output-1";
    format: CompositionOutputFormat;
    alpha: boolean;
    renderSourceBitDepth: 8;
    encoderInputBitDepth: 8 | 10 | 16;
    encodedBitDepth: 8 | 10 | 12 | 16;
    color: {
      primaries: "bt709";
      transfer: "bt709";
      matrix: "bt709" | "gbr";
      range: "pc" | "tv";
    };
    sequence?: {
      pattern: string;
      manifestPath: string;
      firstFrame: 0;
      frames: string[];
      audioPath?: string;
      audioChecksum?: string;
    };
  };
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

/** Encoder command line; exported so verification can re-encode reference frames. */
export const ffmpegArguments = (
  scene: ExportableScene,
  temporaryPath: string,
  encoder: "libx264" | "h264_videotoolbox",
  transport: FrameTransport,
  audioInput?: ExportAudioInput,
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
    ...(audioInput
      ? ["-i", audioInput.path, "-map", "0:v:0", "-map", "1:a:0"]
      : []),
    ...transportArguments.filter,
    ...(audioInput
      ? [
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movie_timescale",
          "48000",
          "-use_editlist",
          "1",
        ]
      : ["-an"]),
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

const fileChecksum = async (
  path: string,
  signal?: AbortSignal,
): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal }))
    hash.update(chunk);
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
  const { stdout } = await runProcess(
    "ps",
    ["-A", "-o", "pid=,ppid=,rss=,comm="],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return processTreeRssBytes(stdout, process.pid, rootRssBytes);
};

const readBodyToEncoder = async (
  request: IncomingMessage,
  stdin: Writable,
  expectedBytes: number | null,
  maxFrameBytes: number,
): Promise<void> => {
  const contentLength = Number(request.headers["content-length"]);
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > maxFrameBytes ||
    (expectedBytes !== null && contentLength !== expectedBytes)
  )
    throw new Error("Frame byte count differs from the transport contract");
  let bytes = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > contentLength)
      throw new Error("Frame upload exceeded the expected byte count");
    for (let offset = 0; offset < chunk.length; offset += 65536)
      await new Promise<void>((accept, reject) => {
        stdin.write(chunk.subarray(offset, offset + 65536), (error) =>
          error ? reject(error) : accept(),
        );
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
    extname(path).toLowerCase() === ".otf"
      ? "font/otf"
      : extname(path).toLowerCase() === ".ttf"
        ? "font/ttf"
        : extname(path).toLowerCase() === ".svg"
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
  encoderInput: Writable,
  expectedBytes: number | null,
  maxFrameBytes: number,
  frameState: { nextIndex: number; pending: boolean; error: Error | null },
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
      const indexHeader = incoming.headers["x-frame-index"];
      const index =
        typeof indexHeader === "string" && /^(0|[1-9]\d*)$/.test(indexHeader)
          ? Number(indexHeader)
          : NaN;
      if (
        frameState.error ||
        frameState.pending ||
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= request.scene.timeline.frameCount ||
        index !== frameState.nextIndex
      ) {
        response.statusCode = 409;
        response.end("Frame order mismatch");
        return;
      }
      frameState.pending = true;
      void readBodyToEncoder(
        incoming,
        encoderInput,
        expectedBytes,
        maxFrameBytes,
      )
        .then(() => {
          frameState.nextIndex += 1;
          frameState.pending = false;
          response.statusCode = 204;
          response.end();
        })
        .catch((error: unknown) => {
          frameState.error ??=
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
  signal?: AbortSignal,
): Promise<void> => {
  const { stdout } = await runProcess(
    "ffprobe",
    [
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
    ],
    { signal },
  );
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
  await runProcess("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
    signal,
  });
};

export const exportScene = async (
  request: ExportRequest,
): Promise<ExportMetrics> => {
  request.signal?.throwIfAborted();
  const projectRoot = request.runtime?.projectRoot ?? defaultBrowserProjectRoot;
  const start = performance.now();
  const { scene } = request;
  const profile =
    request.format === undefined
      ? undefined
      : compositionOutputProfile(request.format);
  const transport = request.transport ?? "png_pipe";
  if (profile) {
    if (!("composition" in scene))
      throw Error("Output formats require a composition scene");
    if (request.encoder && request.encoder !== "libx264")
      throw Error(
        "Composition output profiles require their pinned software encoder",
      );
    validateCompositionOutput(
      profile,
      scene.canvas.width,
      scene.canvas.height,
      transport,
    );
  }
  const capturedSourceChecksum = profile
    ? await fileChecksum(request.sourcePath, request.signal)
    : undefined;
  if (
    profile &&
    request.expectedSourceChecksum &&
    capturedSourceChecksum !== request.expectedSourceChecksum
  )
    throw Error("Composition source changed before output preparation");
  const audioInput = request.audioInput;
  const nativeAudio =
    "composition" in scene &&
    scene.composition.assets.some((asset) => asset.type === "audio");
  const expectedSamples =
    (scene.timeline.frameCount * 48000) / scene.timeline.fps;
  if (nativeAudio && (!audioInput || !scene.preparedAudio))
    passageError(
      "comp-media-provenance",
      "Native audio export requires the captured complete PCM master",
      { path: "preparedAudio" },
    );
  if (audioInput) {
    if (
      !Number.isSafeInteger(expectedSamples) ||
      expectedSamples < 1 ||
      expectedSamples > 172800000 ||
      audioInput.sampleCount !== expectedSamples ||
      audioInput.byteLength !== expectedSamples * 8 + 58 ||
      !/^sha256:[a-f0-9]{64}$/.test(audioInput.sha256)
    )
      passageError(
        "comp-media-provenance",
        "Export audio must fit the complete 48 kHz stereo output clock",
        { path: "audioInput" },
      );
    if ("composition" in scene && scene.preparedAudio) {
      const capture = CompositionPreparedAudioSchema.safeParse(
        scene.preparedAudio,
      );
      if (
        !capture.success ||
        capture.data.evaluatorVersion !== COMPOSITION_EVALUATOR_VERSION ||
        capture.data.mappingHash !==
          contentChecksum(compositionMediaMappingDocument(scene.composition)) ||
        capture.data.sampleCount !== expectedSamples ||
        capture.data.resource.sha256 !== audioInput.sha256 ||
        capture.data.resource.byteLength !== audioInput.byteLength
      )
        passageError(
          "comp-media-provenance",
          "Export audio differs from its captured PCM identity",
          { path: "preparedAudio" },
        );
    }
    await verifyCompositionAudioPcm(
      audioInput.path,
      {
        ...audioInput,
        header: compositionPcmWavHeader(audioInput.sampleCount),
      },
      request.signal,
    );
  }
  const frameAuthoritative =
    "schemaVersion" in scene &&
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1" ||
      scene.schemaVersion === "composition-scene-1");
  if (
    frameAuthoritative
      ? !Number.isInteger(scene.timeline.frameCount) ||
        scene.timeline.frameCount !==
          ("composition" in scene
            ? scene.composition.frameCount
            : scene.frameCount) ||
        scene.timeline.durationMs !==
          (scene.timeline.frameCount * 1000) / scene.timeline.fps
      : scene.timeline.frameCount !==
        (scene.timeline.durationMs * scene.timeline.fps) / 1000
  )
    throw new Error("Scene frame count and duration disagree");
  if ("motion" in scene && scene.motion.mode === "depth" && !request.depthPath)
    throw new Error("Depth motion requires a depth image");
  const outputPath = resolve(request.outputPath);
  const sceneManifestPath = `${outputPath}.scene.json`;
  const resultPath = `${outputPath}.result.json`;
  const exportId = randomUUID();
  let temporaryPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${exportId}.tmp.mp4`,
  );
  const temporaryScenePath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${exportId}.scene.tmp.json`,
  );
  const temporaryResultPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${exportId}.result.tmp.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  for (const [path, label] of [
    [outputPath, "Output"],
    [sceneManifestPath, "Scene manifest"],
    ...(request.resultManifestContents
      ? [[resultPath, "Result manifest"]]
      : []),
  ] as const) {
    try {
      await stat(path);
      throw new Error(`${label} already exists`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const ffmpegVersion = (
    await runProcess("ffmpeg", ["-version"], { signal: request.signal })
  ).stdout.split("\n")[0]!;
  const outputArtifacts = profile
    ? await prepareCompositionOutputArtifacts(
        profile,
        outputPath,
        { ...scene.canvas, ...scene.timeline },
        audioInput,
        request.signal,
      )
    : undefined;
  if (outputArtifacts) temporaryPath = outputArtifacts.temporaryPath;
  const encoderName = request.encoder ?? "libx264";
  const encoder = spawn(
    "ffmpeg",
    profile
      ? compositionOutputArguments(profile, {
          ...scene.canvas,
          ...scene.timeline,
          outputPath: temporaryPath,
          ...(audioInput && profile.container !== "image2"
            ? { audioPath: audioInput.path }
            : {}),
        })
      : ffmpegArguments(
          scene,
          temporaryPath,
          encoderName,
          transport,
          audioInput,
        ),
    {
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  // Write callbacks report pipe failures; consume the corresponding stream event
  // so cleanup preserves the original browser/encoder error instead of crashing.
  encoder.stdin?.on("error", () => undefined);
  let encoderError = "";
  encoder.stderr?.on("data", (chunk: Buffer) => {
    encoderError = (encoderError + chunk.toString()).slice(-65536);
  });
  const encoderClosed = new Promise<void>((accept, reject) => {
    encoder.on("error", reject);
    encoder.on("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`FFmpeg failed (${code}): ${encoderError.trim()}`)),
    );
  });
  const encoderReaped = new Promise<void>((accept) =>
    encoder.once("close", () => accept()),
  );
  encoderClosed.catch(() => undefined);
  const frameState = {
    nextIndex: 0,
    pending: false,
    error: null as Error | null,
  };
  const outputInput = profile
    ? compositionOutputInput(
        profile,
        transport,
        scene.canvas.width * scene.canvas.height * 4,
        scene.timeline.frameCount,
        encoder.stdin!,
        request.signal,
      )
    : undefined;
  const expectedBytes =
    transport === "raw_rgba"
      ? scene.canvas.width * scene.canvas.height * 4
      : null;
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let viteCacheDirectory: string | undefined;
  const abort = () => {
    encoder.kill("SIGKILL");
    void outputInput?.dispose().catch(() => undefined);
    void browser?.close().catch(() => undefined);
  };
  request.signal?.addEventListener("abort", abort, { once: true });
  let encodePathStart = 0;
  let peakParentRssBytes = process.memoryUsage().rss;
  let peakSampledProcessTreeRssBytes: number | null = null;
  let memorySample: Promise<void> | null = null;
  let published = false;
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
    viteCacheDirectory = await mkdtemp(
      join(tmpdir(), "still-shift-export-vite-"),
    );
    server = await createServer({
      root: projectRoot,
      configFile: false,
      cacheDir: viteCacheDirectory,
      logLevel: "silent",
      plugins: [
        assetPlugin(
          request,
          outputInput?.input ?? encoder.stdin!,
          expectedBytes,
          profile
            ? scene.canvas.width * scene.canvas.height * 4 +
                scene.canvas.height +
                1048576
            : 50_000_000,
          frameState,
        ),
      ],
      server: {
        host: "127.0.0.1",
        port: 0,
        fs: { allow: [projectRoot, defaultBrowserProjectRoot] },
      },
    });
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error("Export browser server has no local URL");
    request.signal?.throwIfAborted();
    const browserProfile = request.browserProfile ?? "pinned";
    browser = await launchRenderBrowser({ profile: browserProfile });
    request.signal?.throwIfAborted();
    const page = await browser.newPage({
      viewport: { width: scene.canvas.width, height: scene.canvas.height },
    });
    const startupErrors: string[] = [];
    page.on("pageerror", (error) => startupErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        startupErrors.push(message.text().slice(0, 1024));
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        startupErrors.push(
          `${response.status()} ${response.url().slice(0, 256)}`,
        );
    });
    page.on("requestfailed", (failed) =>
      startupErrors.push(
        `${failed.url().slice(0, 256)}: ${failed.failure()?.errorText ?? "request failed"}`,
      ),
    );
    await page.goto(runtimeBrowserUrl(baseUrl, "export"));
    try {
      await page.waitForFunction(() => Boolean(window.runStillShiftExport));
    } catch (cause) {
      throw new Error(
        `Export browser did not initialize${startupErrors.length ? `: ${startupErrors.join("; ")}` : ": no browser error reported"}`,
        { cause },
      );
    }
    const renderEnvironment = await probeRenderEnvironment(
      page,
      browserProfile,
    );
    assertPinnedRenderEnvironment(renderEnvironment);
    encodePathStart = performance.now();
    const outcome = await page.evaluate(
      async ({ scene, hasDepth, transport, output }) => {
        try {
          return {
            ok: true as const,
            value: await window.runStillShiftExport!(
              scene,
              hasDepth,
              transport,
              output,
            ),
          };
        } catch (error) {
          // Playwright otherwise discards custom Error fields at the browser boundary.
          const diagnostics = (error as { diagnostics?: PassageDiagnostic[] })
            .diagnostics;
          if (!diagnostics?.length) throw error;
          return { ok: false as const, diagnostics };
        }
      },
      // The deep composition type exceeds Playwright's serialisable-type check.
      {
        scene: scene as PreviewScene,
        hasDepth: request.depthPath !== null,
        transport,
        output: profile
          ? { preserveAlpha: profile.alpha, canonicalCapture: true as const }
          : undefined,
      },
    );
    if (!outcome.ok) {
      const diagnostic = outcome.diagnostics[0]!;
      throw new AnimationEngineError(
        "RENDER_FAILED",
        `${diagnostic.code}: ${diagnostic.message}`,
        {
          diagnostic: diagnostic.code,
          ...(diagnostic.node ? { node: diagnostic.node } : {}),
          ...(diagnostic.path ? { path: diagnostic.path } : {}),
          ...(diagnostic.frame === undefined
            ? {}
            : { frame: diagnostic.frame }),
          diagnostics: JSON.stringify(outcome.diagnostics),
        },
      );
    }
    const browserResult = outcome.value;
    if (frameState.error) throw frameState.error;
    if (frameState.nextIndex !== scene.timeline.frameCount)
      throw new Error("Not all frames reached the encoder");
    if (outputInput) await outputInput.finish();
    else encoder.stdin?.end();
    await encoderClosed;
    await sampleMemory();
    const validationStart = performance.now();
    if (outputArtifacts) await outputArtifacts.verify();
    else await verifyOutput(temporaryPath, scene, request.signal);
    const profileAudio =
      audioInput && profile && profile.container !== "image2"
        ? await verifyCompositionOutputAudio(
            temporaryPath,
            audioInput,
            profile,
            request.signal,
          )
        : undefined;
    if (audioInput && !profile) {
      const probe = await runProcess(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "a",
          "-show_entries",
          "stream=codec_name,sample_rate,channels,duration_ts,time_base",
          "-of",
          "json",
          temporaryPath,
        ],
        { signal: request.signal, maxBuffer: 65536 },
      );
      const streams = (
        JSON.parse(probe.stdout) as {
          streams?: {
            codec_name?: string;
            sample_rate?: string;
            channels?: number;
            duration_ts?: number;
            time_base?: string;
          }[];
        }
      ).streams;
      const audio = streams?.[0];
      if (
        streams?.length !== 1 ||
        audio?.codec_name !== "aac" ||
        audio.sample_rate !== "48000" ||
        audio.channels !== 2 ||
        audio.time_base !== "1/48000" ||
        audio.duration_ts !== audioInput.sampleCount
      )
        throw new Error(
          "FFprobe validation failed for muxed native audio clock",
        );
    }
    if (audioInput) {
      await verifyCompositionAudioPcm(
        audioInput.path,
        {
          ...audioInput,
          header: compositionPcmWavHeader(audioInput.sampleCount),
        },
        request.signal,
      );
    }
    const validationWallMs = performance.now() - validationStart;
    const summary = outputArtifacts
      ? await outputArtifacts.summarize()
      : {
          outputBytes: (await stat(temporaryPath)).size,
          outputChecksum: await fileChecksum(temporaryPath, request.signal),
        };
    const { outputBytes, outputChecksum } = summary;
    const sourceChecksum = await fileChecksum(
      request.sourcePath,
      request.signal,
    );
    if (profile && sourceChecksum !== capturedSourceChecksum)
      throw Error("Composition source changed during output rendering");
    const depthChecksum = request.depthPath
      ? await fileChecksum(request.depthPath, request.signal)
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
      version: profile
        ? COMPOSITION_EXPORT_WORKER_VERSION
        : EXPORT_WORKER_VERSION,
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
      renderEnvironment,
      ffmpegVersion,
      ffmpegCodec: (profile
        ? compositionOutputCodecArguments(profile)
        : codecArguments(encoderName)
      ).join(" "),
      frameTransport: transport,
      ...(audioInput
        ? {
            audio: {
              sourceChecksum: audioInput.sha256,
              sampleCount: audioInput.sampleCount,
              sampleRate: 48000 as const,
              channels: 2 as const,
              codec:
                profile?.audioCodec === "libopus"
                  ? ("opus" as const)
                  : (profile?.audioCodec ?? ("aac" as const)),
              ...(profileAudio && "decodedSampleCount" in profileAudio
                ? {
                    decodedSampleCount: profileAudio.decodedSampleCount,
                    decodedChecksum: profileAudio.decodedChecksum,
                  }
                : {}),
            },
          }
        : {}),
      ...(profile
        ? {
            output: {
              version: profile.version,
              format: profile.format,
              alpha: profile.alpha,
              renderSourceBitDepth: 8 as const,
              encoderInputBitDepth: profile.bitDepth,
              encodedBitDepth: profile.encodedBitDepth,
              color: {
                primaries: "bt709" as const,
                transfer: "bt709" as const,
                matrix:
                  profile.matrix === "rgb"
                    ? ("gbr" as const)
                    : ("bt709" as const),
                range: profile.range,
              },
              ...("sequence" in summary && summary.sequence
                ? { sequence: summary.sequence }
                : {}),
            },
          }
        : {}),
    };
    await request.validateResult?.(metrics);
    if (request.resultManifestContents) {
      const contents = await request.resultManifestContents(metrics);
      await writeFile(temporaryResultPath, contents, {
        flag: "wx",
        signal: request.signal,
      });
    }
    clearInterval(memoryMonitor);
    await memorySample;
    await browser.close();
    browser = undefined;
    await server.close();
    server = undefined;
    request.signal?.throwIfAborted();
    if (profile) {
      await request.validateSources?.();
      if (
        (await fileChecksum(request.sourcePath, request.signal)) !==
        capturedSourceChecksum
      )
        throw Error("Composition source changed before output publication");
    }
    const metadata = [
      { staged: temporaryScenePath, destination: sceneManifestPath },
      ...(request.resultManifestContents
        ? [{ staged: temporaryResultPath, destination: resultPath }]
        : []),
    ];
    await publishArtifacts(
      outputArtifacts
        ? outputArtifacts.publications(metadata)
        : [...metadata, { staged: temporaryPath, destination: outputPath }],
      request.signal,
    );
    published = true;
    return metrics;
  } catch (error) {
    encoder.kill("SIGKILL");
    request.signal?.throwIfAborted();
    throw error;
  } finally {
    request.signal?.removeEventListener("abort", abort);
    clearInterval(memoryMonitor);
    // The writer must exit before removing files it might still create.
    await encoderReaped;
    const cleanup = await Promise.allSettled([
      published ? null : memorySample,
      published ? null : browser?.close(),
      outputInput?.dispose(),
      outputArtifacts?.dispose(),
      (async () => {
        try {
          await server?.close();
        } finally {
          if (viteCacheDirectory)
            await rm(viteCacheDirectory, { recursive: true, force: true });
        }
      })(),
      rm(temporaryPath, { force: true }),
      rm(temporaryScenePath, { force: true }),
      rm(temporaryResultPath, { force: true }),
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
