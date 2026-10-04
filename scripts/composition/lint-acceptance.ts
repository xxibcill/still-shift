import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { StorySceneSchema } from "@still-shift/scene-contract";
import {
  compileStoryComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import { analyzeCompositionQuality } from "@still-shift/renderer-core";
import { measureMotionEnergy } from "../story-motion/motion-energy.ts";

const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || !process.argv[outputIndex + 1])
  throw new Error("Pass --output <new-report.json>");
const directory = await mkdtemp(join(tmpdir(), "still-shift-ce12-acceptance-"));
const source = resolve(
  "benchmarks/fixtures/story-motion-continuous/unequal-margins.json",
);
const comp = await compileStoryComposition(
  StorySceneSchema.parse(JSON.parse(await readFile(source, "utf8"))),
  dirname(source),
);
comp.assets = comp.assets.map((asset) => ({
  ...asset,
  path: resolve(dirname(source), asset.path),
}));
const compPath = join(directory, "continuous.json");
await writeFile(compPath, JSON.stringify(comp));
const video = join(directory, "continuous.mp4");
await renderComposition({ compositionPath: compPath, outputPath: video });
console.log(
  "Rendered continuous Unequal Margins prototype with pinned Canvas export.",
);
const oldVideo = resolve("docs/review/story-motion-v013/unequal-margins.mp4");
const oldEnergy = await measureMotionEnergy(oldVideo);
const continuousEnergy = await measureMotionEnergy(video);
const oldComp = await compileStoryComposition(
  StorySceneSchema.parse(
    JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-motion/unequal-margins.json",
        "utf8",
      ),
    ),
  ),
  resolve("benchmarks/fixtures/story-motion"),
);
assert.equal(oldEnergy.changedPixels.length, oldComp.frameCount);
assert.equal(continuousEnergy.changedPixels.length, comp.frameCount);
const oldReport = analyzeCompositionQuality(oldComp, {
  pixelChangedCounts: oldEnergy.changedPixels,
});
const continuousReport = analyzeCompositionQuality(comp, {
  pixelChangedCounts: continuousEnergy.changedPixels,
});
assert.ok(
  oldReport.diagnostics.some((d) => d.code === "frozen-pixels"),
  "v013 review render must fail pixel stillness",
);
assert.ok(
  !continuousReport.diagnostics.some(
    (d) => d.code === "frozen-pixels" || d.code === "frozen-run",
  ),
  "continuous prototype must pass both stillness checks",
);
const result = {
  date: "2026-10-04",
  version: "composition-ce12-stillness-acceptance-1",
  directory,
  baselineVideo: oldVideo,
  continuousVideo: video,
  thresholds: {
    grayscaleDelta: 4,
    minimumChangedPixels: 200,
    maxFrozenFrames: 6,
  },
  old: { frameCount: oldComp.frameCount, energy: oldEnergy, lint: oldReport },
  continuous: {
    frameCount: comp.frameCount,
    energy: continuousEnergy,
    lint: continuousReport,
  },
  note: "Stillness acceptance only; other craft warnings/errors are retained, not waived. No creative approval or source fixture changes.",
};
await writeFile(
  resolve(process.argv[outputIndex + 1]!),
  JSON.stringify(result, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    oldFrozenFrames: oldEnergy.longestFrozenRun,
    continuousFrozenFrames: continuousEnergy.longestFrozenRun,
    continuousStateFrozen: continuousReport.diagnostics.some(
      (d) => d.code === "frozen-run",
    ),
    directory,
  }),
);
