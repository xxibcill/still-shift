import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AnimationEngineError,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
import {
  COMPOSITION_EVALUATOR_VERSION,
  compositionScene,
  type CompositionBackend,
  type CompositionRendererVersion,
  type CompositionScene,
} from "@still-shift/renderer-core";
import {
  exportScene,
  type ExportMetrics,
  type ExportRequest,
} from "@still-shift/execution-runtime/export";
import { validatePreparedAssets } from "./prepared-animation-engine.ts";

const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Text layers drawn with a generic browser face: root ids or `precomp-id/layer-id`. */
function systemFontLayers(composition: Composition): string[] {
  const fonts = new Set(
    composition.assets.flatMap((a) => (a.type === "font" ? [a.id] : [])),
  );
  return [composition, ...(composition.precomps ?? [])].flatMap((scope) =>
    scope.layers.flatMap((layer) => {
      if (layer.type === "provider" && layer.usesSystemFonts)
        return [scope === composition ? layer.id : `${scope.id}/${layer.id}`];
      if (layer.type !== "text") return [];
      const style = layer.style
        ? composition.textStyles?.[layer.style]
        : undefined;
      if (fonts.has(style?.fontAsset ?? layer.fontAsset ?? "")) return [];
      return [scope === composition ? layer.id : `${scope.id}/${layer.id}`];
    }),
  );
}

export type LoadedComposition = {
  composition: Composition;
  /** Validation warnings, such as `comp-text-system-font`. */
  warnings: CompositionDiagnostic[];
  /** Text layers whose output depends on the machine's generic fonts. */
  systemFontLayers: string[];
  scene: CompositionScene;
  /** Absolute paths of image and font assets, by asset id. */
  assetPaths: Record<string, string>;
  sourcePath: string;
  sourceChecksum: string;
};

/** Read, validate and resolve a `composition-1` file and its pinned assets. */
export async function loadComposition(
  compositionPath: string,
  backend: CompositionBackend = "canvas2d",
): Promise<LoadedComposition> {
  const sourcePath = resolve(compositionPath);
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch {
    throw new AnimationEngineError(
      "INPUT_UNREADABLE",
      `Cannot read composition ${sourcePath}`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Composition must be valid JSON",
    );
  }
  const result = validateComposition(value);
  if (!result.ok)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      result.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`)[0] ??
        "Invalid composition",
      { diagnosticsJson: JSON.stringify(result.diagnostics) },
    );
  const composition = result.composition;
  const unsupported = composition.assets.find(
    (asset) => asset.type !== "image" && asset.type !== "font",
  );
  if (unsupported)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      `${unsupported.type} assets arrive in CE13: ${unsupported.id}`,
    );
  const assetPaths = await validatePreparedAssets(
    {
      assets: composition.assets.flatMap((a) =>
        a.type === "image" ? [a] : [],
      ),
      fonts: composition.assets.flatMap((a) => (a.type === "font" ? [a] : [])),
    },
    dirname(sourcePath),
  );
  return {
    composition,
    warnings: result.diagnostics,
    systemFontLayers: systemFontLayers(composition),
    scene: compositionScene(composition, backend),
    assetPaths,
    sourcePath,
    sourceChecksum: hash(bytes),
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
}): Promise<CompositionRenderResult> {
  request.signal?.throwIfAborted();
  const loaded = await loadComposition(
    request.compositionPath,
    request.backend,
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
