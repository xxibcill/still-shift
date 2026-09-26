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
  options: { "output-dir": { type: "string" } },
  strict: true,
});
if (!values["output-dir"])
  throw new Error("Pass --output-dir <new review directory>");
const output = resolve(values["output-dir"]);
await mkdir(output, { recursive: true });
const run = promisify(execFile);
const entries = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
) as { id: string; title: string; description: string }[];
const results = [];
const quality = [];
for (const entry of entries) {
  const scenePath = resolve(
    `benchmarks/fixtures/story-motion/${entry.id}.json`,
  );
  const video = join(output, `${entry.id}.mp4`);
  const result = await new PreparedAnimationEngine().animate({
    scenePath,
    outputPath: video,
  });
  results.push(result);
  const { scene } = await loadPreparedScene(scenePath);
  if (scene.schemaVersion === "story-scene-1")
    quality.push({
      id: entry.id,
      sourceChecksum: result.checksums.source,
      ...analyzeStoryQuality(scene),
    });
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
console.log(`Story motion gallery: ${output}/index.html`);
