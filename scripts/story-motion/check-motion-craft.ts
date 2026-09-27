import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { analyzeMotionCraft } from "../../packages/renderer-core/src/story-continuous-quality.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { measureSceneLayerEnergy } from "./motion-craft-energy.ts";

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string" },
    "allow-current-assets": { type: "boolean", default: false },
    "baseline-root": { type: "string", default: "benchmarks/results" },
  },
});
assert.ok(values["output-dir"], "Pass --output-dir <new directory>");
const output = resolve(values["output-dir"]);
await mkdir(output);
const reports = [];
for (const name of [
  "buffer-press",
  "buffer-press-accelerate",
  "intent-presets",
  "supply-ramps",
]) {
  const path = resolve(`benchmarks/fixtures/motion-craft/${name}.json`);
  const { scene } = await loadPreparedScene(path);
  if (scene.schemaVersion !== "story-scene-1")
    throw new Error("Story expected");
  const pixels = await measureSceneLayerEnergy(path);
  const diagnostics = analyzeMotionCraft(scene, pixels);
  const continuous = analyzeStoryQuality(scene, { preset: "continuous" });
  if (name === "intent-presets")
    assert.deepEqual(
      diagnostics,
      [],
      "Intent preset acceptance must have no craft warnings",
    );
  const report = {
    name,
    rendererVersion: scene.rendererVersion,
    diagnostics,
    continuous,
    pixels,
  };
  reports.push({ name, diagnostics, continuous: continuous.diagnostics });
  await writeFile(
    join(output, `${name}.json`),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    `${name}: ${scene.frameCount} frames measured; ${diagnostics.length} craft findings`,
  );
}
for (const [directory, name] of [
  ["story-motion-v013", "relationship-build"],
  ["story-motion-v013", "motif-resolve"],
  ["story-motion-v014-proto-g", "unequal-margins"],
]) {
  const file = join(
    values["baseline-root"]!,
    directory!,
    `${name}.mp4.scene.json`,
  );
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const scene = StorySceneSchema.parse(
    Object.fromEntries(
      Object.entries(manifest.scene).filter(([key]) =>
        Object.hasOwn(StorySceneSchema.shape, key),
      ),
    ),
  );
  const assetChanges: { id: string; expected: string; actual: string }[] = [];
  for (const asset of [...scene.assets, ...(scene.fonts ?? [])]) {
    asset.path = manifest.assetPaths[asset.id];
    const actual =
      "sha256:" +
      createHash("sha256")
        .update(await readFile(asset.path))
        .digest("hex");
    if (actual !== asset.sha256) {
      assetChanges.push({ id: asset.id, expected: asset.sha256, actual });
      assert.ok(
        values["allow-current-assets"],
        "Historical asset differs; explicitly pass --allow-current-assets to measure current artwork and record the drift",
      );
      asset.sha256 = actual;
    }
  }
  const path = join(output, `${directory}-${name}.scene.json`);
  await writeFile(path, JSON.stringify(scene, null, 2) + "\n", { flag: "wx" });
  const loaded = await loadPreparedScene(path);
  if (loaded.scene.schemaVersion !== "story-scene-1")
    throw new Error("Story expected");
  let pixels;
  let pixelLimitation: string | undefined;
  if (directory === "story-motion-v014-proto-g") {
    try {
      pixels = await measureSceneLayerEnergy(path);
    } catch (error) {
      pixelLimitation = String(error);
    }
  }
  const diagnostics = analyzeMotionCraft(loaded.scene, pixels);
  if (directory === "story-motion-v013")
    assert.ok(
      diagnostics.some((d) => d.code === "entrance-pop"),
      "Expected known v013 entrance pop",
    );
  const report = {
    name: `${directory}/${name}`,
    diagnostics,
    pixels,
    assetChanges,
    pixelLimitation,
  };
  reports.push(report);
  await writeFile(
    join(output, `${directory}-${name}.json`),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(`${directory}/${name}: ${diagnostics.length} craft findings`);
}
await writeFile(
  join(output, "report.json"),
  JSON.stringify(reports, null, 2) + "\n",
  { flag: "wx" },
);
