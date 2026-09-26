import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { measureMotionEnergy } from "./motion-energy.ts";

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
const clips = [];
for (const { id } of entries) {
  const path = join(values.baseline!, `${id}.mp4`);
  const energy = await measureMotionEnergy(path);
  const legacy = await measureMotionEnergy(path, {
    width: 480,
    height: 270,
    pixelThreshold: 6,
    minimumChangedPixels: 1,
  });
  clips.push({ id, energy, legacy });
  console.log(
    `${id}: full ${Math.round(energy.movingShare * 100)}%, legacy ${Math.round(legacy.movingShare * 100)}%, frozen ${(legacy.longestFrozenRun / 24).toFixed(2)}s`,
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
  },
  clips,
};
await writeFile(
  join(output, "motion-energy.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
