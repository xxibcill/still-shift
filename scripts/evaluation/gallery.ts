import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  AnimationResultSchema,
  CorpusManifestSchema,
  SceneManifestSchema,
} from "@still-shift/scene-contract";

const execFileAsync = promisify(execFile);
const presets = ["slow_push", "horizontal_drift", "cinematic_float"] as const;
const arg = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || !value || value.startsWith("--"))
    throw new Error(`Missing ${name}`);
  return value;
};
const escapeHtml = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
const relativeUrl = (from: string, to: string): string =>
  relative(from, to)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const corpusPath = resolve(arg("--corpus"));
const resultsPath = resolve(arg("--results"));
const outputPath = resolve(arg("--output"));
const baselinesDir = process.argv.includes("--baselines-dir")
  ? resolve(arg("--baselines-dir"))
  : null;
const outputDir = dirname(outputPath);
const thumbnails = join(outputDir, "thumbnails");
const corpusBytes = await readFile(corpusPath);
const corpusSha256 = `sha256:${createHash("sha256").update(corpusBytes).digest("hex")}`;
const corpus = CorpusManifestSchema.parse(
  JSON.parse(corpusBytes.toString("utf8")),
);
const records = (await readFile(resultsPath, "utf8"))
  .trim()
  .split("\n")
  .map(
    (line) =>
      JSON.parse(line) as { id: string; result?: unknown; error?: unknown },
  );
const byId = new Map(records.map((record) => [record.id, record]));
await mkdir(thumbnails, { recursive: true });

const thumbnail = async (
  source: string,
  target: string,
  timeSeconds?: number,
): Promise<void> => {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...(timeSeconds === undefined ? [] : ["-ss", String(timeSeconds)]),
    "-i",
    source,
    "-vf",
    "scale=480:-2",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-y",
    target,
  ]);
};

const rows: string[] = [];
let clipCount = 0;
for (const entry of corpus.entries) {
  const sourcePath = resolve(dirname(corpusPath), entry.source.path);
  const sourceThumbnail = join(thumbnails, `${entry.id}-source.jpg`);
  await thumbnail(sourcePath, sourceThumbnail);
  const variants: string[] = [];
  let depthThumbnail: string | null = null;
  for (const preset of presets) {
    const id = `${entry.id}-${preset.replaceAll("_", "-")}`;
    const record = byId.get(id);
    if (!record?.result) {
      variants.push(
        `<section class="variant"><h4>${escapeHtml(preset)}</h4><p class="failed">Missing or failed: ${escapeHtml(JSON.stringify(record?.error ?? null))}</p></section>`,
      );
      continue;
    }
    const result = AnimationResultSchema.parse(record.result);
    const posterPath = join(thumbnails, `${id}-poster.jpg`);
    await thumbnail(result.outputPath, posterPath, result.durationMs / 2000);
    const scene = SceneManifestSchema.parse(
      JSON.parse(await readFile(result.sceneManifestPath, "utf8")),
    );
    if (!depthThumbnail && scene.depth?.asset) {
      depthThumbnail = join(thumbnails, `${entry.id}-depth.jpg`);
      await thumbnail(scene.depth.asset, depthThumbnail);
    }
    clipCount += 1;
    const metrics = result.metrics;
    const warnings =
      result.warnings.map((warning) => warning.code).join(", ") || "None";
    variants.push(`<section class="variant">
      <h4>${escapeHtml(preset)} <span class="status">${escapeHtml(result.status)}</span></h4>
      <video controls muted playsinline preload="metadata" poster="${escapeHtml(relativeUrl(outputDir, posterPath))}" src="${escapeHtml(relativeUrl(outputDir, result.outputPath))}"></video>
      <dl>
        <div><dt>Risk</dt><dd>${scene.quality.riskScore.toFixed(3)}</dd></div>
        <div><dt>Mode</dt><dd>${escapeHtml(scene.quality.fallback ? "2D fallback" : "depth")}</dd></div>
        <div><dt>Seed</dt><dd>${scene.motion.seed}</dd></div>
        <div><dt>Frames</dt><dd>${result.frameCount}</dd></div>
        <div><dt>Render</dt><dd>${metrics.totalWallMs.toFixed(0)} ms</dd></div>
        <div><dt>Size</dt><dd>${(metrics.outputBytes / 1e6).toFixed(2)} MB</dd></div>
        <div><dt>Cache</dt><dd>${escapeHtml(metrics.cacheStatus)}</dd></div>
        <div><dt>Warnings</dt><dd>${escapeHtml(warnings)}</dd></div>
      </dl>
      <div class="ratings" data-clip="${escapeHtml(id)}"></div>
    </section>`);
  }
  let baselineMarkup = "";
  if (baselinesDir) {
    const staticPath = join(baselinesDir, `${entry.id}-static.mp4`);
    const kenBurnsPath = join(baselinesDir, `${entry.id}-ken-burns.mp4`);
    const kenBurnsPoster = join(thumbnails, `${entry.id}-ken-burns.jpg`);
    await thumbnail(
      kenBurnsPath,
      kenBurnsPoster,
      entry.expectedShotDurationMs / 2000,
    );
    baselineMarkup = `<details class="baselines" style="margin-top:14px;color:#bcd4df"><summary style="cursor:pointer">Compare static and Ken Burns baselines</summary><div style="display:flex;gap:15px"><figure style="margin:12px 0;max-width:350px;width:50%"><video style="width:100%;aspect-ratio:16/9" controls muted playsinline preload="metadata" poster="${escapeHtml(relativeUrl(outputDir, sourceThumbnail))}" src="${escapeHtml(relativeUrl(outputDir, staticPath))}"></video><figcaption>Static image</figcaption></figure><figure style="margin:12px 0;max-width:350px;width:50%"><video style="width:100%;aspect-ratio:16/9" controls muted playsinline preload="metadata" poster="${escapeHtml(relativeUrl(outputDir, kenBurnsPoster))}" src="${escapeHtml(relativeUrl(outputDir, kenBurnsPath))}"></video><figcaption>Basic Ken Burns</figcaption></figure></div></details>`;
  }
  rows.push(`<article class="entry">
    <header><h3>${escapeHtml(entry.id)}</h3><p>${escapeHtml(entry.categories.join(" · "))} · ${entry.dimensions.width}×${entry.dimensions.height} · expected ${entry.expectedShotDurationMs / 1000}s</p></header>
    <div class="references"><figure><img src="${escapeHtml(relativeUrl(outputDir, sourceThumbnail))}" alt="Source ${escapeHtml(entry.id)}"><figcaption>Input</figcaption></figure>${depthThumbnail ? `<figure><img src="${escapeHtml(relativeUrl(outputDir, depthThumbnail))}" alt="Depth ${escapeHtml(entry.id)}"><figcaption>Depth</figcaption></figure>` : `<figure><div class="no-depth">No depth preview</div><figcaption>Depth</figcaption></figure>`}</div>
    <div class="variants">${variants.join("\n")}</div>${baselineMarkup}
  </article>`);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Still Shift evaluation · ${escapeHtml(corpus.corpusId)}</title>
<style>
:root{font-family:system-ui,sans-serif;color:#e8e9ec;background:#11151c}*{box-sizing:border-box}body{margin:0}main{max-width:1600px;margin:auto;padding:28px}h1{margin:0 0 8px}p{line-height:1.45;color:#aeb9c9}.notice{padding:12px 16px;border:1px solid #866d2b;background:#302716;color:#f2d88e;border-radius:8px}.toolbar{display:flex;gap:12px;align-items:center;margin:20px 0;flex-wrap:wrap}button,input,select{font:inherit}button{background:#73b9c9;border:0;border-radius:7px;padding:10px 14px;cursor:pointer}input,select{background:#202935;color:#f4f6f8;border:1px solid #536273;border-radius:5px;padding:6px}label{font-size:13px;color:#c7d1dc}.entry{border-top:1px solid #3c4652;padding:22px 0}.entry header{display:flex;gap:20px;align-items:baseline;flex-wrap:wrap}.entry h3{margin:0}.entry header p{margin:0}.references{display:flex;gap:12px;margin:12px 0}.references figure{margin:0;width:180px}.references img,.no-depth{display:block;width:100%;height:105px;object-fit:contain;background:#070a0f;border-radius:5px}.no-depth{padding:30px 8px;color:#8793a1;text-align:center}figcaption{font-size:12px;color:#aeb9c9;margin-top:4px}.variants{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.variant{background:#1c2430;border:1px solid #344153;border-radius:10px;padding:14px;min-width:0}.variant h4{margin:0 0 10px;display:flex;justify-content:space-between;gap:8px}.status{font-size:12px;color:#98b3c4;font-weight:normal}.variant video{width:100%;aspect-ratio:16/9;background:#05080c;border-radius:4px}.variant dl{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;font-size:12px;margin:12px 0}.variant dl div{display:flex;justify-content:space-between;gap:7px}.variant dt{color:#9caabd}.variant dd{margin:0;text-align:right;overflow-wrap:anywhere}.ratings{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ratings label{display:flex;flex-direction:column;gap:3px}.failed{color:#ff8d8d}@media(max-width:950px){.variants{grid-template-columns:1fr}.references figure{width:45%}}
</style></head><body><main><h1>Still Shift evaluation</h1><p>${escapeHtml(corpus.corpusId)} · ${corpus.entries.length} sources · ${clipCount} clips · corpus status: ${escapeHtml(corpus.status)}</p>${corpus.status !== "frozen" ? `<p class="notice">Candidate review only. This corpus is not frozen and ratings do not establish a Phase 0 pass.</p>` : ""}<div class="toolbar"><label>Reviewer <input id="reviewer" placeholder="Name or initials"></label><button id="export">Download ratings JSON</button><span id="saved"></span></div>${rows.join("\n")}</main>
<script>
const fields=[['edgeArtifacts','Edge artifacts'],['subjectDeformation','Subject deformation'],['exposedBorders','Exposed borders'],['depthOrder','Depth order'],['motionFit','Motion fit'],['editorialUsability','Editorial usability'],['manualRepair','Manual repair needed']];
const storeKey='still-shift-ratings:${corpusSha256}';
let ratings=JSON.parse(localStorage.getItem(storeKey)||'{}');
document.querySelector('#reviewer').value=ratings.reviewer||'';
document.querySelector('#reviewer').addEventListener('input',e=>{ratings.reviewer=e.target.value;save()});
function save(){localStorage.setItem(storeKey,JSON.stringify(ratings));document.querySelector('#saved').textContent='Saved locally'}
for(const container of document.querySelectorAll('.ratings')){const id=container.dataset.clip;ratings.clips ||= {};for(const [field,label] of fields){const node=document.createElement('label');node.textContent=label;const select=document.createElement('select');const choices=field==='manualRepair'?[['','Unrated'],['0','No'],['1','Yes']]:field==='motionFit'||field==='editorialUsability'?[['','Unrated'],['0','Poor'],['1','Needs work'],['2','Usable']]:[['','Unrated'],['0','None'],['1','Minor'],['2','Severe']];for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}select.value=String(ratings.clips[id]?.[field]??'');select.addEventListener('change',()=>{ratings.clips[id] ||= {};ratings.clips[id][field]=select.value===''?null:Number(select.value);save()});node.append(select);container.append(node)}}
document.querySelector('#export').addEventListener('click',()=>{const value={schemaVersion:'0.1',corpusId:${JSON.stringify(corpus.corpusId)},corpusSha256:${JSON.stringify(corpusSha256)},corpusStatus:${JSON.stringify(corpus.status)},reviewer:ratings.reviewer||'',exportedAt:new Date().toISOString(),clips:ratings.clips||{}};const blob=new Blob([JSON.stringify(value,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='still-shift-ratings.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});
</script></body></html>`;
await writeFile(outputPath, html);
process.stdout.write(
  `${JSON.stringify({ outputPath, entryCount: corpus.entries.length, clipCount, corpusStatus: corpus.status })}\n`,
);
