import {
  measureMotionEnergy,
  requireContinuousEnergy,
} from "./story-motion/motion-energy.ts";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify, parseArgs } from "node:util";
import {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "../packages/animation-engine/src/prepared-animation-engine.ts";
import { storyGallery, storyContactSheet } from "./story-motion/gallery.ts";
import { evaluatePreparedNode } from "../packages/renderer-core/src/prepared-scene.ts";
import { analyzeStoryQuality } from "../packages/renderer-core/src/story-quality.ts";

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string" },
    "fixtures-dir": {
      type: "string",
      default: "benchmarks/fixtures/story-motion",
    },
    "require-continuous-motion": { type: "boolean", default: false },
  },
  strict: true,
});
if (!values["output-dir"])
  throw new Error("Pass --output-dir <new review directory>");
const output = resolve(values["output-dir"]);
await mkdir(output);
const fixtureDirectory = resolve(values["fixtures-dir"]);
const run = promisify(execFile);
const entries = JSON.parse(
  await readFile(join(fixtureDirectory, "catalog.json"), "utf8"),
) as { id: string; title: string; description: string }[];
const results = [];
const quality = [];
const energies = [];
const failures: string[] = [];
for (const entry of entries) {
  const scenePath = join(fixtureDirectory, `${entry.id}.json`);
  const video = join(output, `${entry.id}.mp4`);
  const result = await new PreparedAnimationEngine().animate({
    scenePath,
    outputPath: video,
  });
  results.push(result);
  const { scene } = await loadPreparedScene(scenePath);
  if (scene.schemaVersion === "story-scene-1") {
    const report = analyzeStoryQuality(
      scene,
      values["require-continuous-motion"] || scene.motionGrammar
        ? { preset: "continuous" }
        : {},
    );
    quality.push({
      id: entry.id,
      sourceChecksum: result.checksums.source,
      ...report,
    });
    if (
      values["require-continuous-motion"] &&
      report.diagnostics.some((d) =>
        ["semantic-gap", "text-velocity"].includes(d.code),
      )
    )
      failures.push(`${entry.id}: compiled continuous gates fail`);
  }
  const energy = await measureMotionEnergy(video);
  energies.push({ id: entry.id, ...energy });
  await writeFile(
    join(output, `${entry.id}.motion-energy.json`),
    JSON.stringify(energy, null, 2) + "\n",
    { flag: "wx" },
  );
  if (values["require-continuous-motion"]) {
    try {
      requireContinuousEnergy(energy, entry.id);
    } catch (error) {
      failures.push(String(error));
    }
  }
  const poses = (frame: number) =>
    Object.fromEntries(
      scene.nodes.map((node) => [
        node.id,
        {
          parent: node.parent ?? null,
          pose: evaluatePreparedNode(scene, node, frame),
        },
      ]),
    );
  await writeFile(
    join(output, `${entry.id}.handoff.json`),
    JSON.stringify(
      {
        preset: scene.recipe.preset,
        frameCount: scene.timeline.frameCount,
        fps: scene.fps,
        recipe: scene.recipe,
        entry: poses(0),
        exit: poses(scene.timeline.frameCount - 1),
        sourceChecksum: result.checksums.source,
      },
      null,
      2,
    ) + "\n",
  );
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    video,
    "-vf",
    `select=eq(n\\,${entry.id === "dated-system-break" ? 112 : 166})`,
    "-frames:v",
    "1",
    join(output, `${entry.id}.png`),
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    video,
    "-vf",
    "fps=2,scale=480:270,tile=4x4",
    "-frames:v",
    "1",
    join(output, `${entry.id}-motion.jpg`),
  ]);
  console.log(
    `${entry.title}: ${result.frameCount} frames; ${(result.metrics.totalWallMs / 1000).toFixed(1)}s render`,
  );
}
if (entries.some((entry) => entry.id === "dated-system-break"))
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    join(output, "dated-system-break.mp4"),
    "-vf",
    "select=eq(n\\,166)",
    "-frames:v",
    "1",
    join(output, "dated-system-reset.png"),
  ]);
await writeFile(join(output, "index.html"), storyGallery(output, entries));
await writeFile(
  join(output, "quality-report.json"),
  JSON.stringify(quality, null, 2) + "\n",
);
await writeFile(
  join(output, "contact-sheet.html"),
  storyContactSheet(output, entries),
);
await writeFile(
  join(output, "render-summary.json"),
  JSON.stringify(
    {
      clips: results.length,
      frameCount: results.reduce((sum, result) => sum + result.frameCount, 0),
      results,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(output, "motion-energy.json"),
  JSON.stringify(energies, null, 2) + "\n",
  { flag: "wx" },
);
if (failures.length) throw new Error(failures.join("\n"));
console.log(`Story motion gallery: ${output}/index.html`);
