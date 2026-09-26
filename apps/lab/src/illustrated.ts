import { PreparedSceneInputSchema } from "../../../packages/scene-contract/src/cinematic.ts";
import { createStoryControls } from "./story-controls.ts";
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
const strength = el<HTMLSelectElement>("strength");
const duration = el<HTMLSelectElement>("duration");
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
type Entry = {
  id: string;
  title: string;
  description: string;
  collection: string;
  value: string;
};
const entries: Entry[] = [];
for (const collection of ["illustrated", "cinematic", "story"]) {
  const response = await fetch(`/${collection}/scenes/catalog.json`);
  if (!response.ok) throw new Error("Scene catalog unavailable");
  const catalog = (await response.json()) as Omit<
    Entry,
    "collection" | "value"
  >[];
  const group = document.createElement("optgroup");
  group.label =
    collection === "story"
      ? "Story Motion · narrative recipes"
      : collection === "cinematic"
        ? "Cinematic Parallax · variations"
        : "Illustrated explanation";
  for (const entry of catalog) {
    const value =
      collection === "illustrated" ? entry.id : `${collection}:${entry.id}`;
    entries.push({ ...entry, collection, value });
    const option = document.createElement("option");
    option.value = value;
    option.textContent = entry.title;
    group.append(option);
  }
  select.append(group);
}
const requestedCollection = new URLSearchParams(location.search).get(
  "collection",
);
const firstInCollection = entries.find(
  (entry) => entry.collection === requestedCollection,
);
if (firstInCollection) select.value = firstInCollection.value;
const requestedScene = new URLSearchParams(location.search).get("scene");
const requestedEntry = entries.find((entry) => entry.id === requestedScene);
if (requestedEntry) select.value = requestedEntry.value;
const requestedDuration = new URLSearchParams(location.search).get("duration");
if (
  requestedDuration &&
  Array.from(duration.options).some(
    (option) => option.value === requestedDuration,
  )
)
  duration.value = requestedDuration;
const load = async () => {
  const current = ++generation;
  stop();
  play.disabled = true;
  slider.disabled = true;
  el<HTMLButtonElement>("restart").disabled = true;
  el("error").textContent = "";
  el("status").textContent = "Loading scene…";
  el("story-controls").hidden = true;
  try {
    const entry = entries.find((item) => item.value === select.value)!;
    const response = await fetch(
      `/${entry.collection}/scenes/${entry.id}.json`,
    );
    if (!response.ok) throw new Error("Scene unavailable");
    const input = PreparedSceneInputSchema.parse(await response.json());
    strength.disabled = input.schemaVersion !== "illustrated-scene-2";
    duration.disabled = input.schemaVersion !== "illustrated-scene-2";
    if (input.schemaVersion === "illustrated-scene-2") {
      input.durationMs = Number(duration.value);
      input.recipe.intensity =
        strength.value === "dramatic"
          ? "dramatic"
          : strength.value === "restrained"
            ? "restrained"
            : "standard";
    }
    const next = compilePreparedScene(input);
    const images = await loadIllustratedImages(next, (id) => {
      const asset = next.assets.find((item) => item.id === id)!;
      return `/${entry.collection}/assets/${asset.path.split("/").at(-1)}`;
    });
    if (current !== generation) return;
    preview?.dispose();
    scene = next;
    preview = createIllustratedPreview(canvas, next, images);
    if (input.schemaVersion === "story-scene-1") {
      el("story-controls").hidden = false;
      createStoryControls(
        input,
        (updated) => {
          const compiled = compilePreparedScene(updated);
          stop();
          preview?.dispose();
          scene = compiled;
          preview = createIllustratedPreview(canvas, compiled, images);
          show(Number(slider.value));
        },
        (frame) => {
          stop();
          show(frame);
        },
      );
    }
    slider.max = String(next.timeline.frameCount - 1);
    show(0);
    el("description").textContent = entry.description;
    el("status").textContent =
      `${entry.title} ready · ${next.fps} fps · ${next.durationMs / 1000} seconds`;
    play.disabled = false;
    slider.disabled = false;
    el<HTMLButtonElement>("restart").disabled = false;
  } catch (error) {
    if (current !== generation) return;
    el("status").textContent = "Scene unavailable";
    el("error").textContent =
      error instanceof Error ? error.message : String(error);
  }
};
select.onchange = () => void load();
strength.onchange = () => void load();
duration.onchange = () => void load();
await load();
