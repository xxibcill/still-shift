import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  AnimationEngineError,
  ANIMATION_API_VERSION,
  AnimationResultSchema,
  calculateFrameCount,
  ENGINE_VERSION,
  parseAnimationRequest,
  SCENE_SCHEMA_VERSION,
  SceneManifestSchema,
  type AnimationRequest,
  type AnimationResult,
  type ResolvedAnimationPreset,
  type SceneManifest,
} from "@still-shift/scene-contract";

import type { AnimationEngine } from "./animation-engine.ts";

const PIPELINE_VERSION = "noop-prep-0.1.0";
const RENDERER_VERSION = "noop-render-0.1.0";

const serialize = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const checksum = (value: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const resolvePreset = (request: AnimationRequest): ResolvedAnimationPreset =>
  request.preset === "auto" ? "slow_push" : request.preset;

const buildScene = (
  request: AnimationRequest,
  sourceHash: string,
): SceneManifest =>
  SceneManifestSchema.parse({
    schemaVersion: SCENE_SCHEMA_VERSION,
    sourceHash,
    pipelineVersion: PIPELINE_VERSION,
    rendererVersion: RENDERER_VERSION,
    timeline: {
      durationMs: request.durationMs,
      fps: request.fps,
      frameCount: calculateFrameCount(request.durationMs, request.fps),
    },
    canvas: {
      width: request.width,
      height: request.height,
    },
    depth: null,
    motion: {
      preset: resolvePreset(request),
      intensity: request.intensity,
      seed: request.seed,
      safeCrop: 0,
    },
    quality: {
      riskScore: 0,
      fallback: false,
      warnings: [],
    },
    execution: {
      adapter: "noop",
      producesVideo: false,
    },
  });

const readSource = async (inputPath: string): Promise<Uint8Array> => {
  try {
    return await readFile(inputPath);
  } catch (cause) {
    throw new AnimationEngineError(
      "INPUT_UNREADABLE",
      `Unable to read animation input: ${inputPath}`,
      { inputPath },
      { cause },
    );
  }
};

const publishNoopArtifacts = async (
  outputPath: string,
  sceneManifestPath: string,
  output: string,
  scene: string,
): Promise<void> => {
  const temporaryOutputPath = `${outputPath}.${randomUUID()}.tmp`;
  const temporaryScenePath = `${sceneManifestPath}.${randomUUID()}.tmp`;
  let scenePublished = false;

  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(sceneManifestPath), { recursive: true });
    await writeFile(temporaryOutputPath, output, {
      encoding: "utf8",
      flag: "wx",
    });
    await writeFile(temporaryScenePath, scene, {
      encoding: "utf8",
      flag: "wx",
    });

    await link(temporaryScenePath, sceneManifestPath);
    scenePublished = true;
    await link(temporaryOutputPath, outputPath);
  } catch (cause) {
    await Promise.allSettled([
      rm(temporaryOutputPath, { force: true }),
      rm(temporaryScenePath, { force: true }),
      ...(scenePublished ? [rm(sceneManifestPath, { force: true })] : []),
    ]);
    throw new AnimationEngineError(
      "RENDER_FAILED",
      `Unable to publish no-op animation artifact: ${outputPath}`,
      { outputPath },
      { cause },
    );
  }

  await Promise.allSettled([
    rm(temporaryOutputPath, { force: true }),
    rm(temporaryScenePath, { force: true }),
  ]);
};

export class NoopAnimationEngine implements AnimationEngine {
  requestIdentity(request: AnimationRequest): string {
    return checksum(
      JSON.stringify({
        engineVersion: ENGINE_VERSION,
        adapter: "noop",
        request,
      }),
    );
  }

  async animate(
    unvalidatedRequest: AnimationRequest,
  ): Promise<AnimationResult> {
    const request = parseAnimationRequest(unvalidatedRequest);
    const source = await readSource(request.inputPath);
    const sourceHash = checksum(source);
    const scene = buildScene(request, sourceHash);
    const serializedScene = serialize(scene);
    const sceneHash = checksum(serializedScene);
    const serializedOutput = serialize({
      artifactVersion: "0.1",
      kind: "still-shift-noop-animation",
      producesVideo: false,
      sceneHash,
    });
    const sceneManifestPath = `${request.outputPath}.scene.json`;

    await publishNoopArtifacts(
      request.outputPath,
      sceneManifestPath,
      serializedOutput,
      serializedScene,
    );

    return AnimationResultSchema.parse({
      apiVersion: ANIMATION_API_VERSION,
      status: "rendered",
      outputPath: request.outputPath,
      sceneManifestPath,
      frameCount: scene.timeline.frameCount,
      durationMs: scene.timeline.durationMs,
      selectedPreset: scene.motion.preset,
      warnings: [],
      metrics: {
        adapter: "noop",
        cacheStatus: "not_applicable",
        inputWidth: null,
        inputHeight: null,
        normalizedWidth: null,
        normalizedHeight: null,
        depthInferenceMs: 0,
        depthPostProcessMs: 0,
        sceneBuildMs: 0,
        frameRenderAverageMs: 0,
        frameRenderP95Ms: 0,
        encodeMs: 0,
        totalWallMs: 0,
        peakCpuMemoryBytes: null,
        peakGpuMemoryBytes: null,
        outputBytes: Buffer.byteLength(serializedOutput),
        selectedDevice: "none",
        hardwareDescription: "deterministic no-op adapter",
        versions: {
          engine: ENGINE_VERSION,
          pipeline: PIPELINE_VERSION,
          renderer: RENDERER_VERSION,
          browser: null,
          ffmpeg: null,
        },
      },
      checksums: {
        source: sourceHash,
        scene: sceneHash,
        output: checksum(serializedOutput),
      },
    });
  }
}
