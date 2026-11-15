// Footage-free copies of the 2026-11-15 proof's pass-1 compositions
// (research/editorial-typography-proof/pass1/*.composition.json).
//
// The pass-1 exports reference the git-ignored local clip
// benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4.
// Checks that concern the title layers alone (framing, decorations, glyph
// drawing) drop the clip's asset and layer, and rewrite every remaining asset
// path to an absolute regular file, because JSON inputs take only regular
// files. Title layers, timing and animators are unchanged.
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Composition } from "@still-shift/scene-contract";

export const PASS1_TREATMENTS = [
  "t1-editorial-stack",
  "t2-thai-condensed-poster",
  "t3-minimal-centered",
] as const;
export type Pass1Treatment = (typeof PASS1_TREATMENTS)[number];

const pass1 = fileURLToPath(
  new URL("../../research/editorial-typography-proof/pass1/", import.meta.url),
);

/** Load a pass-1 composition without its video, with absolute asset paths. */
export async function footageFreePass1(name: Pass1Treatment) {
  const source = join(pass1, `${name}.composition.json`);
  const composition = JSON.parse(await readFile(source, "utf8")) as Composition;
  const footage = new Set(
    composition.assets
      .filter((asset) => asset.type === "video")
      .map((asset) => asset.id),
  );
  composition.assets = await Promise.all(
    composition.assets
      .filter((asset) => !footage.has(asset.id))
      .map(async (asset) => ({
        ...asset,
        path: await realpath(resolve(dirname(source), asset.path)),
      })),
  );
  composition.layers = composition.layers.filter(
    (layer) => !(layer.type === "video" && footage.has(layer.asset)),
  );
  return composition;
}

/** Write the footage-free copy into `directory` and return its path. */
export async function writeFootageFreePass1(
  directory: string,
  name: Pass1Treatment,
) {
  const path = join(directory, `${name}.composition.json`);
  await writeFile(path, JSON.stringify(await footageFreePass1(name)));
  return path;
}
