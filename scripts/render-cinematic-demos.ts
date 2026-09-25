import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import {
  CinematicAnimationResultSchema,
  CinematicSceneSchema,
} from "../packages/scene-contract/src/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
} from "../packages/renderer-core/src/cinematic-scene.ts";

const run = promisify(execFile);
const at = process.argv.indexOf("--output-dir");
if (at < 0 || !process.argv[at + 1])
  throw new Error("Pass --output-dir with a new review directory");
const output = resolve(process.argv[at + 1]!);
await mkdir(output, { recursive: true });
const fixture = resolve("benchmarks/fixtures/cinematic-illustrated");
const catalog = JSON.parse(
  await readFile(join(fixture, "catalog.json"), "utf8"),
) as { id: string; title: string; description: string }[];
const standard = CinematicSceneSchema.parse(
  JSON.parse(await readFile(join(fixture, `${catalog[0]!.id}.json`), "utf8")),
);
standard.recipe.intensity = "standard";
for (const asset of standard.assets) asset.path = resolve(fixture, asset.path);
if (standard.provenance)
  standard.provenance = resolve(fixture, standard.provenance);
const standardPath = join(output, "standard.input.json");
await writeFile(standardPath, JSON.stringify(standard, null, 2) + "\n");
const standardEntry = {
  id: "ci-09-layered-parallax-standard",
  title: "Original · Standard",
  description:
    "The original gentle treatment of the same artwork and duration.",
  scenePath: standardPath,
};
const entries = [
  ...catalog.map((entry) => ({
    ...entry,
    scenePath: join(fixture, `${entry.id}.json`),
  })),
  standardEntry,
];
const results = [];
const motion = [];
for (const entry of entries) {
  const scene = compileCinematicScene(
    CinematicSceneSchema.parse(
      JSON.parse(await readFile(entry.scenePath, "utf8")),
    ),
  );
  const foreground = scene.nodes.find(
    (node) => node.id === scene.recipe.foreground,
  )!;
  const positions = Array.from(
    { length: scene.timeline.frameCount },
    (_, frame) => projectCinematicNode(scene, foreground, frame).left,
  );
  motion.push({
    id: entry.id,
    intensity: scene.recipe.intensity,
    foregroundTravelPx: scene.cameraValidation.foregroundTravelPx,
    backgroundTravelPx: scene.cameraValidation.backgroundTravelPx,
    foregroundPeakSpeedPxPerSecond: Math.max(
      ...positions
        .slice(1)
        .map((x, i) => Math.abs(x - positions[i]!) * scene.fps),
    ),
    motionStartSeconds: scene.cameraFrames[1]!.frame / scene.fps,
    motionEndSeconds: scene.cameraFrames[2]!.frame / scene.fps,
    minimumCoverageMargin: scene.cameraValidation.minimumCoverageMargin,
  });
  const video = join(output, `${entry.id}.mp4`);
  const { stdout } = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "animate-scene",
      "--scene",
      entry.scenePath,
      "--output",
      video,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const result = CinematicAnimationResultSchema.parse(JSON.parse(stdout));
  results.push(result);
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    video,
    "-vf",
    "select=eq(n\\,84)",
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
    "fps=4,scale=480:270,tile=4x7",
    "-frames:v",
    "1",
    join(output, `${entry.id}-motion.jpg`),
  ]);
  console.log(
    `${entry.title}: ${result.frameCount} frames; ${(result.metrics.totalWallMs / 1000).toFixed(2)} s render`,
  );
}
await writeFile(
  join(output, "render-summary.json"),
  JSON.stringify(
    {
      version: "cinematic-review-2",
      primary: `${entries[0]!.id}.mp4`,
      motion,
      results,
    },
    null,
    2,
  ) + "\n",
);
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const video = (entry: typeof standardEntry, label: string, compare = false) =>
  `<section><h2>${escape(label)}</h2><video ${compare ? 'class="compare"' : ""} controls muted playsinline preload="auto" poster="${entry.id}.png" src="${entry.id}.mp4"></video><p>${escape(entry.description)}</p></section>`;
const videos = `<div class="comparison">${video(standardEntry, "Original · Standard", true)}${video(entries[0]!, "New · Dramatic", true)}</div><details><summary>Alternate composition</summary>${video(entries[1]!, entries[1]!.title)}</details>`;
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Still Shift · Dramatic Parallax</title><style>*{box-sizing:border-box}body{margin:0;background:#171913;color:#e8dfc9;font:16px system-ui,sans-serif}main{max-width:1700px;margin:auto;padding:44px 30px}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:clamp(36px,5vw,68px);margin:12px 0}h2{font-size:26px}p{line-height:1.6;max-width:800px;color:#b8bca9}.eyebrow{color:#c0aa78;font-size:12px;letter-spacing:.14em;text-transform:uppercase}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px}section{margin-top:24px}video{display:block;width:100%;aspect-ratio:16/9;background:#211f1b}button{font:inherit;background:#d3ba85;color:#171913;border:0;padding:12px 18px;cursor:pointer;margin-right:8px}details{margin-top:32px}summary{cursor:pointer}footer{margin-top:40px;padding-top:18px;border-top:1px solid #404535}a{color:#c1d1aa}@media(max-width:900px){.comparison{grid-template-columns:1fr}main{padding:24px 12px}}</style></head><body><main><p class="eyebrow">Still Shift / Layered Parallax</p><h1>A heavier camera move.</h1><p>The same artwork and seven-second shot. Dramatic starts sooner, carries the doorway farther, and slows gradually into its final framing.</p><p>1920×1080 · 24 fps · original illustrated scene</p><button id="play-both">Play both from start</button><button id="pause-both">Pause both</button>${videos}<footer><p>The alternate composition changes depth spacing and camera direction using the same artwork. Standard and Restrained remain available in the lab.</p></footer></main><script>const clips=[...document.querySelectorAll('video.compare')];document.querySelector('#play-both').onclick=async()=>{for(const clip of clips){clip.pause();clip.currentTime=0;}await Promise.all(clips.map(clip=>clip.play()));};document.querySelector('#pause-both').onclick=()=>clips.forEach(clip=>clip.pause());</script></body></html>`,
);
console.log(`Review gallery: ${join(output, "index.html")}`);
