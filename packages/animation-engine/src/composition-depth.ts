import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import {
  AnimationEngineError,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import {
  depthToComposition,
  compositionScene,
  type PreviewScene,
  type DepthCompositionOptions,
} from "@still-shift/renderer-core";

type DepthExportOptions = Pick<
  DepthCompositionOptions,
  "id" | "requestedPreset" | "requestedIntensity" | "originalSourceHash"
> & {
  sourcePath: string;
  depthPath: string | null;
  expectedSourceHash?: string;
  expectedDepthHash?: string;
};

/** The existing worker owns preparation; this function only verifies and adapts its files. */
export async function prepareDepthExportComposition(
  scene: PreviewScene,
  options: DepthExportOptions,
) {
  const assetPaths: Record<string, string> = {};
  const readAsset = async (
    id: string,
    input: string,
    expectedHash?: string,
  ): Promise<Extract<CompositionAsset, { type: "image" }>> => {
    const path = resolve(input);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (cause) {
      throw new AnimationEngineError(
        "INPUT_UNREADABLE",
        `Prepared depth composition asset unavailable: ${id}`,
        { path },
        { cause },
      );
    }
    const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (expectedHash !== undefined && sha256 !== expectedHash)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Prepared depth composition asset changed: ${id}`,
        { path },
      );
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(bytes);
    } catch (cause) {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Prepared depth composition image is invalid: ${id}`,
        { path },
        { cause },
      );
    }
    assetPaths[id] = path;
    return {
      id,
      type: "image",
      // The captured document identifies bytes independently of cache location.
      // The export binding below owns their verified physical paths.
      path: `prepared/${id}/${sha256.slice("sha256:".length)}`,
      sha256,
      width: dimensions.width,
      height: dimensions.height,
    };
  };
  const source = await readAsset(
      "source",
      options.sourcePath,
      options.expectedSourceHash,
    ),
    depth =
      scene.motion.mode === "depth" && options.depthPath
        ? await readAsset("depth", options.depthPath, options.expectedDepthHash)
        : undefined,
    composition = depthToComposition(scene, {
      ...(options.id ? { id: options.id } : {}),
      ...(options.requestedPreset
        ? { requestedPreset: options.requestedPreset }
        : {}),
      ...(options.requestedIntensity
        ? { requestedIntensity: options.requestedIntensity }
        : {}),
      ...(options.originalSourceHash
        ? { originalSourceHash: options.originalSourceHash }
        : {}),
      source,
      ...(depth ? { depth } : {}),
    });
  return {
    composition,
    scene: compositionScene(composition, "webgl2"),
    assetPaths,
  };
}
