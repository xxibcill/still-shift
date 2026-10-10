import { compositionPcmBoundary } from "@still-shift/scene-contract";
import { CompositionResultBudget } from "./composition-result-budget.ts";
import { compositionResultSize } from "./composition-result-size.ts";
import {
  spawnFfmpeg,
  ffmpegProcessUsage,
  type FfmpegProcessUsage,
} from "./ffmpeg-process.ts";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Writable } from "node:stream";

import { chromium, type Browser, type Page } from "playwright";
import { createServer, type Plugin, type ViteDevServer } from "vite";

import type {
  CompositionScene,
  PreviewScene,
  IllustratedScene,
} from "@still-shift/renderer-core";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { COMPOSITION_EVALUATOR_VERSION } from "../../renderer-core/src/composition/evaluate/version.ts";
import {
  CompositionPreparedAudioSchema,
  compositionMediaMappingDocument,
} from "@still-shift/scene-contract";
import {
  compositionPcmWavHeader,
  verifyCompositionAudioPcm,
} from "./composition-pcm.ts";
import {
  defaultBrowserProjectRoot,
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
import {
  COMPOSITION_APPLICATION_MEMORY_LIMIT,
  COMPOSITION_NODE_MEMORY_ALLOWANCE,
  compositionExecutionPolicy,
} from "./composition-export-memory.ts";
import { summarizeCompositionStatistics } from "./composition-export-statistics.ts";
import { CompositionSurfaceStore } from "./composition-surface-store.ts";
import { CompositionSurfaceBroker } from "./composition-surface-broker.ts";
import { CompositionOrderedFrames } from "./composition-ordered-frames.ts";
import {
  prepareExportBrowserWorker,
  runExportBrowserWorker,
  summarizeExportWorkers,
  type ExportBrowserWorker,
} from "./export-browser-worker.ts";
import type { BrowserExportResult } from "./export-page.ts";
import {
  NativeObservationSink,
  admitNativeObservationCapacity,
  admitNativeObservationManifest,
  nativeObservationOwner,
  verifyNativeObservationClosure,
  type NativeObservationClosure,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
} from "./native-observation-sink.ts";
export * from "./native-observation-sink.ts";
export type { CompositionOutputFormat } from "./composition-output.ts";
export {
  COMPOSITION_OUTPUT_FORMATS,
  COMPOSITION_OUTPUT_VERSION,
} from "./composition-output.ts";
import {
  launchRenderBrowser,
  type RenderBrowserProfile,
  type RenderEnvironment,
} from "./render-browser.ts";

export type ExportableScene =
  | PreviewScene
  | IllustratedScene
  | CompositionScene;

const EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.6.11";
const COMPOSITION_EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.7.1";
const COMPOSITION_PARALLEL_EXPORT_WORKER_VERSION = "chromium-ffmpeg-0.8.1";

export type ExportAudioInput = {
  path: string;
  sha256: string;
  byteLength: number;
  sampleCount: number;
};

export type ExportRequest = {
  nativeObservation?: {
    execution: NativeObservationExecutionBinding;
    maximumPacketBytes: number;
    expectedPasses(frame: number): readonly NativeObservationExpectedPass[];
  };
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
  /** Verification hook after a complete frame body, before advancing encoder order. */
  verifyFrame?: (frame: number, worker: number) => void | Promise<void>;
  /** Verification hook after pinned browser startup, before any export work. */
  verifyWorker?: (page: Page, worker: number) => void | Promise<void>;
  encoder?: "libx264" | "h264_videotoolbox";
  transport?: FrameTransport;
  /** Opt into a BT.709 composition delivery profile; omission retains legacy MP4. */
  format?: CompositionOutputFormat;
  /** Opt into independent pinned browsers with bounded absolute-order streaming. */
  workers?: 1 | 2 | 3 | 4;
  /** Retain existing independent surfaces globally; defaults true with explicit workers. */
  cacheStatic?: boolean;
  expectedSourceChecksum?: string;
  /**
   * Verification hook only. Export always requires the pinned profile; any other
   * value makes it fail with `export-renderer-mismatch` before rendering.
   */
  browserProfile?: RenderBrowserProfile;
};

export type ExportMetrics = {
  nativeObservations?: NativeObservationClosure;
  version:
    | typeof EXPORT_WORKER_VERSION
    | typeof COMPOSITION_EXPORT_WORKER_VERSION
    | typeof COMPOSITION_PARALLEL_EXPORT_WORKER_VERSION;
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
  ffmpegCpuScope: "ffmpeg-transcode-user-plus-system";
  ffmpegProcessUsage?: FfmpegProcessUsage & {
    timingProcessId: number;
    processGroupReaped: true;
  };
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
  compositionStatistics?: ReturnType<typeof summarizeCompositionStatistics>;
  compositionMemory?: {
    scope: "declared-worker-application-bytes";
    applicationLimitBytes: number;
    reservedNodeBudgetBytes: number;
    sumOfWorkerPeakBytes: number;
    peakConcurrentWorkerBytes: number;
    concurrentWorkers: number;
    workers: NonNullable<BrowserExportResult["memory"]>[];
    nodeResults: CompositionResultBudget["statistics"];
  };
  work?: {
    version: "composition-render-work-1";
    workers: number;
    chunkFrames: 1;
    distribution: "round-robin" | "contiguous";
    concurrentWorkers: number;
    cacheStatic: boolean;
    scopeKey: string;
    orderedFrames: CompositionOrderedFrames["statistics"];
    surfaceStore?: CompositionSurfaceStore["statistics"];
    submissionStatistics: {
      scope: "synchronous-submission-wall-time";
      totalSubmissionWallMs: number;
      byLayerType: {
        phase: string;
        type: string;
        calls: number;
        submissionWallMs: number;
        submissionWallMsPerOutputFrame: number;
      }[];
    };
    workersDetail: {
      worker: number;
      environment: RenderEnvironment;
      rendererProcessIds: number[];
      gpuProcessIds: number[];
      result: NonNullable<BrowserExportResult["work"]>;
    }[];
  };
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
  observe = false,
): Promise<
  { byteLength: number; transportBytesSha256: string } | undefined
> => {
  const identity = observe ? createHash("sha256") : undefined;
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
    identity?.update(chunk);
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
  return identity
    ? {
        byteLength: bytes,
        transportBytesSha256: `sha256:${identity.digest("hex")}`,
      }
    : undefined;
};

const sendAsset = async (
  path: string,
  response: ServerResponse,
): Promise<void> => {
  const file = await stat(path);
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    extname(path).toLowerCase() === ".json"
      ? "application/json"
      : extname(path).toLowerCase() === ".otf"
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
  work?: {
    frames: CompositionOrderedFrames;
    credentials: string[];
    cacheBroker(): CompositionSurfaceBroker | undefined;
  },
  native?: {
    sink: NativeObservationSink;
    exportId: string;
    credential: string;
    fail(reason: unknown): void;
    reserve(bytes: number): { release(): void };
    track(request: IncomingMessage, operation: Promise<unknown>): void;
  },
): Plugin => ({
  name: "still-shift-export-assets",
  configureServer(server) {
    server.middlewares.use((incoming, response, next) => {
      const pathname = new URL(incoming.url ?? "/", "http://localhost")
        .pathname;
      if (
        native &&
        (pathname === "/_export/native-observation" ||
          pathname === "/_export/frame")
      ) {
        if (
          !nativeObservationOwner(
            incoming.headers,
            native.exportId,
            native.credential,
          )
        ) {
          response.statusCode = 403;
          response.end("Unknown native export worker");
          return;
        }
        const host = incoming.headers.host ?? "",
          origin = incoming.headers.origin;
        if (
          !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`)
        ) {
          native.fail(
            Error("Native export request differs from its local origin"),
          );
          response.statusCode = 403;
          response.end("Native export requires its local origin");
          return;
        }
        if (pathname === "/_export/native-observation") {
          const operation = (async () => {
            let reservation: { release(): void } | undefined;
            try {
              const length = Number(incoming.headers["content-length"]);
              const index = incoming.headers["x-frame-index"];
              if (
                incoming.method !== "POST" ||
                frameState.pending ||
                frameState.error ||
                index !== String(frameState.nextIndex) ||
                !Number.isSafeInteger(length) ||
                length < 1 ||
                length > request.nativeObservation!.maximumPacketBytes
              )
                passageError(
                  "comp-native3d-protocol",
                  "Native observation request differs from its assigned frame",
                  { path: "nativeObservations" },
                );
              frameState.pending = true;
              reservation = native.reserve(length + 256);
              const bytes = Buffer.alloc(length);
              let received = 0;
              for await (const part of incoming) {
                const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
                if (received + chunk.length > length)
                  throw Error("Observation upload exceeded its byte count");
                bytes.set(chunk, received);
                received += chunk.length;
              }
              if (received !== length)
                throw Error("Observation upload ended before its byte count");
              native.sink.acceptPacket(0, bytes);
              frameState.pending = false;
              response.statusCode = 204;
              response.end();
            } catch (error) {
              frameState.error ??=
                error instanceof Error ? error : Error(String(error));
              native.fail(error);
              if (!response.destroyed) {
                response.statusCode = 409;
                response.end(frameState.error.message);
              }
            } finally {
              reservation?.release();
            }
          })();
          native.track(incoming, operation);
          return;
        }
      }
      if (work && pathname.startsWith("/_export/surface/")) {
        const broker = work.cacheBroker();
        if (!broker) {
          response.statusCode = 409;
          response.end("Composition cache is not ready");
          return;
        }
        void broker.respond(
          pathname.slice("/_export/surface/".length),
          incoming,
          response,
        );
        return;
      }
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
        if (native) native.fail(Error("Native pixel request requires POST"));
        response.statusCode = 405;
        response.end("POST required");
        return;
      }
      const indexHeader = incoming.headers["x-frame-index"];
      const index =
        typeof indexHeader === "string" && /^(0|[1-9]\d*)$/.test(indexHeader)
          ? Number(indexHeader)
          : NaN;
      if (work) {
        const workerHeader = incoming.headers["x-export-worker"];
        const worker =
          typeof workerHeader === "string" && /^(0|[1-3])$/.test(workerHeader)
            ? Number(workerHeader)
            : -1;
        if (
          worker < 0 ||
          worker >= work.credentials.length ||
          incoming.headers["x-export-credential"] !== work.credentials[worker]
        ) {
          response.statusCode = 403;
          response.end("Unknown composition frame worker");
          return;
        }
        try {
          native?.sink.requirePacket(worker, index);
        } catch (error) {
          native?.fail(error);
          response.statusCode = 409;
          response.end(String(error));
          return;
        }
        const operation = work.frames.accept(worker, index, incoming);
        native?.track(incoming, operation);
        void operation
          .then(() => {
            response.statusCode = 204;
            response.end();
          })
          .catch((error: unknown) => {
            frameState.error ??=
              error instanceof Error ? error : Error(String(error));
            if (!response.destroyed) {
              response.statusCode = 500;
              response.end(frameState.error.message);
            }
          });
        return;
      }
      if (
        frameState.error ||
        frameState.pending ||
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= request.scene.timeline.frameCount ||
        index !== frameState.nextIndex
      ) {
        response.statusCode = 409;
        if (native) native.fail(Error("Native pixel frame order mismatch"));
        response.end("Frame order mismatch");
        return;
      }
      frameState.pending = true;
      const operation = (async () => {
        native?.sink.requirePacket(0, index);
        const pixel = await readBodyToEncoder(
          incoming,
          encoderInput,
          expectedBytes,
          maxFrameBytes,
          !!native,
        );
        await request.verifyFrame?.(index, 0);
        if (native)
          await native.sink.commitPixel(0, index, {
            transport: request.transport ?? "png_pipe",
            ...pixel!,
          });
      })();
      native?.track(incoming, operation);
      void operation
        .then(() => {
          frameState.nextIndex += 1;
          frameState.pending = false;
          response.statusCode = 204;
          response.end();
        })
        .catch((error: unknown) => {
          frameState.error ??=
            error instanceof Error ? error : new Error(String(error));
          native?.fail(error);
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
  const nativeScene =
    "composition" in scene &&
    scene.composition.assets.some((asset) => asset.type === "native3d");
  if (nativeScene && (!request.nativeObservation || scene.backend !== "webgl2"))
    passageError(
      "comp-native3d-protocol",
      "Native export requires WebGL2 and an authenticated observation binding",
      { path: "nativeObservations" },
    );
  if (request.nativeObservation) {
    if (!nativeScene || (request.workers ?? 1) !== 1)
      passageError(
        "comp-native3d-protocol",
        "Native observation delivery requires one assigned composition worker",
        { path: "nativeObservations" },
      );
    admitNativeObservationCapacity(
      scene.timeline.frameCount,
      request.nativeObservation.maximumPacketBytes,
    );
    admitNativeObservationManifest(
      request.nativeObservation.execution,
      resolve(request.outputPath),
    );
  }
  const workOptions =
    request.workers === undefined && request.cacheStatic === undefined
      ? undefined
      : {
          workers: request.workers ?? 1,
          cacheStatic: request.cacheStatic ?? true,
        };
  if (
    workOptions &&
    (!("composition" in scene) ||
      !Number.isInteger(workOptions.workers) ||
      workOptions.workers < 1 ||
      workOptions.workers > 4 ||
      workOptions.workers > scene.timeline.frameCount ||
      typeof workOptions.cacheStatic !== "boolean")
  )
    throw Error(
      "Composition workers/cache options have invalid bounds or scene type",
    );
  const executionPolicy =
    "composition" in scene
      ? compositionExecutionPolicy(
          scene.canvas.width,
          scene.canvas.height,
          workOptions?.workers ?? 1,
        )
      : undefined;
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
  const capturedSourceChecksum =
    profile || workOptions || request.nativeObservation
      ? await fileChecksum(request.sourcePath, request.signal)
      : undefined;
  if (
    (profile || workOptions || request.nativeObservation) &&
    request.expectedSourceChecksum &&
    capturedSourceChecksum !== request.expectedSourceChecksum
  )
    throw Error("Composition source changed before output preparation");
  const audioInput = request.audioInput;
  const nativeAudio =
    "composition" in scene &&
    scene.composition.assets.some((asset) => asset.type === "audio");
  const expectedSamples = compositionPcmBoundary(
    scene.timeline.frameCount,
    scene.timeline.fps,
  );
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
    ...(request.nativeObservation
      ? NativeObservationSink.destinationPaths(outputPath).map(
          (path) => [path, "Native observation artifact"] as const,
        )
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
  const encoderProcess = spawnFfmpeg(
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
    workOptions !== undefined,
  );
  const encoder = encoderProcess.child;
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
  const browsers: Browser[] = [];
  let orderedFrames: CompositionOrderedFrames | undefined;
  let surfaceStore: CompositionSurfaceStore | undefined;
  let cacheBroker: CompositionSurfaceBroker | undefined;
  let workFailure: { reason: unknown } | undefined;
  let workMetrics: ExportMetrics["work"];
  const resultBudget =
    "schemaVersion" in scene && scene.schemaVersion === "composition-scene-1"
      ? new CompositionResultBudget(scene.timeline.frameCount)
      : undefined;
  const nativeSink = request.nativeObservation
    ? new NativeObservationSink({
        outputPath,
        exportId,
        frameCount: scene.timeline.frameCount,
        ...request.nativeObservation,
        reserve: (bytes) => resultBudget!.reserveTransient(bytes),
      })
    : undefined;
  let nativeObservations: NativeObservationClosure | undefined;
  const nativeRequests = new Set<IncomingMessage>();
  const nativeTransfers = new Set<Promise<unknown>>();
  const stopNativeRequests = (reason: unknown) => {
    for (const incoming of nativeRequests)
      incoming.destroy(
        reason instanceof Error ? reason : Error(String(reason)),
      );
  };
  let viteCacheDirectory: string | undefined;
  const abort = () => {
    nativeSink?.fail(request.signal?.reason ?? Error("Native export stopped"));
    stopNativeRequests(
      request.signal?.reason ?? Error("Native export stopped"),
    );
    encoderProcess.kill();
    void outputInput?.dispose().catch(() => undefined);
    void browser?.close().catch(() => undefined);
    for (const workerBrowser of browsers)
      void workerBrowser.close().catch(() => undefined);
    orderedFrames?.fail(
      request.signal?.aborted
        ? request.signal.reason
        : Error("Composition export stopped"),
    );
    void surfaceStore
      ?.dispose(
        request.signal?.reason instanceof Error
          ? request.signal.reason
          : Error("Composition export stopped"),
      )
      .catch(() => undefined);
  };
  const failWork = (reason: unknown) => {
    if (!workFailure) workFailure = { reason };
    orderedFrames?.fail(workFailure.reason);
    nativeSink?.fail(workFailure.reason);
    stopNativeRequests(workFailure.reason);
    encoderProcess.kill();
    for (const workerBrowser of browsers)
      void workerBrowser.close().catch(() => undefined);
    void browser?.close().catch(() => undefined);
    void surfaceStore
      ?.dispose(reason instanceof Error ? reason : Error(String(reason)))
      .catch(() => undefined);
  };
  const assertWorkActive = () => {
    if (workFailure) throw workFailure.reason;
  };
  encoderClosed.catch((reason: unknown) => {
    if (workOptions || nativeSink) failWork(reason);
  });
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
    const maxFrameBytes = profile
      ? scene.canvas.width * scene.canvas.height * 4 +
        scene.canvas.height +
        1048576
      : 50_000_000;
    const credentials =
      workOptions || nativeSink
        ? Array.from({ length: workOptions?.workers ?? 1 }, () => randomUUID())
        : [];
    if (workOptions)
      orderedFrames = new CompositionOrderedFrames(
        scene.timeline.frameCount,
        workOptions.workers,
        async (source, frame, worker) => {
          nativeSink?.requirePacket(worker, frame);
          const pixel = await readBodyToEncoder(
            source as IncomingMessage,
            outputInput?.input ?? encoder.stdin!,
            expectedBytes,
            maxFrameBytes,
            !!nativeSink,
          );
          await request.verifyFrame?.(frame, worker);
          if (nativeSink) {
            await nativeSink.commitPixel(worker, frame, {
              transport,
              ...pixel!,
            });
            frameState.nextIndex = frame + 1;
          }
        },
        executionPolicy!.distribution,
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
          maxFrameBytes,
          frameState,
          orderedFrames
            ? {
                frames: orderedFrames,
                credentials,
                cacheBroker: () => cacheBroker,
              }
            : undefined,
          nativeSink
            ? {
                sink: nativeSink,
                exportId,
                credential: credentials[0]!,
                fail: failWork,
                reserve: (bytes) => resultBudget!.reserveTransient(bytes),
                track: (incoming, operation) => {
                  nativeRequests.add(incoming);
                  nativeTransfers.add(operation);
                  if (workFailure) incoming.destroy();
                  void operation
                    .finally(() => {
                      nativeRequests.delete(incoming);
                      nativeTransfers.delete(operation);
                    })
                    .catch(() => undefined);
                },
              }
            : undefined,
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
    assertWorkActive();
    request.signal?.throwIfAborted();
    const browserProfile = request.browserProfile ?? "pinned";
    browser = await launchRenderBrowser({ profile: browserProfile });
    browsers.push(browser);
    assertWorkActive();
    request.signal?.throwIfAborted();
    if (workOptions && workOptions.workers > 1) {
      const launches = await Promise.allSettled(
        Array.from({ length: workOptions.workers - 1 }, async () => {
          const launched = await launchRenderBrowser({
            profile: browserProfile,
          });
          browsers.push(launched);
          return launched;
        }),
      );
      const failed = launches.find((launch) => launch.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      assertWorkActive();
      request.signal?.throwIfAborted();
    }
    const prepared = await Promise.allSettled(
      browsers.map((workerBrowser) =>
        prepareExportBrowserWorker(workerBrowser, {
          baseUrl,
          width: scene.canvas.width,
          height: scene.canvas.height,
          profile: browserProfile,
          recordProcesses: workOptions !== undefined,
        }),
      ),
    );
    const failedPreparation = prepared.find(
      (worker) => worker.status === "rejected",
    );
    assertWorkActive();
    if (failedPreparation?.status === "rejected")
      throw failedPreparation.reason;
    const workers: ExportBrowserWorker[] = prepared.map((worker) => {
      if (worker.status !== "fulfilled")
        throw Error("Export worker preparation failed");
      return worker.value;
    });
    const renderEnvironment = workers[0]!.environment;
    if (
      workers.some(
        (worker) =>
          JSON.stringify(worker.environment) !==
          JSON.stringify(renderEnvironment),
      )
    )
      throw Error(
        "Composition workers differ from the captured pinned render environment",
      );
    for (const [index, worker] of workers.entries())
      await request.verifyWorker?.(worker.page, index);
    assertWorkActive();
    request.signal?.throwIfAborted();
    const scopeKey = workOptions
      ? contentChecksum(
          JSON.stringify({
            version: "composition-render-work-1",
            scene,
            sourceChecksum: capturedSourceChecksum,
            environment: renderEnvironment,
            format: profile?.format ?? "legacy-mp4",
            transport,
            preserveAlpha: profile?.alpha ?? false,
          }),
        )
      : "";
    if (workOptions?.cacheStatic) {
      surfaceStore = await CompositionSurfaceStore.create(viteCacheDirectory, {
        workers: workOptions.workers,
        byteLimit: executionPolicy!.diskBytes,
      });
      cacheBroker = new CompositionSurfaceBroker(
        surfaceStore,
        credentials,
        failWork,
      );
    }
    request.signal?.throwIfAborted();
    encodePathStart = performance.now();
    let browserResult: BrowserExportResult;
    let workerMemory: NonNullable<BrowserExportResult["memory"]>[] = [];
    let compositionStatistics: ExportMetrics["compositionStatistics"];
    if (workOptions) {
      const rendererIds = workers.flatMap(
        (worker) => worker.rendererProcessIds,
      );
      if (new Set(rendererIds).size !== rendererIds.length)
        throw Error("Composition workers share an actual renderer process");
      const runs: PromiseSettledResult<BrowserExportResult>[] = [];
      for (
        let offset = 0;
        offset < workers.length;
        offset += executionPolicy!.concurrentWorkers
      ) {
        assertWorkActive();
        const batch = await Promise.allSettled(
          workers
            .slice(offset, offset + executionPolicy!.concurrentWorkers)
            .map((worker, relative) => {
              const index = offset + relative;
              return runExportBrowserWorker(worker, {
                resultBudget,
                scene,
                hasDepth: request.depthPath !== null,
                transport,
                output: {
                  preserveAlpha: profile?.alpha ?? false,
                  canonicalCapture: profile !== undefined || !!nativeSink,
                  ...(nativeSink
                    ? {
                        nativeObservation: {
                          exportId,
                          worker: 0 as const,
                          credential: credentials[0]!,
                          executionSha256: nativeSink.executionSha256,
                          maximumPacketBytes:
                            request.nativeObservation!.maximumPacketBytes,
                        },
                      }
                    : {}),
                  work: {
                    worker: index,
                    workers: workOptions.workers,
                    concurrentWorkers: executionPolicy!.concurrentWorkers,
                    distribution: executionPolicy!.distribution,
                    credential: credentials[index]!,
                    ...(workOptions.cacheStatic
                      ? {
                          surfaceCache: {
                            scopeKey,
                            byteLimit: executionPolicy!.cacheBytes,
                          },
                        }
                      : {}),
                  },
                },
              }).catch((reason: unknown) => {
                failWork(
                  orderedFrames?.hasFailed
                    ? orderedFrames.failureReason
                    : reason,
                );
                throw reason;
              });
            }),
        );
        runs.push(...batch);
      }
      assertWorkActive();
      const results = runs.map((run) => {
        if (run.status !== "fulfilled") throw run.reason;
        return run.value;
      });
      orderedFrames!.finish();
      frameState.nextIndex = orderedFrames!.statistics.deliveredFrames;
      browserResult = summarizeExportWorkers(results);
      workerMemory = results.map((result) => {
        if (!result.memory?.afterAcknowledgement)
          throw Error("Composition worker omitted memory retirement");
        return result.memory;
      });
      compositionStatistics = summarizeCompositionStatistics(
        results.map((result) => {
          if (!result.compositionStatistics)
            throw Error("Composition worker omitted statistics");
          return result.compositionStatistics;
        }),
        scene.timeline.frameCount,
      );
      workMetrics = {
        version: "composition-render-work-1",
        workers: workOptions.workers,
        chunkFrames: 1,
        distribution: executionPolicy!.distribution,
        concurrentWorkers: executionPolicy!.concurrentWorkers,
        cacheStatic: workOptions.cacheStatic,
        scopeKey,
        orderedFrames: orderedFrames!.statistics,
        ...(surfaceStore ? { surfaceStore: surfaceStore.statistics } : {}),
        submissionStatistics: {
          scope: "synchronous-submission-wall-time",
          totalSubmissionWallMs: compositionStatistics.totalSubmissionWallMs,
          byLayerType: compositionStatistics.byLayerType,
        },
        workersDetail: workers.map((worker, index) => {
          const result = results[index]!.work;
          if (!result || result.worker !== index)
            throw Error("Composition worker result ownership differs");
          return {
            worker: index,
            environment: worker.environment,
            rendererProcessIds: worker.rendererProcessIds,
            gpuProcessIds: worker.gpuProcessIds,
            result,
          };
        }),
      };
    } else {
      browserResult = await runExportBrowserWorker(workers[0]!, {
        resultBudget,
        scene,
        hasDepth: request.depthPath !== null,
        transport,
        ...(profile || nativeSink
          ? {
              output: {
                preserveAlpha: profile?.alpha ?? false,
                canonicalCapture: true,
                ...(nativeSink
                  ? {
                      nativeObservation: {
                        exportId,
                        worker: 0 as const,
                        credential: credentials[0]!,
                        executionSha256: nativeSink.executionSha256,
                        maximumPacketBytes:
                          request.nativeObservation!.maximumPacketBytes,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      });
    }
    if (frameState.error) throw frameState.error;
    if (frameState.nextIndex !== scene.timeline.frameCount)
      throw new Error("Not all frames reached the encoder");
    if (browserResult.memory) workerMemory = [browserResult.memory];
    if (!compositionStatistics && browserResult.compositionStatistics)
      compositionStatistics = summarizeCompositionStatistics(
        [browserResult.compositionStatistics],
        scene.timeline.frameCount,
      );
    const concurrentWorkers = executionPolicy?.concurrentWorkers ?? 1;
    const workerPeaks = workerMemory.map(
      (worker) =>
        worker.beforeAcknowledgement.peak.pixels +
        worker.beforeAcknowledgement.peak.metadata,
    );
    let peakConcurrentWorkerBytes = 0;
    for (
      let offset = 0;
      offset < workerPeaks.length;
      offset += concurrentWorkers
    )
      peakConcurrentWorkerBytes = Math.max(
        peakConcurrentWorkerBytes,
        workerPeaks
          .slice(offset, offset + concurrentWorkers)
          .reduce((sum, bytes) => sum + bytes, 0),
      );
    if (outputInput) await outputInput.finish();
    else encoder.stdin?.end();
    await encoderClosed;
    await encoderProcess.reap();
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
    if (nativeSink) {
      if (!browserResult.nativeObservationStatistics)
        passageError(
          "comp-native3d-protocol",
          "Native browser omitted observation closure counters",
          { path: "nativeObservations" },
        );
      nativeObservations = await nativeSink.finalize(
        browserResult.nativeObservationStatistics,
        {
          sha256: outputChecksum,
          frameCount: scene.timeline.frameCount,
          width: scene.canvas.width,
          height: scene.canvas.height,
          transport,
        },
      );
    }
    const sourceChecksum = await fileChecksum(
      request.sourcePath,
      request.signal,
    );
    if (
      (profile || workOptions || nativeSink) &&
      sourceChecksum !== capturedSourceChecksum
    )
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
      ...(nativeObservations ? { nativeObservations } : {}),
      version: workOptions
        ? COMPOSITION_PARALLEL_EXPORT_WORKER_VERSION
        : profile
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
      ffmpegCpuScope: "ffmpeg-transcode-user-plus-system",
      ...(workOptions
        ? {
            ffmpegProcessUsage: {
              ...ffmpegProcessUsage(encoderError),
              timingProcessId: encoder.pid!,
              processGroupReaped: true as const,
            },
          }
        : {}),
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
      ...(workMetrics ? { work: workMetrics } : {}),
      ...(compositionStatistics ? { compositionStatistics } : {}),
      ...(workerMemory.length
        ? {
            compositionMemory: {
              scope: "declared-worker-application-bytes" as const,
              applicationLimitBytes: COMPOSITION_APPLICATION_MEMORY_LIMIT,
              reservedNodeBudgetBytes: COMPOSITION_NODE_MEMORY_ALLOWANCE,
              concurrentWorkers,
              peakConcurrentWorkerBytes,
              sumOfWorkerPeakBytes: workerMemory.reduce(
                (sum, worker) =>
                  sum +
                  worker.beforeAcknowledgement.peak.pixels +
                  worker.beforeAcknowledgement.peak.metadata,
                0,
              ),
              workers: workerMemory,
              nodeResults: resultBudget!.statistics,
            },
          }
        : {}),
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
      const size = resultBudget ? compositionResultSize(metrics) : undefined;
      // Pretty JSON whitespace and the public composition-result envelope.
      const characters = size
        ? size.characters + size.nodes * 132 + 65536
        : undefined;
      const textCapacity = characters
        ? resultBudget!.reserveText(characters)
        : undefined;
      try {
        if (metrics.compositionMemory)
          metrics.compositionMemory.nodeResults = resultBudget!.statistics;
        const contents = await request.resultManifestContents(metrics);
        if (characters && contents.length > characters)
          throw Error(
            "Composition result manifest exceeds its admitted capacity",
          );
        await writeFile(temporaryResultPath, contents, {
          flag: "wx",
          signal: request.signal,
        });
      } finally {
        textCapacity?.release();
      }
    }
    clearInterval(memoryMonitor);
    await memorySample;
    await Promise.all(browsers.map((workerBrowser) => workerBrowser.close()));
    browser = undefined;
    await server.close();
    server = undefined;
    request.signal?.throwIfAborted();
    if (profile || workOptions || nativeSink) {
      await request.validateSources?.();
      if (
        (await fileChecksum(request.sourcePath, request.signal)) !==
        capturedSourceChecksum
      )
        throw Error("Composition source changed before output publication");
    }
    if (nativeSink && nativeObservations) {
      const staged = new Map(
        nativeSink.publications.map((entry) => [
          basename(entry.destination),
          entry.staged,
        ]),
      );
      await verifyNativeObservationClosure({
        closure: {
          ...nativeObservations,
          manifestPath: staged.get(basename(nativeObservations.manifestPath))!,
        },
        execution: request.nativeObservation!.execution,
        expectedPasses: request.nativeObservation!.expectedPasses,
        output: {
          sha256: outputChecksum,
          frameCount: scene.timeline.frameCount,
          width: scene.canvas.width,
          height: scene.canvas.height,
          transport,
        },
        signal: request.signal,
        reserve: (bytes) => resultBudget!.reserveTransient(bytes),
        resolveArtifactPath: (path) => {
          const artifact = staged.get(path);
          if (!artifact)
            throw Error(
              "Observation shard is outside this export's staged ownership",
            );
          return artifact;
        },
      });
    }
    const metadata = [
      { staged: temporaryScenePath, destination: sceneManifestPath },
      ...(nativeSink ? nativeSink.publications : []),
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
    encoderProcess.kill();
    request.signal?.throwIfAborted();
    assertWorkActive();
    if (orderedFrames?.hasFailed) throw orderedFrames.failureReason;
    throw error;
  } finally {
    request.signal?.removeEventListener("abort", abort);
    clearInterval(memoryMonitor);
    // The writer must exit before removing files it might still create.
    await encoderReaped;
    try {
      await encoderProcess.reap();
    } catch (error) {
      process.stderr.write(`Export encoder reaping failed: ${String(error)}\n`);
    }
    const cleanup = await Promise.allSettled([
      (async () => {
        stopNativeRequests(Error("Native export transfers retired"));
        await Promise.allSettled([...nativeTransfers]);
      })(),
      published ? null : memorySample,
      ...browsers.map((workerBrowser) => workerBrowser.close()),
      surfaceStore?.dispose(),
      outputInput?.dispose(),
      outputArtifacts?.dispose(),
      nativeSink?.dispose(),
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
    resultBudget?.dispose();
    if (cleanupErrors.length > 0) {
      for (const error of cleanupErrors) {
        process.stderr.write(`Export cleanup failed: ${String(error)}\n`);
      }
    }
  }
};
