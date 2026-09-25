import { PreparedSceneSchema } from "../../../packages/scene-contract/src/prepared.ts";
import {
  compilePreparedScene,
  type IllustratedScene,
} from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = el<HTMLSelectElement>("scene"),
  slider = el<HTMLInputElement>("scrub"),
  play = el<HTMLButtonElement>("play");
const canvas = el<HTMLCanvasElement>("illustrated-preview");
let preview: ReturnType<typeof createIllustratedPreview> | undefined;
let scene: IllustratedScene | undefined;
let playing = false,
  start = 0,
  animation = 0,
  generation = 0;
const show = (frame: number) => {
  if (!scene || !preview) return;
  preview.renderFrame(frame);
  slider.value = String(frame);
  el("time").textContent =
    `${(frame / scene.fps).toFixed(2)} s · ${frame + 1} / ${scene.timeline.frameCount}`;
};
const stop = () => {
  playing = false;
  cancelAnimationFrame(animation);
  play.textContent = "Play";
};
const tick = (now: number) => {
  if (!playing || !scene) return;
  const frame = Math.floor(((now - start) * scene.fps) / 1000);
  if (frame >= scene.timeline.frameCount) {
    show(scene.timeline.frameCount - 1);
    stop();
    return;
  }
  show(frame);
  animation = requestAnimationFrame(tick);
};
play.onclick = () => {
  if (playing) {
    stop();
    return;
  }
  if (!scene) return;
  const frame =
    Number(slider.value) >= scene.timeline.frameCount - 1
      ? 0
      : Number(slider.value);
  start = performance.now() - (frame / scene.fps) * 1000;
  playing = true;
  play.textContent = "Pause";
  animation = requestAnimationFrame(tick);
};
el("restart").onclick = () => {
  stop();
  show(0);
};
slider.oninput = () => {
  stop();
  show(Number(slider.value));
};
type Entry = { id: string; title: string; description: string };
const entries = await fetch("/illustrated/scenes/catalog.json").then(
  (response) => {
    if (!response.ok) throw new Error("Scene catalog unavailable");
    return response.json() as Promise<Entry[]>;
  },
);
for (const entry of entries) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = entry.title;
  select.append(option);
}
const load = async () => {
  const current = ++generation;
  stop();
  play.disabled = true;
  el<HTMLButtonElement>("restart").disabled = true;
  el("error").textContent = "";
  try {
    const entry = entries.find((item) => item.id === select.value)!;
    const response = await fetch(`/illustrated/scenes/${entry.id}.json`);
    if (!response.ok) throw new Error("Scene unavailable");
    const next = compilePreparedScene(
      PreparedSceneSchema.parse(await response.json()),
    );
    const images = await loadIllustratedImages(next, (id) => {
      const asset = next.assets.find((item) => item.id === id)!;
      return `/illustrated/assets/${asset.path.split("/").at(-1)}`;
    });
    if (current !== generation) return;
    preview?.dispose();
    scene = next;
    preview = createIllustratedPreview(canvas, next, images);
    slider.max = String(next.timeline.frameCount - 1);
    show(0);
    el("description").textContent = entry.description;
    el("status").textContent =
      `${entry.title} ready · ${next.fps} fps · ${next.durationMs / 1000} seconds`;
    play.disabled = false;
    el<HTMLButtonElement>("restart").disabled = false;
  } catch (error) {
    el("error").textContent =
      error instanceof Error ? error.message : String(error);
  }
};
select.onchange = () => void load();
await load();
