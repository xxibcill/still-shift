import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { measureMotionEnergy } from "./motion-energy.ts";

const { values } = parseArgs({
  options: {
    before: { type: "string", default: "benchmarks/results/story-motion-v012" },
    after: {
      type: "string",
      default: "benchmarks/results/story-motion-v013-proto",
    },
  },
});
const before = resolve(values.before!),
  after = resolve(values.after!);
const id = "unequal-margins";
const a = await measureMotionEnergy(join(before, `${id}.mp4`));
const b = JSON.parse(
  await readFile(join(after, `${id}.motion-energy.json`), "utf8"),
) as typeof a;
const quality = JSON.parse(
  await readFile(join(after, "quality-report.json"), "utf8"),
)[0];
const run = promisify(execFile);
for (const [label, directory] of [
  ["before", before],
  ["after", after],
] as const) {
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    join(directory, `${id}.mp4`),
    "-vf",
    "select='eq(n,0)+eq(n,24)+eq(n,48)+eq(n,72)+eq(n,96)+eq(n,120)+eq(n,144)+eq(n,168)+eq(n,191)',scale=480:270,tile=3x3",
    "-frames:v",
    "1",
    join(after, `${label}-nine-frames.jpg`),
  ]);
}
await run("ffmpeg", [
  "-v",
  "error",
  "-n",
  "-i",
  join(after, `${id}.mp4`),
  "-vf",
  "select=eq(n\\,166),scale=390:-2",
  "-frames:v",
  "1",
  join(after, "phone-frame-390.png"),
]);
const max = Math.max(a.peakChangedPixels, b.peakChangedPixels);
const chart = (report: typeof a) =>
  `<svg viewBox="0 0 600 96" role="img" aria-label="Changed pixels, common scale, frames zero to 191"><line x1="0" x2="600" y1="${90 - (report.medianChangedPixels / max) * 84}" y2="${90 - (report.medianChangedPixels / max) * 84}" stroke="#59664D" stroke-dasharray="4 4"/><polyline fill="none" stroke="#8B3F36" stroke-width="1.5" points="${report.changedPixels.map((value, frame) => `${(frame / 191) * 600},${90 - (value / max) * 84}`).join(" ")}"/></svg>`;
const video = (
  label: string,
  directory: string,
  report: typeof a,
  sheet: string,
) =>
  `<figure><figcaption>${label}</figcaption><video controls muted playsinline preload="auto" poster="${directory}/${id}.png" src="${directory}/${id}.mp4" aria-label="${label}"></video>${chart(report)}<p class="measurement">${(report.movingShare * 100).toFixed(1)}% moving · longest freeze ${report.longestFrozenRun} frames</p><a href="${sheet}">Nine-frame contact sheet</a></figure>`;
const font = relative(
  after,
  resolve("assets/story-motion/fonts/source-serif-4-semibold.otf"),
);
const sans = relative(
  after,
  resolve("assets/story-motion/fonts/plex-sans-medium.ttf"),
);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unequal Margins · continuous motion review</title><style>
@font-face{font-family:Chronicle;src:url('${font}')}@font-face{font-family:Plex;src:url('${sans}')}*{box-sizing:border-box}body{margin:0;background:#e8dfc9;color:#211f1b;font:16px/1.65 Plex,sans-serif}main{max-width:1600px;margin:auto;padding:48px 32px}h1,h2{font-family:Chronicle,serif;font-weight:600;line-height:1.1}h1{font-size:clamp(36px,5vw,68px);margin:20px 0}h2{font-size:30px}header{max-width:850px;margin-bottom:36px}.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:#59664d}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;min-width:0}figcaption{margin-bottom:12px}video,img{display:block;width:100%;height:auto}video{aspect-ratio:16/9;background:#211f1b}svg{display:block;width:100%;margin-top:8px}.measurement{margin:0 0 8px;font-size:14px}a{color:#8b3f36;text-underline-offset:4px}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:24px 0;border-bottom:1px solid #59664d66}button{font:inherit;padding:9px 16px;border:1px solid #59664d;background:transparent;color:inherit;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #8b3f36;outline-offset:3px}input{accent-color:#8b3f36;max-width:100%}section{padding:24px 0}table{border-collapse:collapse;width:100%;max-width:850px}th,td{text-align:left;border-bottom:1px solid #59664d55;padding:9px 12px 9px 0;font-size:14px}th{color:#59664d}p{max-width:900px}.note{border-left:3px solid #8b3f36;padding-left:18px}.sheets{margin-top:24px}.sheets img{margin-top:8px}footer{font-size:13px;border-top:1px solid #59664d66;padding-top:24px}@media(max-width:760px){main{padding:28px 20px}.pair{grid-template-columns:1fr;gap:28px}h1{font-size:38px}.controls{gap:10px}button{min-height:44px}th,td{font-size:13px}header{margin-bottom:28px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><main><header><div class="eyebrow">Still Shift / P2 owner review</div><h1>The same season.<br>Different room.</h1><p>Unequal Margins with a continuous camera, shrinking margin plates, a household response and an ongoing strain current. Typography, illustration family, colours and the 192-frame duration are preserved.</p><p>Both studies are silent. Use paired playback or scrub a frame to compare.</p></header><div class="pair">${video("v012 · baseline", relative(after, before), a, "before-nine-frames.jpg")}${video("v013 · prototype", ".", b, "after-nine-frames.jpg")}</div><div class="controls"><button id="play" type="button">Play both from start</button><button id="pause" type="button">Pause both</button><label>Frame <input id="frame" type="range" min="0" max="191" value="0" step="1" aria-label="Comparison frame"></label><output id="position">0 / 191</output><span id="status" role="status"></span></div><p class="measurement">Energy charts share a vertical scale. The dashed line is each clip’s median; frame zero has no comparison.</p><section><h2>Measured result</h2><table><thead><tr><th>Gate</th><th>Prototype</th><th>Hard limit</th></tr></thead><tbody><tr><td>G1 · frozen run</td><td>${b.longestFrozenRun} frames</td><td>≤ 6</td></tr><tr><td>G2 · moving frames</td><td>${(b.movingShare * 100).toFixed(1)}%</td><td>≥ 97%</td></tr><tr><td>G3 · semantic gap</td><td>${quality.continuous.longestSemanticGap} frames</td><td>≤ 48</td></tr><tr><td>G4 · peak / median</td><td>${b.peakToMedian!.toFixed(2)}×</td><td>≥ 2.5×</td></tr><tr><td>G5 · essential text speed</td><td>${quality.continuous.maxTextVelocity.toFixed(2)} px/s</td><td>≤ 20</td></tr><tr><td>G6 · declared cover planes</td><td>Pass, all 192 frames</td><td>Complete viewport</td></tr></tbody></table><p><a href="${id}.motion-energy.json">Encoded pixel measurements</a> · <a href="quality-report.json">Compiled-scene diagnostics</a> · <a href="phone-frame-390.png">390 px style frame</a></p></section><section><h2>What needs your eye</h2><p class="note">The largest measured energy peak is frame ${b.peakFrame}, during the shared-strain response: the less-room margin shrinks, household B compresses, and household A recedes to shift focus. The numeric contrast gate passes; review whether the margin change itself reads as the strongest idea.</p><p>The proposed large camera pan exceeded the text-speed and judder limits. This version uses a smaller continuous push and track; the “more room” plate finishes at frame 92 to close the original 52-frame semantic gap. The main strain remains frames 48–104. The paper fills the viewport; the ground is an overscanned lower scenery strip.</p><p>Labels retain their established 56 px size and the qualification stays 52 px. At phone width they remain secondary and small; no font enlargement was made. Review readability, the strength of the strain response and whether the ongoing current carries meaning.</p></section><section><h2>Nine-frame comparison</h2><p>Frames 0, 24, 48, 72, 96, 120, 144, 168 and 191.</p><div class="pair sheets"><figure><figcaption>v012</figcaption><img src="before-nine-frames.jpg" alt="Nine baseline frames"></figure><figure><figcaption>v013</figcaption><img src="after-nine-frames.jpg" alt="Nine prototype frames"></figure></div></section><footer>P2 checkpoint only. The six other studies, narrated passages and full episode are awaiting review. Pixel measurements and browser checks do not establish creative acceptance.</footer></main><script>
const videos=[...document.querySelectorAll('video')], slider=document.querySelector('#frame'), position=document.querySelector('#position'), status=document.querySelector('#status');
const pause=()=>videos.forEach(v=>v.pause());
document.querySelector('#play').onclick=async()=>{pause();videos.forEach(v=>v.currentTime=0);slider.value=0;try{await Promise.all(videos.map(v=>v.play()));status.textContent='';}catch{pause();status.textContent='Playback could not start. Try again.';}};
document.querySelector('#pause').onclick=pause;
slider.oninput=()=>{pause();videos.forEach(v=>v.currentTime=Number(slider.value)/24);position.value=slider.value+' / 191';};
videos[1].ontimeupdate=()=>{if(!videos[1].paused){slider.value=Math.min(191,Math.floor(videos[1].currentTime*24));position.value=slider.value+' / 191';}};
</script></body></html>`;
await writeFile(join(after, "comparison.html"), page, { flag: "wx" });
console.log(join(after, "comparison.html"));
