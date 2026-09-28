import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { promisify } from "node:util";
import { reviewProbeSize } from "./review-probe-size.ts";
import { OutputFormatSchema } from "../packages/scene-contract/src/output-format.ts";

const run = promisify(execFile);
const arg = process.argv.indexOf("--output-dir");
if (arg < 0 || !process.argv[arg + 1])
  throw new Error("Pass --output-dir with a new review directory");
const output = resolve(process.argv[arg + 1]!);
const formatArg = process.argv.indexOf("--format");
const format = OutputFormatSchema.parse(
  formatArg < 0 ? "landscape" : process.argv[formatArg + 1],
);
await mkdir(output, { recursive: true });
const fixture = resolve("benchmarks/fixtures/history-offstage-v2");
const catalog = JSON.parse(
  await readFile(join(fixture, "catalog.json"), "utf8"),
) as {
  id: string;
  title: string;
  description: string;
  formats?: { vertical?: string };
}[];
const entries =
  format === "vertical"
    ? catalog.filter((entry) => entry.formats?.vertical)
    : catalog;
if (entries.length === 0)
  throw new Error(`No illustrated scenes declare a ${format} variant`);
const results = [];
for (const entry of entries) {
  const target = join(output, `${entry.id}.mp4`);
  const source =
    format === "vertical" ? entry.formats!.vertical! : `${entry.id}.json`;
  const { stdout } = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "animate-scene",
      "--scene",
      join(fixture, source),
      "--output",
      target,
      ...(format === "vertical" ? ["--format", format] : []),
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout.trim());
  results.push(result);
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    target,
    "-vf",
    "select=eq(n\\,150)",
    "-frames:v",
    "1",
    join(output, `${entry.id}.png`),
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    target,
    "-vf",
    `fps=4,scale=${reviewProbeSize(result.metrics.width, result.metrics.height)},tile=4x7`,
    "-frames:v",
    "1",
    join(output, `${entry.id}-motion.jpg`),
  ]);
  console.log(
    `${entry.title}: ${result.frameCount} frames, ${(result.metrics.totalWallMs / 1000).toFixed(2)} s render`,
  );
}
const concat = join(output, "reel-inputs.txt");
await writeFile(
  concat,
  entries.map((entry) => `file '${entry.id}.mp4'`).join("\n") + "\n",
);
await run("ffmpeg", [
  "-v",
  "error",
  "-f",
  "concat",
  "-safe",
  "1",
  "-i",
  concat,
  "-c",
  "copy",
  "-movflags",
  "+faststart",
  join(output, "history-offstage-motion-reel.mp4"),
]);
await writeFile(
  join(output, "render-summary.json"),
  JSON.stringify(
    {
      version: "illustrated-review-1",
      clips: results.length,
      frameCount: results.reduce((sum, r) => sum + r.frameCount, 0),
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      renderWallMs: results.reduce((sum, r) => sum + r.metrics.totalWallMs, 0),
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
const cards = entries
  .map(
    (entry, i) =>
      `<article><p class="number">${String(i + 1).padStart(2, "0")} / ${String(entries.length).padStart(2, "0")}</p><h2>${escape(entry.title)}</h2><p>${escape(entry.description)}</p><video controls muted playsinline preload="metadata" poster="${entry.id}.png" src="${entry.id}.mp4"></video></article>`,
  )
  .join("\n");
const guide = relative(output, resolve("docs/history-offstage-motion-plan.md"));
const video = results[0]!;
const aspect = `${video.metrics.width}/${video.metrics.height}`;
const heroDuration = Math.round(
  results.reduce((sum, result) => sum + result.durationMs, 0) / 1000,
);
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Still Shift · History Offstage motion</title><style>:root{color:#eee8d9;background:#211f1b;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:44px 32px}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:clamp(36px,5vw,68px);margin:12px 0}h2{font-size:30px;margin:8px 0}p{line-height:1.55;color:#c8c0ac;max-width:850px}.eyebrow,.number{font-size:12px;letter-spacing:.14em;color:#cba764;text-transform:uppercase}.hero{margin:32px 0 54px}video{display:block;width:100%;max-width:${format === "vertical" ? "420px" : "none"};aspect-ratio:${aspect};background:#e8dfc9;border:1px solid #625f51}.grid{display:grid;grid-template-columns:1fr 1fr;gap:42px 30px}article>p{min-height:48px}article>.number{min-height:0}a{color:#c6d3ad}footer{border-top:1px solid #585345;margin-top:50px;padding:24px 0}@media(max-width:850px){main{padding:24px 14px}.grid{grid-template-columns:1fr}}</style></head><body><main><p class="eyebrow">Still Shift / History Offstage / motion study 02</p><h1>${format === "vertical" ? "Portrait layered reveal." : "Six ways to explain a change."}</h1><p>${format === "vertical" ? "A resolved 9:16 illustrated scene with authored node placement." : "Layers reveal a relationship. Resources follow a path. A restriction stops progress. A comparison develops. A prop changes state. A system fractures."}</p><section class="hero"><video controls playsinline preload="metadata" poster="${entries[0]!.id}.png" src="history-offstage-motion-reel.mp4"></video><p>${heroDuration} seconds · ${entries.length} clip${entries.length === 1 ? "" : "s"} · ${video.metrics.width}×${video.metrics.height} / ${video.fps} fps · silent creative proof</p></section><div class="grid">${cards}</div><footer><p>Original illustration assets prepared for this study. The examples are schematic; they make no historical quantity or date claims. Creative acceptance and the Phase 0 corpus gates remain open.</p><a href="${guide}">Analysis and build plan</a></footer></main></body></html>`,
);
console.log(`Review reel and gallery: ${output}`);
