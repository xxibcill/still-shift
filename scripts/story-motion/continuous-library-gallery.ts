import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import type { measureMotionEnergy } from "./motion-energy.ts";

type MotionEnergyReport = Awaited<ReturnType<typeof measureMotionEnergy>>;

const { values } = parseArgs({
  options: {
    after: { type: "string" },
    before: { type: "string" },
  },
});
if (!values.after || !values.before)
  throw new Error("Pass --after <new P3 render> --before <legacy replay>");
const after = resolve(values.after),
  before = resolve(values.before),
  beforeHref = relative(after, before);
const entries = JSON.parse(
  await readFile(
    resolve("benchmarks/fixtures/story-motion-continuous/catalog.json"),
    "utf8",
  ),
) as { id: string; title: string; description: string }[];
const energy = async (directory: string, id: string) =>
  JSON.parse(
    await readFile(join(directory, `${id}.motion-energy.json`), "utf8"),
  ) as MotionEnergyReport;
const energies = await Promise.all(
  entries.map(async (entry) => ({
    id: entry.id,
    before: await energy(before, entry.id),
    after: await energy(after, entry.id),
  })),
);
const motifPeak = energies.find((entry) => entry.id === "motif-resolve")?.after
  .peakFrame;
if (motifPeak === undefined || motifPeak < 112 || motifPeak > 126)
  throw new Error(
    `Motif Resolve's encoded peak must land during the outgoing arrow (112–126); measured ${motifPeak}`,
  );
const quality = JSON.parse(
  await readFile(join(after, "quality-report.json"), "utf8"),
) as {
  id: string;
  continuous: { longestSemanticGap: number; maxTextVelocity: number };
}[];
const run = promisify(execFile);
const cuts = [
  {
    id: "category-swap",
    frames: [71, 72],
    title: "The registered category changes at frame 72",
  },
  {
    id: "dated-system-break",
    frames: [119, 120],
    title: "The separate local context begins at frame 120",
  },
];
for (const cut of cuts)
  for (const frame of cut.frames)
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      join(after, `${cut.id}.mp4`),
      "-vf",
      `select=eq(n\\,${frame})`,
      "-frames:v",
      "1",
      join(after, `${cut.id}-cut-${frame}.png`),
    ]);

const esc = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const chart = (before: MotionEnergyReport, after: MotionEnergyReport) => {
  const ceiling = Math.max(before.peakChangedPixels, after.peakChangedPixels);
  const points = (values: number[]) =>
    values
      .map(
        (value, frame) =>
          `${((frame / 191) * 600).toFixed(1)},${(92 - (value / ceiling) * 86).toFixed(1)}`,
      )
      .join(" ");
  return `<svg viewBox="0 0 600 100" role="img" aria-label="Changed pixels by frame, baseline in grey and continuous version in red"><line x1="0" y1="92" x2="600" y2="92" stroke="#777"/><polyline points="${points(before.changedPixels)}" fill="none" stroke="#59664d" stroke-width="1.5"/><polyline points="${points(after.changedPixels)}" fill="none" stroke="#8b3f36" stroke-width="1.5"/></svg>`;
};
const section = (entry: (typeof entries)[number], index: number) => {
  const report = energies.find((item) => item.id === entry.id)!;
  const compiled = quality.find((item) => item.id === entry.id)!;
  return `<section class="study" data-study="${esc(entry.id)}"><div class="eyebrow">0${index + 1} / 07 · silent study</div><h2>${esc(entry.title)}</h2><p>${esc(entry.description)}</p><div class="pair"><figure><figcaption>Legacy fixture replay</figcaption><video muted playsinline preload="metadata" poster="${esc(beforeHref)}/${esc(entry.id)}.png" src="${esc(beforeHref)}/${esc(entry.id)}.mp4"></video></figure><figure><figcaption>Continuous P3 candidate</figcaption><video muted playsinline preload="metadata" poster="${esc(entry.id)}.png" src="${esc(entry.id)}.mp4"></video></figure></div><div class="controls"><button class="play" type="button">Play both</button><button class="pause" type="button">Pause</button><label>Frame <input type="range" min="0" max="191" value="0" aria-label="${esc(entry.title)} comparison frame"></label><output>0 / 191</output><span role="status"></span></div>${chart(report.before, report.after)}<p class="legend"><span class="before">Baseline</span> ${(report.before.movingShare * 100).toFixed(1)}% moving · <span class="after">P3</span> ${(report.after.movingShare * 100).toFixed(1)}% moving · peak frame ${report.after.peakFrame}</p><p class="measurement">P3: frozen run ${report.after.longestFrozenRun} · semantic gap ${compiled.continuous.longestSemanticGap} · peak/median ${report.after.peakToMedian?.toFixed(2)}× · essential text ${compiled.continuous.maxTextVelocity.toFixed(2)} px/s</p><p class="links"><a href="${esc(entry.id)}-motion.jpg">16-frame contact sheet</a> · <a href="${esc(entry.id)}.motion-energy.json">Encoded energy</a> · <a href="${esc(entry.id)}.handoff.json">Frame handoff</a></p></section>`;
};
const cutPanels = cuts
  .map(
    (cut) =>
      `<section class="study"><h2>${esc(cut.title)}</h2><div class="pair">${cut.frames.map((frame) => `<figure><figcaption>Frame ${frame}</figcaption><img src="${esc(cut.id)}-cut-${frame}.png" alt="${esc(cut.id)} at frame ${frame}"></figure>`).join("")}</div></section>`,
  )
  .join("");
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuous story library · comparison</title><style>
@font-face{font-family:Chronicle;src:url('${relative(after, resolve("assets/story-motion/fonts/source-serif-4-semibold.otf"))}')}@font-face{font-family:Plex;src:url('${relative(after, resolve("assets/story-motion/fonts/plex-sans-medium.ttf"))}')}*{box-sizing:border-box}body{margin:0;background:#e8dfc9;color:#211f1b;font:16px/1.55 Plex,sans-serif}main{max-width:1500px;margin:auto;padding:50px 32px}h1,h2{font-family:Chronicle,serif;font-weight:600;line-height:1.1}h1{font-size:clamp(38px,6vw,76px);margin:18px 0}h2{font-size:clamp(30px,4vw,48px);margin:10px 0}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:#59664d;font-size:12px}header{max-width:920px;padding-bottom:30px}.study{border-top:1px solid #59664d66;padding:32px 0}.study>p{max-width:900px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;min-width:0}figcaption{margin:0 0 8px}video,img{display:block;width:100%;height:auto}video{aspect-ratio:16/9;background:#211f1b}.controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:18px 0}button{font:inherit;color:inherit;background:transparent;border:1px solid #59664d;padding:8px 14px;min-height:44px;cursor:pointer}input{accent-color:#8b3f36}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #8b3f36;outline-offset:3px}svg{display:block;width:100%;height:auto;max-height:100px}.legend,.measurement,.links{font-size:14px;margin:5px 0}.before{color:#59664d}.after,a{color:#8b3f36}a{text-underline-offset:4px}footer{border-top:1px solid #59664d66;padding-top:24px;font-size:14px}@media(max-width:760px){main{padding:28px 18px}.pair{grid-template-columns:1fr}.controls{gap:8px}}
</style></head><body><main><header><div class="eyebrow">Still Shift / P3 library review</div><h1>Stories that keep moving.</h1><p>Seven 192-frame, 24 fps silent studies. Each pair compares the current continuous candidate with a fresh replay of its legacy fixture. Charts share one scale within each pair. Technical motion gates pass; creative emphasis still needs owner review.</p><p><a href="index.html">Open the P3 index</a> · <a href="contact-sheet.html">Style frames</a> · <a href="quality-report.json">Compiled quality report</a></p></header>${entries.map(section).join("")}<h2>Exact cut review</h2>${cutPanels}<footer>The legacy replay is generated from the checked-in non-v2 fixtures. These studies are reusable explanatory graphics and do not modify the published S01E01 episode.</footer></main><script>
for(const section of document.querySelectorAll('[data-study]')){const videos=[...section.querySelectorAll('video')],range=section.querySelector('input'),output=section.querySelector('output'),status=section.querySelector('[role=status]');let synchronizing=false;const showTime=time=>{range.value=String(Math.min(191,Math.floor(time*24)));output.value=range.value+' / 191';};const hold=(message='')=>{if(synchronizing)return;synchronizing=true;const time=Math.min(...videos.map(video=>video.currentTime));videos.forEach(video=>video.pause());videos.forEach(video=>video.currentTime=time);showTime(time);status.textContent=message;synchronizing=false;};const play=async()=>{if(synchronizing)return;synchronizing=true;const time=videos.every(video=>video.ended)?0:Math.min(...videos.map(video=>video.currentTime));videos.forEach(video=>video.currentTime=time);showTime(time);try{await Promise.all(videos.map(video=>video.play()));status.textContent='';}catch{videos.forEach(video=>video.pause());status.textContent='Playback failed. Try Play again.';}finally{synchronizing=false;}};section.querySelector('.play').onclick=play;section.querySelector('.pause').onclick=()=>hold();range.oninput=()=>{synchronizing=true;videos.forEach(video=>video.pause());videos.forEach(video=>video.currentTime=Number(range.value)/24);output.value=range.value+' / 191';synchronizing=false;};videos.forEach(video=>{video.addEventListener('pause',()=>{if(!synchronizing&&videos.some(item=>!item.paused)&&!videos.every(item=>item.currentTime>7.8))hold('Paused to keep both videos aligned.');});for(const event of ['waiting','stalled'])video.addEventListener(event,()=>{if(!synchronizing&&videos.some(item=>!item.paused))hold('Buffering paused both videos. Press Play to resume.');});});videos[1].ontimeupdate=()=>{if(!videos[1].paused)showTime(videos[1].currentTime);};}
</script></body></html>`;
await writeFile(join(after, "comparison.html"), page, { flag: "wx" });
await writeFile(
  join(after, "exact-cut-review.json"),
  JSON.stringify(
    cuts.map((cut) => ({
      ...cut,
      beforeChangedPixels: energies.find((item) => item.id === cut.id)!.after
        .changedPixels[cut.frames[0]!],
      cutChangedPixels: energies.find((item) => item.id === cut.id)!.after
        .changedPixels[cut.frames[1]!],
    })),
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(join(after, "comparison.html"));
