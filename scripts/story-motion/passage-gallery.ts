import { relative, resolve } from "node:path";
import type { PreparedPassage } from "./passage-files.ts";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const words = (value: string) =>
  value.replaceAll("_", " ").replaceAll("-", " ");

export function passageGallery(
  output: string,
  passage: PreparedPassage,
  mode: "prepared" | "silent" | "narrated",
) {
  const { plan, beats, frameCount } = passage;
  const seconds = (frame: number) => (frame / plan.fps).toFixed(2) + "s";
  const font = (file: string) =>
    relative(output, resolve("assets/story-motion/fonts", file))
      .split("/")
      .map(encodeURIComponent)
      .join("/");
  const disabled = mode === "prepared" ? "disabled" : "";
  const timing = beats
    .map(
      (beat) =>
        `<button ${disabled} class="segment ${beat.intensity}" data-frame="${beat.start}" style="flex:${beat.frameCount}" title="${escape(beat.takeaway)}"><span>${String(beats.indexOf(beat) + 1).padStart(2, "0")}</span> ${beat.intensity}</button>`,
    )
    .join("");
  const rows = beats
    .map(
      (
        beat,
        index,
      ) => `<article class="beat" data-start="${beat.start}" data-end="${beat.end}" data-takeaway="${escape(beat.takeaway)}">
    <div class="beat-heading"><button ${disabled} class="beat-jump" data-frame="${beat.start}"><span class="number">${String(index + 1).padStart(2, "0")}</span><span>${escape(beat.takeaway)}</span></button><span class="range">${seconds(beat.start)}–${seconds(beat.end)}</span></div>
    <p class="treatment">${escape(words(beat.purpose))} <span aria-hidden="true">/</span> ${escape(words(beat.preset))} <span aria-hidden="true">/</span> ${beat.intensity}</p>
    <p class="qualification"><strong>${escape(words(beat.evidence.kind))}.</strong> ${escape(beat.evidence.qualification)}</p>
    <details><summary>${beat.cues.length} narration cues · ${beat.quality.diagnostics.length + beat.cueWarnings.length} review notes</summary><p class="small">Cue phrases summarize the narration. Times are relative to this passage.</p><ol class="cues">${beat.cues.map((cue) => `<li><button ${disabled} data-frame="${cue.localFrame}"><time>${seconds(cue.localFrame)}</time><span>${escape(cue.phrase)}</span></button></li>`).join("")}</ol>
    <p class="small">Focal subjects: ${beat.focus.map(escape).join(", ")}</p>
    ${[...beat.cueWarnings, ...beat.quality.diagnostics].map((note) => `<p class="note">${escape(note.message)}</p>`).join("")}</details>
  </article>`,
    )
    .join("");
  const video =
    mode === "prepared"
      ? `<div class="empty-preview"><h2>Beat plan prepared.</h2><p>Render this plan to review motion and use the cue timeline.</p></div>`
      : `<video id="preview" controls playsinline preload="metadata" poster="passage.png" src="passage.mp4" aria-label="${escape(plan.title)}"></video>`;
  const metadata = JSON.stringify({
    plan: plan.id,
    planSha256: passage.inputs.plan.sha256,
    mode,
  }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(plan.title)} · Still Shift</title><style>
@font-face{font-family:Chronicle;src:url('${font("source-serif-4-semibold.otf")}')}@font-face{font-family:Plex;src:url('${font("plex-sans-medium.ttf")}')}
:root{font-family:Plex,sans-serif;color:#252923;background:#f1f0e9;font-synthesis:none}*{box-sizing:border-box}body{margin:0}main{max-width:1480px;margin:auto;padding:48px 40px}h1,h2{font-family:Chronicle,Georgia,serif;font-weight:600;line-height:1.1}h1{font-size:clamp(34px,4.4vw,64px);letter-spacing:-.035em;max-width:1000px;margin:18px 0 24px}h2{font-size:28px;margin-top:0}p{line-height:1.55}.eyebrow,.number,.range{font-size:13px;color:#56634e}.eyebrow{letter-spacing:.13em;text-transform:uppercase}header{padding-bottom:30px;border-bottom:1px solid #bfc2b7}.meta{display:flex;gap:12px 24px;flex-wrap:wrap;font-size:14px}.workspace{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:40px;padding-top:32px}.screen{position:sticky;top:24px;align-self:start;min-width:0}video{display:block;width:100%;aspect-ratio:16/9;background:#211f1b}.empty-preview{display:grid;align-content:center;aspect-ratio:16/9;background:#e3e3d8;padding:32px}.timeline{display:flex;gap:4px;margin-top:16px}.segment{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-top:4px solid #647154;background:#e2e6db;color:#252923;padding:12px 8px;text-align:left;font-size:12px}.segment.peak{border-color:#8b3f36;background:#eadbd5}.segment.quiet{border-color:#8c9487;background:#e6e7df}.segment span{font-weight:bold;margin-right:4px}button,select,textarea,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.6}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #8b3f36;outline-offset:3px}button:hover:not(:disabled){background:#dce1d2}button[aria-current="true"]{box-shadow:inset 0 -3px #252923}.current{padding:18px 0;border-bottom:1px solid #bfc2b7;min-height:110px}.current p{margin:7px 0 0}#time{float:right;font-size:13px;color:#56634e}.beat{padding:22px 0;border-bottom:1px solid #bfc2b7}.beat:first-child{padding-top:0}.beat[data-active="true"] .number{color:#8b3f36}.beat-heading{display:flex;gap:16px;align-items:start;justify-content:space-between}.beat-jump{border:0;padding:0;background:none;color:inherit;text-align:left;display:flex;gap:14px;font-size:20px;line-height:1.35}.number{padding-top:5px}.range{white-space:nowrap;padding-top:5px}.treatment{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#56634e;margin:16px 0 8px}.treatment span{padding:0 5px}.qualification{font-size:14px;margin-bottom:16px}details{font-size:14px}summary{cursor:pointer;min-height:34px;padding:6px 0;color:#45533f}.small{font-size:12px;color:#56634e}.cues{list-style:none;padding:0}.cues li{border-top:1px solid #d0d2c7}.cues button{display:flex;gap:16px;align-items:baseline;border:0;background:none;width:100%;text-align:left;color:inherit;padding:12px 0}.cues time{min-width:54px;font-size:12px;color:#56634e}.note{border-top:1px solid #d0d2c7;padding-top:12px;font-size:12px}.links{display:flex;gap:18px;flex-wrap:wrap;margin-top:22px;font-size:14px}a{color:#8b3f36;text-underline-offset:4px}.review{padding:40px 0 0;max-width:900px}.review p{max-width:720px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fields label,.review>label{display:block;font-size:14px}.fields select,.fields input,textarea{display:block;width:100%;margin-top:8px;padding:10px;border:1px solid #a8b09f;background:#faf9f3;color:inherit}textarea{min-height:100px;resize:vertical}.review>label{margin:24px 0}.download{border:1px solid #26372d;background:#26372d;color:#f9f8f2;padding:12px 20px}.download:hover:not(:disabled){background:#45533f}footer{margin-top:48px;padding-top:24px;border-top:1px solid #bfc2b7;font-size:13px;line-height:1.6;color:#56634e}@media(max-width:980px){.workspace{grid-template-columns:1fr}.screen{position:static}.fields{grid-template-columns:1fr 1fr}}@media(max-width:520px){main{padding:28px 18px}.workspace{gap:28px}.beat-heading{display:block}.range{display:block;margin:10px 0 0 29px}.fields{grid-template-columns:1fr}.segment{font-size:11px;padding:12px 6px}.meta{gap:8px 16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><main><header><div class="eyebrow">Still Shift / Passage review</div><h1>${escape(plan.title)}</h1><div class="meta"><span>${beats.length} beats · ${seconds(frameCount)} · ${plan.fps} fps</span><span>${mode === "narrated" ? "Narration checksum verified" : mode === "silent" ? "Silent review · no narration" : "Prepared · not rendered"}</span><span>Layered Chronicle</span></div></header>
<div class="workspace"><section class="screen" aria-label="Passage playback">${video}<nav class="timeline" aria-label="Beat intensity and navigation">${timing}</nav><div class="current"><span class="eyebrow">Current idea</span><output id="time">0.00s</output><p id="current-idea">${escape(beats[0]!.takeaway)}</p></div><div class="links"><a href="passage.json">Timing and source record</a><a href="source-plan.json">Beat plan</a>${mode !== "prepared" ? '<a href="render-report.json">Render checks</a><a href="passage-motion.jpg">Sampled frames</a>' : ""}</div></section><section aria-label="Narrative beats">${rows}</section></div>
<form class="review" id="review"><h2>Does the story read?</h2><p>Watch once with narration, then at phone size. Record what draws attention and whether the intended relationship is clear. These ratings are human observations; technical checks do not fill them in.</p><div class="fields">${["Clarity", "Readability", "Emphasis"].map((label) => `<label>${label}<select aria-label="${label}" name="${label.toLowerCase()}"><option value="">Not reviewed</option>${[1, 2, 3, 4, 5].map((score) => `<option value="${score}">${score}${score === 1 ? " · weak" : score === 5 ? " · strong" : ""}</option>`).join("")}</select></label>`).join("")}<label>Preparation minutes<input name="preparationMinutes" type="number" min="0" step="0.1" placeholder="Unmeasured"></label><label>Manual repairs<input name="manualRepairs" type="number" min="0" step="1" placeholder="Unmeasured"></label></div><label>What needs attention?<textarea name="notes" placeholder="For example: the route narrows before the narration names the constraint."></textarea></label><button class="download" type="submit">Download review</button><p id="review-status" class="small" role="status"></p></form>
<footer>Local graphic candidate. Cue phrases are editorial summaries, not a transcript. Intensity is authored intent, not measured motion energy. Existing episode assets and delivery boundaries are preserved. Reviews are downloaded locally.</footer></main>
<script>const metadata=${metadata};
const video=document.getElementById('preview');
const frameButtons=[...document.querySelectorAll('[data-frame]')];
const beats=[...document.querySelectorAll('article.beat')];
function update(){if(!video)return;const frame=Math.min(${frameCount - 1},Math.floor((video.currentTime+0.00001)*${plan.fps}));document.getElementById('time').textContent=video.currentTime.toFixed(2)+'s';for(const beat of beats){const active=frame>=Number(beat.dataset.start)&&frame<Number(beat.dataset.end);beat.dataset.active=String(active);if(active)document.getElementById('current-idea').textContent=beat.dataset.takeaway;}for(const button of document.querySelectorAll('.segment')){const beat=beats.find(beat=>Number(beat.dataset.start)===Number(button.dataset.frame));button.setAttribute('aria-current',String(beat?.dataset.active==='true'));}}
for(const button of frameButtons)button.addEventListener('click',()=>{if(!video)return;video.pause();video.currentTime=Number(button.dataset.frame)/${plan.fps};update();});
if(video){video.addEventListener('timeupdate',update);video.addEventListener('seeked',update);video.addEventListener('loadedmetadata',update);video.addEventListener('error',()=>{document.getElementById('current-idea').textContent='The preview could not load. Check that passage.mp4 is beside this page.';});update();}
document.getElementById('review').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const review={...metadata,reviewedAt:new Date().toISOString()};for(const [key,value]of data)review[key]=key==='notes'?value:value===''?null:Number(value);const url=URL.createObjectURL(new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=metadata.plan+'.review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('review-status').textContent='Review downloaded with the plan checksum.';});
</script></body></html>`;
}
