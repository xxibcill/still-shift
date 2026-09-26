import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { measureMotionEnergy } from "./motion-energy.ts";

// The reconciled §0 baseline uses a 480×270 comparison: pixels differ by >6
// grey levels, and a frame moves when at least 7 such pixels differ. The
// original one-pixel rule also counted isolated changes in static frames.
const baselineMovingPercent: Record<string, number> = {
  "unequal-margins": 27,
  "access-constraint": 34,
  "relationship-build": 42,
  "evidence-boundary": 33,
  "dated-system-break": 17,
  "category-swap": 2,
  "motif-resolve": 47,
};
const baselineTolerancePoints = 2;

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string" },
    baseline: {
      type: "string",
      default: "benchmarks/results/story-motion-v012",
    },
  },
});
if (!values["output-dir"])
  throw new Error("Pass a new --output-dir for calibration");
const output = resolve(values["output-dir"]);
await mkdir(output);
const video = join(output, "pan.mp4");
await new PreparedAnimationEngine().animate({
  scenePath: resolve("benchmarks/fixtures/story-motion-calibration/pan.json"),
  outputPath: video,
});
const pan = await measureMotionEnergy(video);
if (pan.movingShare !== 1)
  throw new Error("Half-pixel pan did not measure continuous motion");
const entries = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
) as { id: string }[];
const catalogIds = new Set(entries.map(({ id }) => id));
if (
  catalogIds.size !== entries.length ||
  catalogIds.size !== Object.keys(baselineMovingPercent).length ||
  Object.keys(baselineMovingPercent).some((id) => !catalogIds.has(id))
)
  throw new Error("P0 calibration requires the seven v012 study clips");
const clips = [];
for (const { id } of entries) {
  const path = join(values.baseline!, `${id}.mp4`);
  const expectedMovingPercent = baselineMovingPercent[id];
  if (expectedMovingPercent === undefined)
    throw new Error(`No v012 baseline moving share for ${id}`);
  const energy = await measureMotionEnergy(path);
  const legacy = await measureMotionEnergy(path, {
    width: 480,
    height: 270,
    pixelThreshold: 6,
    minimumChangedPixels: 7,
  });
  const measuredMovingPercent = legacy.movingShare * 100;
  const differencePoints = Math.abs(
    measuredMovingPercent - expectedMovingPercent,
  );
  clips.push({
    id,
    sourceSha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    energy,
    legacy,
    baselineCheck: {
      expectedMovingPercent,
      measuredMovingPercent,
      differencePoints,
      tolerancePoints: baselineTolerancePoints,
      pass: differencePoints <= baselineTolerancePoints,
    },
  });
  console.log(
    `${id}: full ${Math.round(energy.movingShare * 100)}%, baseline ${measuredMovingPercent.toFixed(2)}% (expected ${expectedMovingPercent}%, Δ ${differencePoints.toFixed(2)} pp), frozen ${(legacy.longestFrozenRun / 24).toFixed(2)}s`,
  );
}
// The known final hold must remain frozen after lossy H.264 encoding.
const comparison = clips.find((clip) => clip.id === "unequal-margins")!.energy;
if (comparison.changedPixels.slice(150).some((count) => count >= 200))
  throw new Error(
    "Static tail falsely measures motion; recalibrate the threshold",
  );
const report = {
  calibration: {
    pan,
    staticTail: "Unequal Margins frames 150–191",
    pixelThreshold: 4,
    thresholdRaised: false,
    baselineMethod: {
      width: 480,
      height: 270,
      pixelThreshold: 6,
      minimumChangedPixels: 7,
      tolerancePoints: baselineTolerancePoints,
    },
  },
  clips,
};
await writeFile(
  join(output, "motion-energy.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
const failed = clips.filter((clip) => !clip.baselineCheck.pass);
if (failed.length)
  throw new Error(
    `v012 baseline moving shares exceed ±${baselineTolerancePoints} percentage points: ${failed.map((clip) => clip.id).join(", ")}`,
  );
