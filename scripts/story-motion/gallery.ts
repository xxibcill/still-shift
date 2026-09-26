import { relative, resolve } from "node:path";

export type GalleryEntry = { id: string; title: string; description: string };
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export function storyGallery(output: string, entries: GalleryEntry[]) {
  const font = (name: string) =>
    relative(output, resolve(`assets/story-motion/fonts/${name}`));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>History, in motion · Still Shift</title><style>
@font-face{font-family:Chronicle;src:url('${font("source-serif-4-semibold.otf")}')}@font-face{font-family:Plex;src:url('${font("plex-sans-medium.ttf")}')}
*{box-sizing:border-box}body{margin:0;background:#e8dfc9;color:#211f1b;font:17px/1.6 Plex,sans-serif}main{max-width:1580px;margin:auto;padding:64px 40px}header{padding-bottom:64px;max-width:1080px}.eyebrow{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#59664d}h1,h2{font-family:Chronicle,serif;font-weight:600;line-height:1.1}h1{font-size:clamp(44px,6vw,96px);letter-spacing:-.035em;margin:24px 0}h2{font-size:36px;margin:16px 0}header p{max-width:760px}a{color:#8b3f36;text-underline-offset:5px}.motion{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2.8fr);gap:48px;padding:48px 0;border-top:1px solid #59664d77}.number{color:#59664d;font-size:14px}.description{max-width:320px}.links{font-size:14px;margin-top:28px}video{width:100%;aspect-ratio:16/9;display:block;background:#211f1b}footer{padding-top:40px;border-top:1px solid #59664d77;font-size:14px}.board{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:48px}.board img{width:100%;display:block}.board figcaption{font-size:16px;margin:8px 0 20px}figure{margin:0}@media(max-width:760px){main{padding:32px 20px}.motion{grid-template-columns:1fr;gap:16px}.description{max-width:unset}h2{font-size:30px}.board{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><main><header><div class="eyebrow">Still Shift / History Offstage</div><h1>History, in motion.</h1><p>Seven illustrated explanations. One shared drawing language, clear typography and motion that gives each relationship a purpose.</p><p class="links">1080p · 24 fps · eight seconds each · silent motion studies<br><a href="contact-sheet.html">View the style frames</a></p></header>
${entries.map((entry, index) => `<article class="motion"><div><span class="number">0${index + 1} / STORY MOTION</span><h2>${escape(entry.title)}</h2><p class="description">${escape(entry.description)}</p><p class="links"><a href="${entry.id}-motion.jpg">Motion intervals</a><br><a href="${entry.id}.handoff.json">Frame handoff</a></p></div><video aria-label="${escape(entry.title)} preview" controls muted playsinline preload="metadata" poster="${entry.id}.png" src="${entry.id}.mp4"></video></article>`).join("")}
<footer>Original symbolic illustrations · Layered Chronicle palette and typography. These studies are reusable prepared motion graphics, not authentic historical evidence or a completed S01E01 episode.</footer></main></body></html>`;
}
export function storyContactSheet(output: string, entries: GalleryEntry[]) {
  const page = storyGallery(output, []);
  const board = `<div class="board">${entries.map((entry, i) => `<figure><img src="${entry.id}.png" alt="${escape(entry.title)}"><figcaption>0${i + 1} · ${escape(entry.title)}</figcaption></figure>`).join("")}<figure><img src="dated-system-reset.png" alt="Separate Walsham context"><figcaption>05b · A separate local context</figcaption></figure></div>`;
  return page
    .replace(
      '<a href="contact-sheet.html">View the style frames</a>',
      '<a href="index.html">Watch the seven motions</a>',
    )
    .replace("<footer>", `${board}<footer>`);
}

export function storyComparison(
  output: string,
  previous: string,
  entries: GalleryEntry[],
) {
  const before = relative(output, resolve(previous));
  const selected = entries.filter((entry) =>
    ["relationship-build", "access-constraint", "motif-resolve"].includes(
      entry.id,
    ),
  );
  const comparisons = selected
    .map(
      (entry) =>
        `<section class="comparison"><h2>${escape(entry.title)}</h2><div class="board">${[
          ["Before", before],
          ["Revised", "."],
        ]
          .map(
            ([label, directory]) =>
              `<figure><figcaption>${label}</figcaption><video muted playsinline preload="auto" aria-label="${escape(entry.title)} ${label}" poster="${escape(directory!)}/${entry.id}.png" src="${escape(directory!)}/${entry.id}.mp4"></video></figure>`,
          )
          .join(
            "",
          )}</div><div class="compare-controls"><button type="button" class="restart">Play both from start</button><button type="button" class="pause">Pause both</button><label>Compare frame <input aria-label="${escape(entry.title)} comparison frame" type="range" min="0" max="191" step="1" value="0"></label><span role="status"></span></div></section>`,
    )
    .join("");
  return storyGallery(output, [])
    .replace(
      "<title>History, in motion · Still Shift</title>",
      "<title>Before / after · Still Shift</title>",
    )
    .replace(
      "<h1>History, in motion.</h1>",
      "<h1>Connections, with character.</h1>",
    )
    .replace(
      "Seven illustrated explanations. One shared drawing language, clear typography and motion that gives each relationship a purpose.",
      "The connections now have the character of a drawn brush mark: broad pressure changes, broken pigment and fine split-nib streaks. Compare the artwork in motion, or pause both versions on the same frame.",
    )
    .replace(
      '<a href="contact-sheet.html">View the style frames</a>',
      '<a href="index.html">Watch all seven revised motions</a>',
    )
    .replace(
      "</style>",
      ".comparison{border-top:1px solid #59664d77;padding:32px 0}.comparison .board{margin-bottom:16px}.compare-controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center}button{font:inherit;color:inherit;background:transparent;border:1px solid #59664d;padding:10px 18px;cursor:pointer}button:hover{background:#59664d22}button:focus-visible,input:focus-visible{outline:3px solid #8b3f36;outline-offset:4px}input{accent-color:#8b3f36;vertical-align:middle;max-width:100%}</style>",
    )
    .replace("<footer>", `${comparisons}<footer>`)
    .replace(
      "</body>",
      `<script>
for (const section of document.querySelectorAll('.comparison')) {
  const videos = [...section.querySelectorAll('video')];
  const slider = section.querySelector('input');
  const status = section.querySelector('[role=status]');
  const pause = () => videos.forEach(video => video.pause());
  section.querySelector('.restart').onclick = async () => {
    document.querySelectorAll('video').forEach(video => video.pause());
    videos.forEach(video => {video.currentTime = 0;});
    slider.value = '0';
    try {await Promise.all(videos.map(video => video.play())); status.textContent = '';}
    catch {pause();status.textContent = 'Playback could not start. Try Play again.';}
  };
  section.querySelector('.pause').onclick = pause;
  slider.oninput = () => {pause();videos.forEach(video => {video.currentTime = Number(slider.value) / 24;});};
  videos[1].ontimeupdate = () => {if (!videos[1].paused) slider.value = String(Math.min(191, Math.floor(videos[1].currentTime * 24)));};
}
</script></body>`,
    );
}
