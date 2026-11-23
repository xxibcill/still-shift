import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCubeLut, type CubeLut } from "@still-shift/color-science";
import { lutAssetProblem, type Composition } from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

export type CompositionLutPreparation = {
  /** Absolute `.cube` paths by asset ID (served to the renderer). */
  assetPaths: Record<string, string>;
  /** Parsed tables by asset ID. */
  luts: Map<string, CubeLut>;
};

/**
 * CG5: read every `lut` asset, check its size and SHA-256, and parse it
 * before any rendering, so a missing, oversized, wrong-hash or malformed LUT
 * fails with a located diagnostic instead of mid-render.
 */
export async function prepareCompositionLuts(
  composition: Pick<Composition, "assets">,
  baseDirectory: string,
): Promise<CompositionLutPreparation> {
  const assetPaths: Record<string, string> = {};
  const luts = new Map<string, CubeLut>();
  for (const [index, asset] of composition.assets.entries()) {
    if (asset.type !== "lut") continue;
    const at = { path: `assets.${index}` };
    const path = resolve(baseDirectory, asset.path);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      passageError(
        "comp-lut-unreadable",
        `Cannot read LUT ${asset.id}: ${path}`,
        at,
      );
    }
    const tooLarge = lutAssetProblem(asset, size);
    if (tooLarge) passageError(tooLarge.code, tooLarge.message, at);
    const bytes = await readFile(path);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const problem = lutAssetProblem(asset, bytes.byteLength, digest);
    if (problem)
      passageError(problem.code, problem.message, {
        path: `assets.${index}${problem.code === "comp-lut-checksum" ? ".sha256" : ""}`,
      });
    try {
      luts.set(asset.id, parseCubeLut(bytes.toString("utf8")));
    } catch (error) {
      passageError(
        "comp-lut-invalid",
        `LUT ${asset.id}: ${(error as Error).message}`,
        at,
      );
    }
    assetPaths[asset.id] = path;
  }
  return { assetPaths, luts };
}
