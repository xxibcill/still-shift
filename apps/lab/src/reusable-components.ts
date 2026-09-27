import {
  REUSABLE_EXAMPLES,
  TIMING_EXAMPLES,
  reusableDemoVersion,
  ReusableDemoSchema,
  type ReusableDemo,
} from "../../../packages/scene-contract/src/reusable-component-demo.ts";
import { buildReusableDemo } from "../../../packages/renderer-core/src/reusable-component-demo.ts";
import { compilePreparedScene } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { indexStoryEvents } from "../../../packages/renderer-core/src/story-event-index.ts";
import { createSourceZip, download } from "./commerce-download.ts";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const form = element<HTMLFormElement>("settings"),
  canvas = element<HTMLCanvasElement>("preview"),
  scrub = element<HTMLInputElement>("scrub");
const encoder = new TextEncoder();
const assetUrl = (id: string) =>
  "/commerce/assets/" +
  ({
    "product-image": "beauty-floating-product-v1.png",
    "commerce-font": "noto-sans-thai.ttf",
    house: "house.svg",
  }[id] ?? "missing");
let example: ReusableDemo["example"] = "instances",
  generation = 0,
  dirty = true,
  exporting = false,
  animation = 0,
  playing = false;
type Active = {
  settings: ReusableDemo;
  scene: ReturnType<typeof buildReusableDemo>;
  renderer: ReturnType<typeof createIllustratedPreview>;
  canvas: HTMLCanvasElement;
};
let active: Active | undefined;
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
function say(message: string, error = false) {
  element("status").textContent = message;
  element("status").dataset.error = String(error);
}
function sync() {
  for (const id of ["play", "scrub", "source", "export", "save"])
    (element(id) as HTMLButtonElement | HTMLInputElement).disabled =
      !active || dirty || exporting;
  form
    .querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >("button,input,select")
    .forEach((input) => (input.disabled = exporting));
  element<HTMLButtonElement>("save").disabled = !active || dirty || exporting;
}
function pause() {
  cancelAnimationFrame(animation);
  playing = false;
  element("play").textContent = "Play";
}
function show(frame: number) {
  if (!active) return;
  frame = Math.min(active.scene.frameCount - 1, Math.max(0, Math.round(frame)));
  active.renderer.renderFrame(frame);
  canvas.getContext("2d")!.drawImage(active.canvas, 0, 0);
  scrub.value = String(frame);
  element("frame").textContent = String(frame);
}
function controls() {
  const item = REUSABLE_EXAMPLES.find((e) => e.id === example)!;
  element("title").textContent = item.title;
  element("kind").textContent = item.kind;
  element("description").textContent = item.description;
  const markers = ["instances", "layout", "stagger"].includes(example);
  form.querySelectorAll<HTMLElement>("[data-control]").forEach((control) => {
    const kind = control.dataset.control;
    const composed = ["detail-sequence", "supply-sequence"].includes(example);
    const timingControls: Record<string, boolean> = {
      timing: composed || ["visibility", "sequence"].includes(example),
      pin: composed || example === "pin",
      fit: composed || example === "text-fit",
      mask: composed || example === "mask",
    };
    if (kind && Object.hasOwn(timingControls, kind)) {
      control.hidden = !timingControls[kind];
      return;
    }
    if (
      (TIMING_EXAMPLES as readonly string[]).includes(example) &&
      (kind === "copy" ||
        (control.querySelector('[name="middleDelay"]') &&
          (composed || example === "sequence")))
    ) {
      control.hidden = false;
      return;
    }
    control.hidden =
      kind === "transform"
        ? !["transform", "tour", "supply"].includes(example)
        : kind === "state"
          ? !["state", "tour", "supply"].includes(example)
          : kind === "travel"
            ? !["travel", "tour", "supply"].includes(example)
            : kind === "value"
              ? example !== "value"
              : kind === "row"
                ? !["layout", "stagger"].includes(example)
                : kind === "markers"
                  ? !markers
                  : !markers &&
                    !["leader", "state", "tour", "supply"].includes(example);
  });
  element("examples")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.example === example),
      ),
    );
}
function readSettings() {
  return ReusableDemoSchema.parse({
    schemaVersion: reusableDemoVersion(example),
    ...(reusableDemoVersion(example) === "reusable-demo-2"
      ? Object.fromEntries(
          [
            "scale",
            "rotation",
            "drawFrom",
            "drawTo",
            "cutFrame",
            "travelFrom",
            "travelTo",
          ].map((key) => [key, Number(field(key).value)]),
        )
      : {}),
    ...(reusableDemoVersion(example) === "reusable-demo-3"
      ? {
          ...Object.fromEntries(
            [
              "clipStart",
              "clipDuration",
              "anchorX",
              "anchorY",
              "minSize",
              "maxSize",
            ].map((key) => [key, Number(field(key).value)]),
          ),
          invert: field("invert").value === "true",
        }
      : {}),
    example,
    mode: field("mode").value,
    fps: Number(field("fps").value),
    middleText: field("middleText").value,
    ...Object.fromEntries(
      ["count", "gap", "stagger", "middleDelay", "from", "to", "decimals"].map(
        (key) => [key, Number(field(key).value)],
      ),
    ),
  });
}
function fill(settings: ReusableDemo) {
  example = settings.example;
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
      input.value = String(value);
  }
  controls();
}
async function update() {
  pause();
  dirty = true;
  sync();
  const run = ++generation;
  say("Preparing changes…");
  let candidate: ReturnType<typeof createIllustratedPreview> | undefined;
  try {
    const settings = readSettings(),
      scene = buildReusableDemo(settings),
      compiled = compilePreparedScene(scene);
    const images = await loadIllustratedImages(compiled, assetUrl);
    const staging = document.createElement("canvas");
    candidate = createIllustratedPreview(staging, compiled, images);
    candidate.renderFrame(Math.min(Number(scrub.value), scene.frameCount - 1));
    if (run !== generation) {
      candidate.dispose();
      return;
    }
    active?.renderer.dispose();
    active = { settings, scene, renderer: candidate, canvas: staging };
    candidate = undefined;
    canvas.width = scene.width;
    canvas.height = scene.height;
    scrub.max = String(scene.frameCount - 1);
    show(Number(scrub.value));
    dirty = false;
    element("handles").textContent = JSON.stringify(
      {
        nodes: scene.nodes.filter((n) => n.id.includes("__")).map((n) => n.id),
        timing:
          scene.schemaVersion === "story-scene-1"
            ? indexStoryEvents(scene)
            : scene.events.filter((e) => e.node.includes("__")),
        values: scene.componentData?.values,
        resolvedTextSizes: active.renderer.resolvedTextSizes,
        ...(scene.componentData?.schemaVersion === "scene-components-3"
          ? {
              visibility: scene.componentData.visibility,
              pins: scene.componentData.pins,
              textFits: scene.componentData.textFits,
              masks: scene.componentData.masks,
            }
          : {}),
        ...(scene.componentData &&
        scene.componentData.schemaVersion !== "scene-components-1"
          ? {
              states: scene.componentData.states,
              travels: scene.componentData.travels,
            }
          : {}),
      },
      null,
      2,
    );
    say(
      `${settings.mode === "story" ? "Story" : settings.mode === "isolated" ? "Isolated component" : "Commerce"} ready · ${scene.frameCount} frames · ${scene.fps} fps`,
    );
  } catch (error) {
    candidate?.dispose();
    if (run === generation)
      say(
        (error instanceof Error ? error.message : String(error)) +
          (active ? " Previous valid preview is preserved." : ""),
        true,
      );
  }
  sync();
}
for (const item of REUSABLE_EXAMPLES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.example = item.id;
  const kind = document.createElement("small");
  kind.textContent = item.kind;
  button.append(kind, document.createTextNode(item.title));
  button.addEventListener("click", () => {
    if (exporting) return;
    example = item.id;
    if (example === "stagger") field("count").value = "5";
    controls();
    void update();
  });
  element("examples").append(button);
}
form.addEventListener("input", () => {
  generation++;
  pause();
  dirty = true;
  sync();
  say("Changes pending. Apply to update the preview.");
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void update();
});
scrub.addEventListener("input", () => {
  pause();
  show(Number(scrub.value));
});
element("play").addEventListener("click", () => {
  if (playing) {
    pause();
    return;
  }
  if (!active) return;
  playing = true;
  element("play").textContent = "Pause";
  const initial =
      Number(scrub.value) >= active.scene.frameCount - 1
        ? 0
        : Number(scrub.value),
    start = performance.now();
  const tick = (now: number) => {
    if (!active || !playing) return;
    const frame =
      initial + Math.floor(((now - start) * active.scene.fps) / 1000);
    show(frame);
    if (frame >= active.scene.frameCount - 1) pause();
    else animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
});
element("save").addEventListener("click", () => {
  if (active && !dirty)
    download(
      encoder.encode(JSON.stringify(active.settings, null, 2) + "\n"),
      "components.demo.json",
      "application/json",
    );
});
element<HTMLInputElement>("load").addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > 64000) throw new Error("Settings file exceeds 64 KB");
    fill(ReusableDemoSchema.parse(JSON.parse(await file.text())));
    await update();
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  }
  (event.target as HTMLInputElement).value = "";
});
async function sourceFiles(current: Active) {
  const scene = structuredClone(current.scene);
  const files = await Promise.all(
    [...scene.assets, ...(scene.fonts ?? [])].map(async (asset) => {
      const response = await fetch(assetUrl(asset.id));
      if (!response.ok) throw new Error("Asset unavailable: " + asset.id);
      asset.path = "assets/" + asset.id + "." + asset.path.split(".").at(-1);
      return {
        id: asset.id,
        name: asset.path,
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );
  return { scene, files };
}
element("source").addEventListener("click", async () => {
  if (!active || dirty) return;
  try {
    const current = active,
      { scene, files } = await sourceFiles(current);
    download(
      createSourceZip([
        ...files,
        {
          name: "scene.json",
          bytes: encoder.encode(JSON.stringify(scene, null, 2) + "\n"),
        },
        {
          name: "components.demo.json",
          bytes: encoder.encode(
            JSON.stringify(current.settings, null, 2) + "\n",
          ),
        },
      ]),
      "shared-components.zip",
      "application/zip",
    );
  } catch (error) {
    say(String(error), true);
  }
});
element("export").addEventListener("click", async () => {
  if (!active || dirty || exporting) return;
  const current = active;
  pause();
  exporting = true;
  sync();
  say("Rendering MP4…");
  try {
    const { scene, files } = await sourceFiles(current);
    const encoded = files.map((file) => {
      let binary = "";
      for (const byte of file.bytes) binary += String.fromCharCode(byte);
      return { id: file.id, base64: btoa(binary) };
    });
    const response = await fetch("/commerce/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-still-shift": "commerce",
      },
      body: JSON.stringify({ scene, files: encoded }),
    });
    if (!response.ok)
      throw new Error(((await response.json()) as { error: string }).error);
    download(
      new Uint8Array(await response.arrayBuffer()),
      "shared-" + current.settings.mode + ".mp4",
      "video/mp4",
    );
    say("MP4 ready.");
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  } finally {
    exporting = false;
    sync();
  }
});
const params = new URLSearchParams(location.search);
const initial = ReusableDemoSchema.safeParse({
  schemaVersion: reusableDemoVersion(params.get("example") ?? "instances"),
  ...(params.has("mode") ? { mode: params.get("mode") } : {}),
  ...(params.has("example") ? { example: params.get("example") } : {}),
});
fill(
  initial.success
    ? initial.data
    : ReusableDemoSchema.parse({ schemaVersion: "reusable-demo-1" }),
);
await update();
