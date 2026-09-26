import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify, parseArgs } from "node:util";
import {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "../packages/animation-engine/src/prepared-animation-engine.ts";
import { evaluatePreparedNode } from "../packages/renderer-core/src/prepared-scene.ts";

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
    "select=eq(n\\,166)",
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
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Still Shift · Seven story motions</title><style>body{margin:0;background:#202822;color:#efe6d4;font:17px system-ui}main{max-width:1450px;margin:auto;padding:35px 24px}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:52px}p{color:#c5c9b7;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:32px}video{display:block;width:100%;aspect-ratio:16/9}a{color:#c9b177}article p{min-height:52px}</style><main><p>STILL SHIFT / STORY MOTION</p><h1>Seven ways to develop an explanation.</h1><p>Eight-second illustrated fixtures · 1080p / 24 fps · silent prototypes. These demonstrate reusable recipes, not completed S01E01 shots.</p><div class="grid">${entries.map((entry) => `<article><h2>${escape(entry.title)}</h2><p>${escape(entry.description)}</p><video controls muted playsinline preload="metadata" poster="${entry.id}.png" src="${entry.id}.mp4"></video><p><a href="${entry.id}-motion.jpg">Motion intervals</a> · <a href="${entry.id}.handoff.json">Frame handoff</a></p></article>`).join("")}</div></main></html>`,
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
