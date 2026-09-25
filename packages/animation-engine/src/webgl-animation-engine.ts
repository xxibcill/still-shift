import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import {
  analyzeDepthSafety,
  applySafetyToScene,
  fallback2DScene,
  resolvePreviewScene,
  type PreviewPreset,
  type PreviewScene,
  type PreviewWarning,
} from "../../renderer-core/src/index.ts";
import {
  AnimationEngineError,
  ANIMATION_API_VERSION,
  AnimationResultSchema,
  DepthModelSchema,
  ENGINE_VERSION,
  parseAnimationRequest,
  SCENE_SCHEMA_VERSION,
  SceneManifestSchema,
  type AnimationRequest,
  type AnimationResult,
  type AnimationWarning,
  type DepthModel,
} from "../../scene-contract/src/index.ts";
import { exportScene } from "../../../tools/export-worker/src/export-worker.ts";

import type { AnimationEngine } from "./animation-engine.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "../../..");
const PIPELINE_VERSION = "animation-pipeline-0.10.0";
export const resolveFrameTransport = (): "png_pipe" | "jpeg_pipe" => {
  const value = process.env.STILL_SHIFT_FRAME_TRANSPORT ?? "png_pipe";
  if (value !== "png_pipe" && value !== "jpeg_pipe")
    throw new AnimationEngineError("SCENE_INVALID", "Unknown frame transport", {
      value,
    });
  return value;
};
export const resolveDepthAdapter = (): string =>
  process.env.STILL_SHIFT_DEPTH_ADAPTER ?? "depth-anything-v2-small";

type Dimensions = { width: number; height: number };
type WorkerMetrics = {
  inferenceMs?: number;
  postProcessMs?: number;
  peakCpuMemoryBytes?: number | null;
  peakGpuMemoryBytes?: number | null;
  selectedDevice?: string;
  hardwareDescription?: string;
};
type PreparedDepth = {
  status: "prepared";
  assets: { normalizedSource: string; previewDepth: string };
  dimensions: { input: Dimensions; normalized: Dimensions };
  cacheStatus: "hit" | "miss";
  model: DepthModel;
  metrics: WorkerMetrics;
  normalizationWarnings: string[];
};
type NormalizedSource = {
  status: "normalized";
  sourcePath: string;
  dimensions: { input: Dimensions; normalized: Dimensions };
  cacheStatus: "hit" | "miss";
  normalizationWarnings: string[];
};
type WorkerFailure = {
  status: "failed";
  error: { code: string; message: string };
};

const sha256 = (bytes: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const workerJson = async (args: string[]): Promise<unknown> => {
  const configuredCache = process.env.STILL_SHIFT_CACHE_DIR;
  const workerEnvironment =
    configuredCache &&
    !isAbsolute(configuredCache) &&
    !configuredCache.startsWith("~")
      ? { ...process.env, STILL_SHIFT_CACHE_DIR: resolve(configuredCache) }
      : process.env;
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "uv",
      ["run", "still-shift-depth", ...args],
      {
        cwd: projectRoot,
        env: workerEnvironment,
        maxBuffer: 8 * 1024 * 1024,
      },
    ));
  } catch (error) {
    const output = (error as { stdout?: unknown }).stdout;
    if (typeof output !== "string") {
      return {
        status: "failed",
        error: {
          code: "PREPARATION_FAILED",
          message: "Depth worker could not start",
        },
      } satisfies WorkerFailure;
    }
    stdout = output;
  }
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return {
      status: "failed",
      error: {
        code: "PREPARATION_FAILED",
        message: "Depth worker returned invalid JSON",
      },
    } satisfies WorkerFailure;
  }
};

const isDimensions = (value: unknown): value is Dimensions =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Dimensions).width === "number" &&
  typeof (value as Dimensions).height === "number" &&
  Number.isInteger((value as Dimensions).width) &&
  Number.isInteger((value as Dimensions).height) &&
  (value as Dimensions).width > 0 &&
  (value as Dimensions).height > 0;

const isWarningList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((warning) => typeof warning === "string" && warning.length > 0);

const isPrepared = (value: unknown): value is PreparedDepth => {
  const result = value as Partial<PreparedDepth> | null;
  return (
    result?.status === "prepared" &&
    typeof result.assets?.normalizedSource === "string" &&
    typeof result.assets.previewDepth === "string" &&
    isDimensions(result.dimensions?.input) &&
    isDimensions(result.dimensions?.normalized) &&
    (result.cacheStatus === "hit" || result.cacheStatus === "miss") &&
    DepthModelSchema.safeParse(result.model).success &&
    typeof result.metrics === "object" &&
    result.metrics !== null &&
    isWarningList(result.normalizationWarnings)
  );
};

const isNormalized = (value: unknown): value is NormalizedSource => {
  const result = value as Partial<NormalizedSource> | null;
  return (
    result?.status === "normalized" &&
    typeof result.sourcePath === "string" &&
    isDimensions(result.dimensions?.input) &&
    isDimensions(result.dimensions?.normalized) &&
    (result.cacheStatus === "hit" || result.cacheStatus === "miss") &&
    isWarningList(result.normalizationWarnings)
  );
};

const isFailure = (value: unknown): value is WorkerFailure => {
  const result = value as Partial<WorkerFailure> | null;
  return (
    result?.status === "failed" &&
    typeof result.error?.code === "string" &&
    typeof result.error.message === "string"
  );
};

const invalidInputCode = (code: string) =>
  code === "INPUT_UNREADABLE" ||
  code === "INPUT_FORMAT_UNSUPPORTED" ||
  code === "INPUT_DECODE_FAILED" ||
  code === "INPUT_DIMENSIONS_INVALID";

const normalizeOrFail = async (
  inputPath: string,
): Promise<NormalizedSource> => {
  const normalized = await workerJson(["normalize", "--input", inputPath]);
  if (isNormalized(normalized)) return normalized;
  if (isFailure(normalized) && invalidInputCode(normalized.error.code)) {
    throw new AnimationEngineError(
      normalized.error.code as AnimationEngineError["code"],
      normalized.error.message,
      { inputPath },
    );
  }
  throw new AnimationEngineError(
    "DEPTH_INFERENCE_FAILED",
    "Unable to normalize source for 2D fallback",
    { inputPath },
  );
};

const prepareAssets = async (
  inputPath: string,
): Promise<{
  sourcePath: string;
  depthPath: string | null;
  dimensions: { input: Dimensions; normalized: Dimensions };
  cacheStatus: "hit" | "miss";
  model: DepthModel | null;
  workerMetrics: WorkerMetrics;
  normalizationWarnings: string[];
}> => {
  const adapter = resolveDepthAdapter();
  const args = ["prepare", "--input", inputPath, "--adapter", adapter];
  if (process.env.STILL_SHIFT_DEPTH_DEVICE)
    args.push("--device", process.env.STILL_SHIFT_DEPTH_DEVICE);
  const prepared = await workerJson(args);
  if (isPrepared(prepared)) {
    return {
      sourcePath: prepared.assets.normalizedSource,
      depthPath: prepared.assets.previewDepth,
      dimensions: prepared.dimensions,
      cacheStatus: prepared.cacheStatus,
      model: prepared.model,
      workerMetrics: prepared.metrics,
      normalizationWarnings: prepared.normalizationWarnings,
    };
  }
  if (isFailure(prepared) && invalidInputCode(prepared.error.code)) {
    throw new AnimationEngineError(
      prepared.error.code as AnimationEngineError["code"],
      prepared.error.message,
      { inputPath },
    );
  }
  const normalized = await normalizeOrFail(inputPath);
  return {
    sourcePath: normalized.sourcePath,
    depthPath: null,
    dimensions: normalized.dimensions,
    cacheStatus: normalized.cacheStatus,
    model: null,
    workerMetrics: {},
    normalizationWarnings: normalized.normalizationWarnings,
  };
};

const normalizationWarning = (workerCode: string): PreviewWarning => ({
  code: "SOURCE_NORMALIZATION_WARNING",
  message:
    workerCode === "INVALID_ICC_PROFILE_TREATED_AS_SRGB"
      ? "Invalid embedded color profile was treated as sRGB"
      : "Source normalization reported a warning",
  context: { workerCode },
});

const decodeRgba = async (
  path: string,
  width: number,
  height: number,
): Promise<Uint8Array> => {
  const decoder = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `scale=${width}:${height}:flags=bilinear`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  decoder.stdout.on("data", (chunk: Buffer) => output.push(chunk));
  decoder.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  await new Promise<void>((accept, reject) => {
    decoder.on("error", reject);
    decoder.on("close", (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `Image decode failed: ${Buffer.concat(errors).toString()}`,
            ),
          ),
    );
  });
  const bytes = Buffer.concat(output);
  if (bytes.length !== width * height * 4)
    throw new Error("Image decode returned an unexpected pixel count");
  return bytes;
};

const analyzeAssets = async (
  sourcePath: string,
  depthPath: string,
  dimensions: Dimensions,
) => {
  const scale = Math.min(256 / dimensions.width, 256 / dimensions.height);
  const width = Math.max(2, Math.round(dimensions.width * scale));
  const height = Math.max(2, Math.round(dimensions.height * scale));
  const [source, depth] = await Promise.all([
    decodeRgba(sourcePath, width, height),
    decodeRgba(depthPath, width, height),
  ]);
  return analyzeDepthSafety({ width, height, source, depth });
};

const choosePreset = (
  request: AnimationRequest,
  normalizedSourceHash: string,
): PreviewPreset => {
  if (request.preset !== "auto") return request.preset;
  const presets: PreviewPreset[] = [
    "slow_push",
    "horizontal_drift",
    "cinematic_float",
  ];
  const hashPrefix = Number.parseInt(normalizedSourceHash.slice(7, 15), 16);
  return presets[((hashPrefix ^ request.seed) >>> 0) % presets.length]!;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export class WebGLAnimationEngine implements AnimationEngine {
  async animate(
    unvalidatedRequest: AnimationRequest,
  ): Promise<AnimationResult> {
    const started = performance.now();
    const request = parseAnimationRequest(unvalidatedRequest);
    const frameTransport = resolveFrameTransport();
    if (!request.outputPath.toLowerCase().endsWith(".mp4"))
      throw new AnimationEngineError(
        "SCENE_INVALID",
        "Animation output path must end in .mp4",
      );
    const inputPath = resolve(request.inputPath);
    const outputPath = resolve(request.outputPath);
    const sceneManifestPath = `${outputPath}.scene.json`;
    if ((await fileExists(outputPath)) || (await fileExists(sceneManifestPath)))
      throw new AnimationEngineError(
        "RENDER_FAILED",
        "Output or scene manifest already exists",
        { outputPath },
      );
    let originalSource: Uint8Array;
    try {
      originalSource = await readFile(inputPath);
    } catch (cause) {
      throw new AnimationEngineError(
        "INPUT_UNREADABLE",
        "Unable to read animation input",
        { inputPath: request.inputPath },
        { cause },
      );
    }
    const sourceHash = sha256(originalSource);
    const prepared = await prepareAssets(inputPath);
    const normalizedSourceHash = sha256(await readFile(prepared.sourcePath));
    const depthHash = prepared.depthPath
      ? sha256(await readFile(prepared.depthPath))
      : undefined;
    const sceneStarted = performance.now();
    const dimensions = prepared.dimensions.normalized;
    const initialScene = resolvePreviewScene({
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      depthWidth: dimensions.width,
      depthHeight: dimensions.height,
      durationMs: request.durationMs,
      fps: request.fps,
      canvasWidth: request.width,
      canvasHeight: request.height,
      preset: choosePreset(request, normalizedSourceHash),
      intensity: request.intensity,
      seed: request.seed,
    });
    let scene: PreviewScene;
    if (!prepared.depthPath) {
      scene = fallback2DScene(initialScene, "DEPTH_PREPARATION_FAILED");
    } else {
      try {
        scene = applySafetyToScene(
          initialScene,
          await analyzeAssets(
            prepared.sourcePath,
            prepared.depthPath,
            dimensions,
          ),
        );
      } catch {
        scene = fallback2DScene(initialScene, "DEPTH_SAFETY_ANALYSIS_FAILED");
      }
    }
    scene = {
      ...scene,
      warnings: [
        ...scene.warnings,
        ...prepared.normalizationWarnings.map(normalizationWarning),
      ],
    };
    const sceneBuildMs = performance.now() - sceneStarted;
    const warnings: AnimationWarning[] = scene.warnings;
    const manifest = SceneManifestSchema.parse({
      schemaVersion: SCENE_SCHEMA_VERSION,
      sourceHash: normalizedSourceHash,
      normalizedSourceHash,
      pipelineVersion: PIPELINE_VERSION,
      model: prepared.model,
      rendererVersion: scene.rendererVersion,
      timeline: scene.timeline,
      canvas: scene.canvas,
      depth: depthHash
        ? {
            asset: depthHash,
            strength: scene.motion.depthStrength,
            near: 0,
            far: 1,
          }
        : null,
      motion: {
        preset: scene.motion.preset,
        intensity: scene.motion.intensity,
        seed: scene.motion.seed,
        safeCrop: scene.motion.maximumCrop,
      },
      quality: {
        riskScore: scene.quality?.riskScore ?? 1,
        fallback: scene.motion.mode === "fallback_2d",
        warnings,
      },
      renderScene: scene,
      execution: { adapter: "webgl", producesVideo: true, frameTransport },
    });
    const serializedScene = `${JSON.stringify(manifest, null, 2)}\n`;
    const sceneHash = sha256(serializedScene);
    let exported: Awaited<ReturnType<typeof exportScene>>;
    try {
      exported = await exportScene({
        scene,
        sourcePath: prepared.sourcePath,
        depthPath:
          scene.motion.mode === "fallback_2d" ? null : prepared.depthPath,
        outputPath,
        transport: frameTransport,
        sceneManifestContents: serializedScene,
      });
    } catch (cause) {
      throw new AnimationEngineError(
        "RENDER_FAILED",
        "Unable to export animation MP4",
        { outputPath },
        { cause },
      );
    }
    try {
      if (
        exported.sceneManifestPath !== sceneManifestPath ||
        exported.sceneChecksum !== sceneHash ||
        exported.sourceChecksum !== normalizedSourceHash ||
        exported.depthChecksum !==
          (scene.motion.mode === "fallback_2d" ? null : (depthHash ?? null))
      ) {
        throw new Error("Export assets changed after scene resolution");
      }
      const result = AnimationResultSchema.parse({
        apiVersion: ANIMATION_API_VERSION,
        status:
          scene.motion.mode === "fallback_2d"
            ? "fallback_2d"
            : warnings.length
              ? "rendered_with_warnings"
              : "rendered",
        outputPath,
        sceneManifestPath,
        assetPaths: {
          normalizedSource: prepared.sourcePath,
          depth: prepared.depthPath,
        },
        frameCount: scene.timeline.frameCount,
        durationMs: scene.timeline.durationMs,
        selectedPreset: scene.motion.preset,
        warnings,
        metrics: {
          adapter: "webgl",
          frameTransport,
          cacheStatus: prepared.cacheStatus,
          inputWidth: prepared.dimensions.input.width,
          inputHeight: prepared.dimensions.input.height,
          normalizedWidth: dimensions.width,
          normalizedHeight: dimensions.height,
          depthInferenceMs:
            prepared.cacheStatus === "hit"
              ? 0
              : (prepared.workerMetrics.inferenceMs ?? 0),
          depthPostProcessMs:
            prepared.cacheStatus === "hit"
              ? 0
              : (prepared.workerMetrics.postProcessMs ?? 0),
          sceneBuildMs,
          frameRenderAverageMs: exported.frameRenderAverageMs,
          frameRenderP95Ms: exported.frameRenderP95Ms,
          encodeMs: exported.encodePathWallMs,
          totalWallMs: performance.now() - started,
          peakCpuMemoryBytes: Math.max(
            exported.peakSampledProcessTreeRssBytes ??
              exported.peakParentRssBytes,
            prepared.workerMetrics.peakCpuMemoryBytes ?? 0,
          ),
          peakGpuMemoryBytes: prepared.workerMetrics.peakGpuMemoryBytes ?? null,
          outputBytes: exported.outputBytes,
          selectedDevice: prepared.workerMetrics.selectedDevice ?? "2d",
          hardwareDescription: `${prepared.workerMetrics.hardwareDescription ?? "2D fallback"}; export ${exported.gpuRenderer}`,
          versions: {
            engine: ENGINE_VERSION,
            pipeline: PIPELINE_VERSION,
            model: prepared.model,
            renderer: scene.rendererVersion,
            browser: exported.browserVersion,
            ffmpeg: exported.ffmpegVersion,
          },
        },
        checksums: {
          source: sourceHash,
          ...(depthHash ? { depth: depthHash } : {}),
          scene: sceneHash,
          output: exported.outputChecksum,
        },
      });
      return result;
    } catch (cause) {
      await Promise.allSettled([
        rm(outputPath, { force: true }),
        rm(sceneManifestPath, { force: true }),
      ]);
      throw new AnimationEngineError(
        "RENDER_FAILED",
        "Unable to validate animation result and scene manifest",
        { outputPath },
        { cause },
      );
    }
  }
}
