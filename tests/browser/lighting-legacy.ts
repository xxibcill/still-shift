import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { StorySceneSchema } from "@still-shift/scene-contract";
import { storyToComposition } from "@still-shift/renderer-core";
import type { Page } from "playwright";
import { cameraPreview } from "./camera-preview.ts";

/** Active lights cannot change existing adapter output, whose receivers are implicit off. */
export async function lightingLegacyAcceptance(page: Page, root: string) {
  const path = join(
      root,
      "benchmarks/fixtures/story-motion-continuous/access-constraint.json",
    ),
    doc = storyToComposition(
      StorySceneSchema.parse(JSON.parse(await readFile(path, "utf8"))),
    ),
    lit = structuredClone(doc),
    frames = [0, Math.floor(doc.frameCount / 2), doc.frameCount - 1, 0],
    assets = Object.fromEntries(
      doc.assets.map((asset) => [
        asset.id,
        "/" + relative(root, resolve(dirname(path), asset.path)),
      ]),
    );
  lit.layers.unshift({
    id: "ce8l-legacy-light",
    type: "light",
    lightType: "ambient",
    color: "#ff0000",
    intensity: 16,
  });
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const plain = await cameraPreview(page, doc, assets, backend, frames),
      illuminated = await cameraPreview(page, lit, assets, backend, frames);
    assert.deepEqual(
      illuminated.hashes,
      plain.hashes,
      `${backend}: implicit-unlit story adapter changed under active lighting`,
    );
    reports.push({
      backend,
      frames: frames.length,
      identity: "byte-identical",
      hashes: plain.hashes,
    });
  }
  return { source: "story-motion-continuous/access-constraint.json", reports };
}
