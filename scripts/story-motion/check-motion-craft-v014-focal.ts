import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { analyzeMotionCraft } from "../../packages/renderer-core/src/story-continuous-quality.ts";
import { measureSceneLayerEnergy } from "./motion-craft-energy.ts";
import { sha256File } from "./historical-video.ts";

const { values } = parseArgs({
  options: {
    "replay-dir": { type: "string" },
    "output-report": { type: "string" },
    "engine-label": { type: "string" },
  },
});
assert.ok(values["replay-dir"] && values["output-report"]);
const sourcePath = resolve(
  values["replay-dir"],
  "opted-in-current-engine.json",
);
const source = StorySceneSchema.parse(
  JSON.parse(await readFile(sourcePath, "utf8")),
);
assert.equal(source.recipe.preset, "unequal_margins");
assert.equal(source.frameCount, 192);
assert.deepEqual(
  source.recipe.emphasis.map((item) => item.node),
  ["house-a-art"],
);

const temporary = await mkdtemp(join(tmpdir(), "motion-craft-v014-focal-"));
async function inspect(
  name: string,
  focal: { node: string; property: "x" | "scaleX"; cue: string },
  withoutFade = false,
  comparisonFrame?: number,
) {
  const scene = StorySceneSchema.parse({
    ...source,
    review: { ...source.review, focalEvents: [focal] },
    recipe: {
      ...source.recipe,
      emphasis: withoutFade ? [] : source.recipe.emphasis,
    },
  });
  const path = join(temporary, `${name}.json`);
  await writeFile(path, JSON.stringify(scene));
  const pixels = await measureSceneLayerEnergy(path);
  const peak = pixels.total.indexOf(Math.max(...pixels.total));
  const frame = comparisonFrame ?? peak;
  const warning = analyzeMotionCraft(compileStoryScene(scene), pixels).find(
    (item) => item.code === "peak-not-story",
  );
  return {
    peak,
    total: pixels.total[peak]!,
    comparisonFrame: frame,
    totalAtComparisonFrame: pixels.total[frame]!,
    focalAtComparisonFrame: pixels.focal!.contribution[frame]!,
    remainderAtComparisonFrame: pixels.focal!.remainder[frame]!,
    responseAtComparisonFrame: pixels.layers.response[frame]!,
    warning: warning ?? null,
  };
}

let margin, pressure, noFade;
try {
  margin = await inspect("margin", {
    node: "margin-b",
    property: "scaleX",
    cue: "less-room-remains",
  });
  pressure = await inspect("pressure", {
    node: "pressure-b",
    property: "x",
    cue: "shared-strain",
  });
  noFade = await inspect(
    "margin-no-fade",
    { node: "margin-b", property: "scaleX", cue: "less-room-remains" },
    true,
    margin.peak,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const fadeCounterfactualAtPeak =
  margin.totalAtComparisonFrame - noFade.totalAtComparisonFrame;
const report = {
  schemaVersion: "motion-craft-v014-focal-1",
  sourcePath,
  sourceSha256: await sha256File(sourcePath),
  engine:
    values["engine-label"] ??
    "current renderer with pinned v014-g composition and art",
  margin,
  pressure,
  withoutHouseArtFade: noFade,
  fadeCounterfactualAtPeak,
  interpretation:
    "The archived house-a-art opacity emphasis contributes more peak-frame pixel change than the thin-margin focal motion, while the house-b response also dominates; the fade is not the sole cause.",
};
await writeFile(
  resolve(values["output-report"]!),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  `v014-g focal peak ${margin.peak}: margin ${margin.focalAtComparisonFrame}, other ${margin.remainderAtComparisonFrame}, fade counterfactual ${fadeCounterfactualAtPeak}; peak-not-story ${!!margin.warning}`,
);
assert.ok(margin.warning && pressure.warning);
assert.equal(margin.peak, pressure.peak);
assert.ok(fadeCounterfactualAtPeak > margin.focalAtComparisonFrame);
