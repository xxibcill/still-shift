import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { imageSize } from "image-size";
import {
  AnimationEngineError,
  PreparedSceneInputSchema,
  PreparedAnimationResultSchema,
  CinematicAnimationResultSchema,
} from "@still-shift/scene-contract";
import { compilePreparedScene } from "../../renderer-core/src/prepared-scene.ts";
import { exportScene } from "../../../tools/export-worker/src/export-worker.ts";

const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export async function loadPreparedScene(scenePath: string) {
  const absolute = resolve(scenePath);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolute);
  } catch {
    throw new AnimationEngineError(
      "INPUT_UNREADABLE",
      `Cannot read scene ${absolute}`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Prepared scene must be valid JSON",
    );
  }
  const parsed = PreparedSceneInputSchema.safeParse(value);
  if (!parsed.success)
    throw new AnimationEngineError("SCENE_INVALID", parsed.error.message);
  let scene: ReturnType<typeof compilePreparedScene>;
  try {
    scene = compilePreparedScene(parsed.data);
  } catch (error) {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }
  const assetPaths: Record<string, string> = {};
  for (const asset of parsed.data.assets) {
    const path = resolve(dirname(absolute), asset.path);
    let image: Buffer;
    try {
      image = await readFile(path);
    } catch {
      throw new AnimationEngineError(
        "INPUT_UNREADABLE",
        `Cannot read asset ${asset.id}: ${path}`,
      );
    }
    if (hash(image) !== asset.sha256)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Asset checksum differs: ${asset.id}`,
      );
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(image);
    } catch {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Cannot decode asset ${asset.id}`,
      );
    }
    if (dimensions.width !== asset.width || dimensions.height !== asset.height)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Asset dimensions differ: ${asset.id}`,
      );
    assetPaths[asset.id] = path;
  }
  return {
    scene,
    assetPaths,
    sourceChecksum: hash(bytes),
  };
}

export class PreparedAnimationEngine {
  async animate(request: { scenePath: string; outputPath: string }) {
    const prepared = await loadPreparedScene(request.scenePath);
    const outputPath = resolve(request.outputPath);
    const sceneManifestPath = `${outputPath}.scene.json`;
    const resultPath = `${outputPath}.result.json`;
    for (const path of [outputPath, sceneManifestPath, resultPath]) {
      try {
        await stat(path);
        throw new AnimationEngineError(
          "SCENE_INVALID",
          `Output already exists: ${path}`,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const cinematic = prepared.scene.schemaVersion === "illustrated-scene-2";
    const manifest = {
      schemaVersion: cinematic
        ? "illustrated-render-2"
        : "illustrated-render-1",
      sourcePath: resolve(request.scenePath),
      sourceChecksum: prepared.sourceChecksum,
      scene: prepared.scene,
      assetPaths: prepared.assetPaths,
    };
    const manifestBytes = JSON.stringify(manifest, null, 2) + "\n";
    const metrics = await exportScene({
      scene: prepared.scene,
      sourcePath: resolve(request.scenePath),
      depthPath: null,
      assetPaths: prepared.assetPaths,
      outputPath,
      transport: "png_pipe",
    });
    await writeFile(sceneManifestPath, manifestBytes, { flag: "wx" });
    const resultSchema = cinematic
      ? CinematicAnimationResultSchema
      : PreparedAnimationResultSchema;
    const result = resultSchema.parse({
      schemaVersion: cinematic
        ? "illustrated-result-2"
        : "illustrated-result-1",
      status: "rendered",
      preset: prepared.scene.recipe.preset,
      fps: prepared.scene.fps,
      durationMs: prepared.scene.durationMs,
      frameCount: metrics.frameCount,
      outputPath,
      sceneManifestPath,
      checksums: {
        source: prepared.sourceChecksum,
        scene: hash(manifestBytes),
        output: hash(await readFile(outputPath)),
      },
      metrics,
      ...(prepared.scene.schemaVersion === "illustrated-scene-2"
        ? { cameraValidation: prepared.scene.cameraValidation }
        : {}),
    });
    await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
    });
    return result;
  }
}
