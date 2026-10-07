import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AnimationEngineError,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
import type { CompositionMediaPreparationOptions } from "./composition-media.ts";
import { COMPOSITION_EVALUATOR_VERSION } from "../../renderer-core/src/composition/evaluate/evaluate.ts";
import {
  compositionScene,
  type CompositionBackend,
  type CompositionRendererVersion,
  type CompositionScene,
} from "../../renderer-core/src/composition/render/renderer.ts";
import {
  exportScene,
  type ExportMetrics,
  type ExportRequest,
} from "@still-shift/execution-runtime/export";
import {
  readCompositionSource,
  type CompositionSource,
} from "./composition-source.ts";

const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export type LoadedComposition = CompositionSource & { scene: CompositionScene };

/** Prepare an inspected composition source for a selected renderer backend. */
export async function loadComposition(
  compositionPath: string,
  backend: CompositionBackend = "canvas2d",
  options: CompositionMediaPreparationOptions = {},
): Promise<LoadedComposition> {
  const source = await readCompositionSource(compositionPath, options);
  return {
    ...source,
    scene: {
      ...compositionScene(source.composition, backend),
      ...(source.preparedMedia ? { preparedMedia: source.preparedMedia } : {}),
    },
  };
}

export type CompositionRenderResult = {
  schemaVersion: "composition-result-1";
  status: "rendered";
  composition: string;
  rendererVersion: CompositionRendererVersion;
  evaluatorVersion: typeof COMPOSITION_EVALUATOR_VERSION;
  fps: number;
  frameCount: number;
  durationMs: number;
  outputPath: string;
  sceneManifestPath: string;
  /** Validation warnings for the rendered composition. */
  warnings: CompositionDiagnostic[];
  /** Non-empty when text used generic browser faces: output is then not
   * reproducible on other machines or browser versions. */
  systemFontLayers: string[];
  checksums: { source: string; scene: string; output: string };
  metrics: ExportMetrics;
};

/** Export a composition to MP4 through the pinned export browser. */
export async function renderComposition(request: {
  compositionPath: string;
  outputPath: string;
  signal?: AbortSignal | undefined;
  transport?: ExportRequest["transport"];
  backend?: CompositionBackend;
  cacheDirectory?: string;
}): Promise<CompositionRenderResult> {
  request.signal?.throwIfAborted();
  const loaded = await loadComposition(
    request.compositionPath,
    request.backend,
    {
      signal: request.signal,
      ...(request.cacheDirectory
        ? { cacheDirectory: request.cacheDirectory }
        : {}),
    },
  );
  const { width, height } = loaded.scene.canvas;
  if (width % 2 !== 0 || height % 2 !== 0)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      `MP4 export requires even width and height; received ${width} × ${height}`,
    );
  const outputPath = resolve(request.outputPath);
  const sceneManifestPath = `${outputPath}.scene.json`;
  for (const path of [
    outputPath,
    sceneManifestPath,
    `${outputPath}.result.json`,
  ])
    try {
      await stat(path);
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Output already exists: ${path}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  // The renderer and evaluator versions participate in cache identity.
  const manifestBytes = `${JSON.stringify(
    {
      schemaVersion: "composition-render-1",
      rendererVersion: loaded.scene.rendererVersion,
      evaluatorVersion: COMPOSITION_EVALUATOR_VERSION,
      sourcePath: loaded.sourcePath,
      sourceChecksum: loaded.sourceChecksum,
      systemFontLayers: loaded.systemFontLayers,
      scene: loaded.scene,
      assetPaths: loaded.assetPaths,
    },
    null,
    2,
  )}\n`;
  let result!: CompositionRenderResult;
  await exportScene({
    scene: loaded.scene,
    signal: request.signal,
    sourcePath: loaded.sourcePath,
    depthPath: null,
    assetPaths: loaded.assetPaths,
    outputPath,
    sceneManifestContents: manifestBytes,
    transport: request.transport ?? "png_pipe",
    resultManifestContents: (metrics) => {
      result = {
        schemaVersion: "composition-result-1",
        status: "rendered",
        composition: loaded.composition.id,
        rendererVersion: loaded.scene.rendererVersion,
        evaluatorVersion: COMPOSITION_EVALUATOR_VERSION,
        fps: loaded.scene.timeline.fps,
        frameCount: metrics.frameCount,
        durationMs: loaded.scene.timeline.durationMs,
        outputPath,
        sceneManifestPath,
        warnings: loaded.warnings,
        systemFontLayers: loaded.systemFontLayers,
        checksums: {
          source: loaded.sourceChecksum,
          scene: hash(manifestBytes),
          output: metrics.outputChecksum,
        },
        metrics,
      };
      return `${JSON.stringify(result, null, 2)}\n`;
    },
  });
  return result;
}
