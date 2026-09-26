import { SpatialDemoKindSchema } from "../../../packages/scene-contract/src/commerce-spatial-demos.ts";
import {
  EFFECT_DEMOS,
  EffectDemoKindSchema,
} from "../../../packages/scene-contract/src/commerce-effects.ts";
import {
  COMPONENT_DEMOS,
  ComponentDemoKindSchema,
  ComponentDemoSchema,
  defaultComponentDemo,
  type ComponentDemoKind,
  type ComponentDemo,
} from "../../../packages/scene-contract/src/commerce-components.ts";
import {
  CommerceSceneSchema,
  type CommerceScene,
} from "../../../packages/scene-contract/src/commerce.ts";
import { buildCommerceComponentDemo } from "../../../packages/renderer-core/src/commerce-component-demos.ts";
import { prepareCommerceShadow } from "../../../packages/animation-engine/src/commerce-shadow.ts";
import { DEFAULT_SHADOW_TEXTURE } from "../../../packages/renderer-core/src/shadow-texture.ts";
import { compilePreparedScene } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import {
  createSourceZip,
  download,
  type BundleFile,
} from "./commerce-download.ts";
import { postCommerceExport } from "./commerce-export.ts";
import { createCommercePreviewController } from "./commerce-preview-controller.ts";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const field = (id: string) => element<HTMLInputElement>(id);
const canvas = element<HTMLCanvasElement>("commerce-preview");
const form = element<HTMLFormElement>("component-form");
let kind: ComponentDemoKind = ComponentDemoKindSchema.catch("studio").parse(
  new URLSearchParams(location.search).get("demo"),
);
let renderer: ReturnType<typeof createIllustratedPreview> | undefined;
let baselineRenderer: ReturnType<typeof createIllustratedPreview> | undefined;
let active:
  | { scene: CommerceScene; options: ComponentDemo; files: BundleFile[] }
  | undefined;
let urls: string[] = [];
const blob = (bytes: Uint8Array, type: string) =>
  new Blob([new Uint8Array(bytes).buffer], { type });
const bytes = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Could not load " + path);
  return new Uint8Array(await response.arrayBuffer());
};
const encode = (text: string) => new TextEncoder().encode(text);
const say = (text: string, error = false) => {
  element("status").textContent = text;
  element("status").classList.toggle("error", error);
};
const preview = createCommercePreviewController({
  controls: {
    play: element<HTMLButtonElement>("play"),
    restart: element<HTMLButtonElement>("restart"),
    scrub: field("scrub"),
    download: element<HTMLButtonElement>("download"),
    export: element<HTMLButtonElement>("export"),
    timecode: element("timecode"),
  },
  scene: () => active?.scene,
  renderFrame: (frame) => {
    renderer?.renderFrame(frame);
    if (field("compare").checked) baselineRenderer?.renderFrame(frame);
  },
  disableWhileExporting: true,
  restartOnFirstPlay: true,
});
function invalidate() {
  preview.invalidate();
  say("Settings changed. Update the preview before exporting.");
}
function fill(options: ComponentDemo) {
  const values = {
    "spatial-scale": options.spatial?.scale ?? 1.08,
    "spatial-rotation": options.spatial?.rotation ?? 3,
    "anchor-x": options.spatial?.anchor[0] ?? 0.5,
    "anchor-y": options.spatial?.anchor[1] ?? 0.12,
    "layout-profile": options.spatial?.profile ?? "feed",
    "product-x": options.product.x,
    "product-y": options.product.y,
    "product-width": options.product.width,
    "shadow-x": options.shadow.x,
    "shadow-y": options.shadow.y,
    "shadow-width": options.shadow.width,
    "shadow-height": options.shadow.height,
    "shadow-opacity": options.shadow.opacity,
    "shadow-softness": options.shadow.softness,
    "shadow-color": options.shadow.color,
    travel: options.travel,
    cycles: options.cycles,
    "demo-text": options.text,
    locale: options.locale,
    background: options.background,
    fps: options.fps,
    duration: options.frameCount / options.fps,
    "effect-amount": options.treatment?.amount ?? 1,
    "effect-shutter": options.treatment?.shutterAngle ?? 180,
    "effect-samples": options.treatment?.samples ?? 16,
    "effect-seed": options.treatment?.seed ?? 37,
  };
  for (const [id, value] of Object.entries(values))
    field(id).value = String(value);
  const spatial = SpatialDemoKindSchema.safeParse(kind).success;
  element("spatial-controls").hidden = !spatial;
  element("scale-control").hidden = !["anchor", "scale"].includes(kind);
  element("rotation-control").hidden = !["anchor", "rotate"].includes(kind);
  for (const id of ["anchor-x-control", "anchor-y-control"])
    element(id).hidden = !["anchor", "attachment", "sequence"].includes(kind);
  element("matte-invert-control").hidden = kind !== "matte";
  element("layout-profile-control").hidden = kind !== "layout";
  field("matte-invert").checked = options.spatial?.invert ?? false;
  element("spatial-note").textContent =
    kind === "matte"
      ? "The soft mask moves independently; the original product image stays intact."
      : kind === "layout"
        ? "Copy keeps its wording. Text that cannot fit at the minimum size needs a larger layout."
        : kind === "sequence"
          ? "Introduction 0–25%, feature 25–72%, close 72–100%. Each segment has an explicit visibility window."
          : kind === "detail"
            ? "This crop uses the original image pixels. A larger source is needed for a larger detail view."
            : "Anchor coordinates refer to the original image, including its transparent padding. The product pivots near its base.";
  const effect = EFFECT_DEMOS.find((demo) => demo.id === kind);
  element("effect-controls").hidden = !effect;
  element("compare-control").hidden = !effect;
  field("effect-enabled").checked = options.treatment?.enabled ?? true;
  element("effect-amount-label").textContent =
    effect?.amountLabel ?? "Strength";
  element("shutter-control").hidden = kind !== "motion-blur";
  element("samples-control").hidden = ![
    "motion-blur",
    "directional-blur",
  ].includes(kind);
  element("sampling-note").hidden = ![
    "motion-blur",
    "directional-blur",
  ].includes(kind);
  element("seed-control").hidden = !["grain", "particles"].includes(kind);
  if (!effect) field("compare").checked = false;
  syncComparison();
  element("product-controls").hidden =
    !effect &&
    !spatial &&
    ![
      "product",
      "float",
      "translate",
      "fade",
      "studio",
      "introduction",
      "callout",
    ].includes(kind);
  if (kind === "layout") element("product-controls").hidden = true;
  element("shadow-controls").hidden =
    !["shadow", "studio"].includes(kind) &&
    (!effect ||
      ["motion-blur", "directional-blur", "overshoot", "echo"].includes(kind));
  element("shadow-description").textContent = [
    "height-shadow",
    "effects-studio",
  ].includes(kind)
    ? "A flat studio shadow responds to the product’s height."
    : "A flat, stationary depth cue. Placed independently of the product.";
  element("text-controls").hidden = ![
    "text",
    "introduction",
    "callout",
    "attachment",
    "detail",
    "layout",
    "sequence",
  ].includes(kind);
  element("float-controls").hidden =
    !["float", "studio", "anchor", "attachment", "sequence"].includes(kind) &&
    (!effect ||
      ["motion-blur", "directional-blur", "overshoot", "echo"].includes(kind));
  const demo = COMPONENT_DEMOS.find((d) => d.id === kind)!;
  element("component-title").textContent = demo.name;
  element("component-kind").textContent = demo.group;
  element("component-description").textContent = demo.description;
  document
    .querySelectorAll<HTMLButtonElement>("#component-catalog button")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.demo === kind)),
    );
}
function readOptions() {
  const number = (id: string) => Number(field(id).value);
  return ComponentDemoSchema.parse({
    ...(EffectDemoKindSchema.safeParse(kind).success
      ? {
          treatment: {
            enabled: field("effect-enabled").checked,
            amount: number("effect-amount"),
            shutterAngle: number("effect-shutter"),
            samples: number("effect-samples"),
            seed: number("effect-seed"),
          },
        }
      : {}),
    ...(SpatialDemoKindSchema.safeParse(kind).success
      ? {
          spatial: {
            scale: number("spatial-scale"),
            rotation: number("spatial-rotation"),
            anchor: [number("anchor-x"), number("anchor-y")],
            invert: field("matte-invert").checked,
            profile: field("layout-profile").value,
          },
        }
      : {}),
    schemaVersion: "commerce-component-demo-1",
    kind,
    fps: number("fps"),
    frameCount: number("fps") * number("duration"),
    background: field("background").value,
    product: {
      x: number("product-x"),
      y: number("product-y"),
      width: number("product-width"),
    },
    shadow: {
      x: number("shadow-x"),
      y: number("shadow-y"),
      width: number("shadow-width"),
      height: number("shadow-height"),
      opacity: number("shadow-opacity"),
      softness: number("shadow-softness"),
      color: field("shadow-color").value,
    },
    travel: number("travel"),
    cycles: number("cycles"),
    text: field("demo-text").value,
    locale: field("locale").value,
  });
}
const source = fetch("/commerce/scenes/a01-beauty-feed.json").then(
  async (response) => {
    if (!response.ok)
      throw new Error("Could not load the approved demo assets");
    const original = CommerceSceneSchema.parse(await response.json());
    const product = { ...original.assets[0]!, path: "assets/product.png" };
    const font = { ...original.fonts[0]!, path: "assets/noto-sans-thai.ttf" };
    const [productBytes, fontBytes, license] = await Promise.all([
      bytes("/commerce/assets/beauty-floating-product-v1.png"),
      bytes("/commerce/assets/noto-sans-thai.ttf"),
      bytes("/commerce/assets/OFL.txt"),
    ]);
    return {
      product,
      font,
      files: [
        { name: product.path, bytes: productBytes },
        { name: font.path, bytes: fontBytes },
        { name: "assets/OFL.txt", bytes: license },
      ],
    };
  },
);
async function update() {
  invalidate();
  const run = preview.generation;
  active = undefined;
  const pendingUrls: string[] = [];
  try {
    const options = readOptions();
    const assets = await source;
    const shadow = await prepareCommerceShadow({
      ...DEFAULT_SHADOW_TEXTURE,
      softness: options.shadow.softness,
      color: options.shadow.color,
    });
    const scene = buildCommerceComponentDemo(options, {
      ...assets,
      shadow: shadow.asset,
    });
    const files = [
      ...assets.files,
      ...(scene.assets.some((a) => a.id === shadow.asset.id)
        ? [
            { name: shadow.asset.path, bytes: shadow.bytes },
            {
              name: "shadow-preparation.json",
              bytes: encode(JSON.stringify(shadow.preparation, null, 2)),
            },
          ]
        : []),
    ];
    const urlsById = new Map<string, string>();
    for (const dependency of [...scene.assets, ...scene.fonts]) {
      const file = files.find((file) => file.name === dependency.path)!;
      const url = URL.createObjectURL(
        blob(file.bytes, "application/octet-stream"),
      );
      pendingUrls.push(url);
      urlsById.set(dependency.id, url);
    }
    const compiled = compilePreparedScene(scene);
    const images = await loadIllustratedImages(
      compiled,
      (id) => urlsById.get(id)!,
    );
    if (!preview.isCurrent(run)) {
      pendingUrls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }
    renderer?.dispose();
    baselineRenderer?.dispose();
    baselineRenderer = undefined;
    if (options.treatment) {
      const baseline = buildCommerceComponentDemo(
        { ...options, treatment: { ...options.treatment, enabled: false } },
        { ...assets, shadow: shadow.asset },
      );
      baselineRenderer = createIllustratedPreview(
        element<HTMLCanvasElement>("baseline-preview"),
        compilePreparedScene(baseline),
        images,
      );
    }
    renderer = createIllustratedPreview(canvas, compiled, images);
    canvas.style.aspectRatio = `${scene.width} / ${scene.height}`;
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = pendingUrls;
    active = { scene, options, files };
    const sampleFrame = ["motion-blur", "directional-blur", "echo"].includes(
      kind,
    )
      ? Math.round(scene.fps * 0.45)
      : kind === "overshoot"
        ? Math.round(scene.fps * 1.22)
        : kind === "focus-blur"
          ? Math.round(scene.fps * 0.8)
          : Math.round((scene.frameCount - 1) / (options.cycles * 4));
    preview.activate(
      options.treatment ? sampleFrame : Math.floor(scene.frameCount / 2),
    );
    say(
      `${scene.title} ready · ${scene.width} × ${scene.height} · ${scene.frameCount} frames`,
    );
  } catch (error) {
    pendingUrls.forEach((url) => URL.revokeObjectURL(url));
    if (preview.isCurrent(run)) {
      renderer?.dispose();
      renderer = undefined;
      baselineRenderer?.dispose();
      baselineRenderer = undefined;
      say(error instanceof Error ? error.message : String(error), true);
    }
  }
  preview.syncControls();
}
function syncComparison() {
  const compare = field("compare").checked;
  element("baseline-figure").hidden = !compare;
  element("treatment-caption").hidden = !compare;
  element("comparison").classList.toggle("comparing", compare);
}
field("compare").addEventListener("change", () => {
  syncComparison();
  preview.show(preview.frame);
});

for (const demo of COMPONENT_DEMOS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "format";
  button.dataset.demo = demo.id;
  const title = document.createElement("span");
  title.className = "name";
  title.textContent = demo.name;
  const group = document.createElement("small");
  group.textContent = demo.group;
  button.append(title, group);
  button.addEventListener("click", () => {
    kind = demo.id;
    fill(defaultComponentDemo(kind));
    history.replaceState(null, "", "?demo=" + kind);
    void update();
  });
  element("component-catalog").append(button);
}
form.addEventListener("input", invalidate);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void update();
});
element("download").addEventListener("click", () => {
  if (!active || preview.dirty) return;
  download(
    createSourceZip([
      ...active.files,
      {
        name: "scene.json",
        bytes: encode(JSON.stringify(active.scene, null, 2)),
      },
      {
        name: "demo.json",
        bytes: encode(JSON.stringify(active.options, null, 2)),
      },
      {
        name: "README.txt",
        bytes: encode(
          "Experimental commerce component example.\nRender from this directory with the Still Shift CLI:\npnpm --dir /path/to/still-shift still-shift animate-scene --scene /path/to/bundle/scene.json --output /path/to/output.mp4\nThe scene is the complete export input. demo.json retains editable settings; shadow-preparation.json records the deterministic texture settings when used. Effect parameters, product landmarks, protected regions, attachments, text fitting, alpha mattes and visibility windows are stored in scene.json; spatial rendering uses commerce-canvas-0.16.0. Masks are applied after layer effects in canvas space. Sequence windows use inclusive starts and exclusive ends; exposure clamps at cuts. Assets and pinned font license are included.\n",
        ),
      },
    ]),
    kind + "-source.zip",
    "application/zip",
  );
});
element("export").addEventListener("click", async () => {
  if (!active || preview.dirty || preview.exporting) return;
  const snapshot = active;
  preview.setExporting(true);
  say("Rendering the prepared scene…");
  try {
    const response = await postCommerceExport(snapshot.scene, snapshot.files);
    if (!response.ok) throw new Error((await response.json()).error);
    download(
      new Uint8Array(await response.arrayBuffer()),
      snapshot.options.kind + ".mp4",
      "video/mp4",
    );
    if (active === snapshot && !preview.dirty)
      say(`${snapshot.scene.title} exported.`);
  } catch (error) {
    if (active === snapshot) say(String(error), true);
  } finally {
    preview.setExporting(false);
  }
});
function filterCatalog() {
  const filter = field("catalog-filter").value;
  document
    .querySelectorAll<HTMLButtonElement>("#component-catalog button")
    .forEach((button) => {
      const effect = EffectDemoKindSchema.safeParse(
        button.dataset.demo,
      ).success;
      button.hidden =
        filter === "components"
          ? effect
          : filter === "effects"
            ? !effect
            : false;
    });
}
field("catalog-filter").value = EffectDemoKindSchema.safeParse(kind).success
  ? "effects"
  : "all";
field("catalog-filter").addEventListener("change", filterCatalog);
filterCatalog();
fill(defaultComponentDemo(kind));
void update();
