import {
  REUSABLE_EXAMPLES,
  reusableDemoVersion,
  ReusableDemoSchema,
  type ReusableDemo,
} from "../../../packages/scene-contract/src/reusable-component-demo.ts";
import { buildReusableDemo } from "../../../packages/renderer-core/src/reusable-component-demo.ts";
import { compilePreparedScene } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  type createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { indexStoryEvents } from "../../../packages/renderer-core/src/story-event-index.ts";
import { createSourceZip, download } from "./commerce-download.ts";
import { postCommerceExport } from "./commerce-export.ts";
import { createPreviewSession } from "./preview-session.ts";

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
let example: ReusableDemo["example"] = "instances";
type Active = {
  settings: ReusableDemo;
  scene: ReturnType<typeof buildReusableDemo>;
  resolvedTextSizes: ReturnType<
    typeof createIllustratedPreview
  >["resolvedTextSizes"];
};
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
function say(message: string, error = false) {
  element("status").textContent = message;
  element("status").dataset.error = String(error);
}
const preview = createPreviewSession<Active>({
  controls: {
    play: element<HTMLButtonElement>("play"),
    scrub,
    export: element<HTMLButtonElement>("export"),
    downloads: [
      element<HTMLButtonElement>("source"),
      element<HTMLButtonElement>("save"),
    ],
    frame: element("frame"),
    edit: [
      ...form.querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement
      >("button,input,select"),
    ],
  },
  status: say,
  ready: showDetails,
  disableWhileExporting: true,
});
function controls() {
  const item = REUSABLE_EXAMPLES.find((e) => e.id === example)!;
  element("title").textContent = item.title;
  element("kind").textContent = item.kind;
  element("description").textContent = item.description;
  const visible = new Set<string>(item.controls);
  form.querySelectorAll<HTMLElement>("[data-control]").forEach((control) => {
    control.hidden = !visible.has(control.dataset.control ?? "");
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
  const version = reusableDemoVersion(example);
  return ReusableDemoSchema.parse({
    schemaVersion: version,
    ...(version === "reusable-demo-2"
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
    ...(version === "reusable-demo-3"
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
    ...(version === "reusable-demo-1"
      ? Object.fromEntries(
          [
            "count",
            "gap",
            "stagger",
            "middleDelay",
            "from",
            "to",
            "decimals",
          ].map((key) => [key, Number(field(key).value)]),
        )
      : version === "reusable-demo-3"
        ? { middleDelay: Number(field("middleDelay").value) }
        : {}),
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
  await preview.load(async (resources) => {
    say("Preparing changes…");
    const settings = readSettings(),
      scene = buildReusableDemo(settings),
      compiled = compilePreparedScene(scene);
    const images = await loadIllustratedImages(compiled, assetUrl);
    const renderer = resources.preview(canvas, compiled, images);
    return {
      snapshot: {
        settings,
        scene,
        resolvedTextSizes: renderer.resolvedTextSizes,
      },
      initialFrame: preview.frame,
    };
  });
}
function showDetails(active: Active) {
  const { scene, settings } = active;
  canvas.style.aspectRatio = `${scene.width} / ${scene.height}`;
  element("handles").textContent = JSON.stringify(
    {
      nodes: scene.nodes.filter((n) => n.id.includes("__")).map((n) => n.id),
      timing:
        scene.schemaVersion === "story-scene-1"
          ? indexStoryEvents(scene)
          : scene.events.filter((e) => e.node.includes("__")),
      values: scene.componentData?.values,
      resolvedTextSizes: active.resolvedTextSizes,
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
}

for (const item of REUSABLE_EXAMPLES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.example = item.id;
  const kind = document.createElement("small");
  kind.textContent = item.kind;
  button.append(kind, document.createTextNode(item.title));
  button.addEventListener("click", () => {
    if (preview.exporting) return;
    example = item.id;
    if (example === "stagger") field("count").value = "5";
    controls();
    void update();
  });
  element("examples").append(button);
}
form.addEventListener("input", () => {
  preview.invalidate();
  say("Changes pending. Apply to update the preview.");
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void update();
});
element("save").addEventListener("click", () => {
  const active = preview.snapshot;
  if (active)
    download(
      encoder.encode(JSON.stringify(active.settings, null, 2) + "\n"),
      "components.demo.json",
      "application/json",
    );
});
element<HTMLInputElement>("load").addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await preview.edit(
    async () => {
      if (file.size > 64000) throw new Error("Settings file exceeds 64 KB");
      return ReusableDemoSchema.parse(JSON.parse(await file.text()));
    },
    async (settings) => {
      fill(settings);
      await update();
    },
  );
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
        name: asset.path,
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );
  return { scene, files };
}
element("source").addEventListener("click", async () => {
  const active = preview.snapshot;
  if (!active) return;
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
element("export").addEventListener("click", () => {
  void preview.export(async (current) => {
    say("Rendering MP4…");
    const { scene, files } = await sourceFiles(current);
    const response = await postCommerceExport(scene, files);
    if (!response.ok)
      throw new Error(((await response.json()) as { error: string }).error);
    download(
      new Uint8Array(await response.arrayBuffer()),
      "shared-" + current.settings.mode + ".mp4",
      "video/mp4",
    );
    return "MP4 ready.";
  });
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
