import {
  CommerceBriefSchema,
  type CommerceBrief,
  type CommerceScene,
} from "../../../packages/scene-contract/src/commerce.ts";
import {
  commerceCatalog,
  commerceCapabilities,
  commerceFormatRegistration,
  productionCommerceFormat,
} from "../../../packages/scene-contract/src/commerce-library.ts";
import type { CommerceSelection } from "../../../packages/scene-contract/src/commerce-catalog.ts";
import { buildCommerceScene } from "../../../packages/renderer-core/src/commerce-scene.ts";
import { compilePreparedScene } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import { createSourceZip, type BundleFile } from "./commerce-download.ts";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const value = (id: string) =>
  (element(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
    .value;
const set = (id: string, text: string | number) => {
  (element(id) as HTMLInputElement).value = String(text);
};
const canvas = element<HTMLCanvasElement>("commerce-preview");
const form = element<HTMLFormElement>("brief-form");
const scrub = input("scrub"),
  status = element("status");
let exampleFamily: "beauty" | undefined;
let selection: CommerceSelection = { kind: "format", id: "H03" };
let draft: CommerceBrief,
  imageBytes: Uint8Array,
  imageName = "sample-one.png";
let backdropFile: BundleFile | undefined;
let renderer: ReturnType<typeof createIllustratedPreview> | undefined;
let active:
  | { scene: CommerceScene; brief: CommerceBrief; files: BundleFile[] }
  | undefined;
let urls: string[] = [],
  generation = 0,
  playing = false,
  animation = 0,
  exporting = false;
let frame = 0,
  dirty = true;
const allEntries = [
  ...commerceCatalog.formats.map((item) => ({
    kind: "format" as const,
    id: item.id,
    name: item.name,
    group: item.group,
    search: item.keywords + " " + item.motion,
  })),
  ...commerceCatalog.recipes.map((item) => ({
    kind: "recipe" as const,
    id: item.id,
    name: item.name,
    group: "Ad recipes",
    search: item.formats,
  })),
];
const capability = (item: CommerceSelection) =>
  (item.kind === "format"
    ? commerceCapabilities.formats
    : commerceCapabilities.recipes
  ).find((entry) => entry.id === item.id)!;
const say = (message: string, error = false) => {
  status.textContent = message;
  status.classList.toggle("error", error);
};
function controls() {
  const disabled = dirty || !active || !capability(selection).implementation;
  for (const id of ["play", "restart", "export", "download"])
    element<HTMLButtonElement>(id).disabled =
      disabled || (id === "export" && exporting);
  element<HTMLButtonElement>("update").disabled =
    !capability(selection).implementation;
  scrub.disabled = disabled;
}
function pause() {
  playing = false;
  cancelAnimationFrame(animation);
  element("play").textContent = "Play";
}
function show(index: number) {
  if (!renderer || !active) return;
  frame = Math.max(0, Math.min(index, active.scene.frameCount - 1));
  renderer.renderFrame(frame);
  scrub.value = String(frame);
  element("timecode").textContent =
    (frame / active.scene.fps).toFixed(2) +
    " / " +
    (active.scene.frameCount / active.scene.fps).toFixed(2) +
    " s";
}
function invalidate() {
  dirty = true;
  generation++;
  pause();
  controls();
  say("Brief changed. Update the preview before exporting.");
}
const checksum = async (bytes: Uint8Array) =>
  "sha256:" +
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const blob = (bytes: Uint8Array, type: string) =>
  new Blob([new Uint8Array(bytes).buffer], { type });
const fetchBytes = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load " + url);
  return new Uint8Array(await response.arrayBuffer());
};
const numbers = (text: string) =>
  text.split(",").map((part) => Number(part.trim()));

function readBrief(): CommerceBrief {
  const callouts =
    value("art-direction") !== "floating" &&
    ["H04", "A01"].includes(selection.id)
      ? [0, 1].map((i) => ({
          text: value("callout-" + i),
          target: numbers(value("target-" + i)),
          source: value("source-" + i),
        }))
      : [];
  const fps = Number(value("fps")),
    duration = Number(value("duration"));
  if (!Number.isFinite(duration) || !Number.isInteger(duration * fps))
    throw new Error("Duration must resolve to a whole frame count");
  return CommerceBriefSchema.parse({
    ...draft,
    selection,
    title: selection.id + " / " + value("product-name"),
    locale: value("locale"),
    product: {
      ...draft.product,
      name: value("product-name"),
      imagePath: "assets/" + imageName,
      provenance: value("product-source"),
      preparation: value("preparation"),
      protectedRegion: numbers(value("protected-region")),
    },
    copy:
      value("art-direction") === "floating"
        ? { headlines: [], cta: "", source: "No overlay copy.", callouts: [] }
        : {
            headlines: [value("headline")],
            cta: value("cta"),
            source: value("copy-source"),
            callouts,
          },
    profile: value("profile"),
    artDirection: value("art-direction"),
    floating:
      value("art-direction") === "floating"
        ? {
            imagePath: backdropFile?.name ?? "missing-palm.png",
            provenance: value("backdrop-source"),
            placement: numbers(value("product-placement")),
            palmTop: Number(value("palm-top")),
          }
        : undefined,
    fps,
    frameCount: duration * fps,
    safeInset: Number(value("safe-inset")) / 100,
  });
}

async function updatePreview() {
  pause();
  const run = ++generation;
  dirty = true;
  active = undefined;
  controls();
  if (!capability(selection).implementation) return;
  const nextUrls: string[] = [];
  try {
    const brief = readBrief();
    renderNotes();
    say("Preparing image, text and timing…");
    const imageUrl = URL.createObjectURL(
      blob(imageBytes, "application/octet-stream"),
    );
    nextUrls.push(imageUrl);
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const backdropUrl =
      brief.floating && backdropFile
        ? URL.createObjectURL(
            blob(backdropFile.bytes, "application/octet-stream"),
          )
        : undefined;
    let backdropAsset;
    if (backdropUrl && backdropFile) {
      nextUrls.push(backdropUrl);
      const backdrop = new Image();
      backdrop.src = backdropUrl;
      await backdrop.decode();
      backdropAsset = {
        id: "backdrop-image",
        path: backdropFile.name,
        sha256: await checksum(backdropFile.bytes),
        width: backdrop.naturalWidth,
        height: backdrop.naturalHeight,
      };
    }
    const scene = buildCommerceScene(brief, {
      ...(backdropAsset ? { backdrop: backdropAsset } : {}),
      product: {
        id: "product-image",
        path: "assets/" + imageName,
        sha256: await checksum(imageBytes),
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      font: {
        id: "commerce-font",
        path: "assets/noto-sans-thai.ttf",
        sha256: await checksum(fontBytes),
        weight: brief.artDirection !== "standard" ? "400" : "600",
      },
    });
    const fontUrl = URL.createObjectURL(blob(fontBytes, "font/ttf"));
    nextUrls.push(fontUrl);
    const compiled = compilePreparedScene(scene);
    const images = await loadIllustratedImages(compiled, (id) =>
      id === "commerce-font"
        ? fontUrl
        : id === "backdrop-image"
          ? backdropUrl!
          : imageUrl,
    );
    if (run !== generation) {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }
    renderer?.dispose();
    renderer = createIllustratedPreview(canvas, compiled, images);
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = nextUrls;
    active = {
      scene,
      brief,
      files: [
        { name: "assets/" + imageName, bytes: imageBytes },
        { name: "assets/noto-sans-thai.ttf", bytes: fontBytes },
        ...(brief.floating && backdropFile ? [backdropFile] : []),
      ],
    };
    scrub.max = String(scene.frameCount - 1);
    dirty = false;
    canvas.hidden = false;
    element("empty-preview").hidden = true;
    show(
      brief.artDirection === "editorial"
        ? scene.frameCount - 1
        : brief.artDirection === "floating"
          ? 0
          : Math.floor(scene.frameCount * 0.5),
    );
    say(
      selection.id +
        " ready · " +
        scene.width +
        " × " +
        scene.height +
        " · " +
        scene.frameCount +
        " frames",
    );
  } catch (error) {
    nextUrls.forEach((url) => URL.revokeObjectURL(url));
    if (run === generation) {
      active = undefined;
      say(error instanceof Error ? error.message : String(error), true);
    }
  } finally {
    if (run === generation) controls();
  }
}

function renderCatalog() {
  const query = value("search").toLowerCase(),
    group = value("category"),
    availability = value("availability");
  const entries = allEntries
    .filter((entry) => {
      const implemented = Boolean(capability(entry).implementation);
      const production = productionCommerceFormat(entry);
      return (
        (!group || entry.group === group) &&
        (!query ||
          [entry.name, production?.name ?? "", entry.id, entry.search]
            .join(" ")
            .toLowerCase()
            .includes(query)) &&
        (!availability ||
          (availability === "production"
            ? Boolean(production)
            : availability === "experimental"
              ? !production
              : availability === "ready"
                ? implemented
                : !implemented))
      );
    })
    .sort(
      (a, b) =>
        Number(Boolean(productionCommerceFormat(b))) -
          Number(Boolean(productionCommerceFormat(a))) ||
        Number(Boolean(capability(b).implementation)) -
          Number(Boolean(capability(a).implementation)),
    );
  const list = element("catalog");
  list.replaceChildren();
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "format";
    button.dataset.id = entry.id;
    button.setAttribute("aria-pressed", String(selection.id === entry.id));
    for (const [className, content] of [
      ["id", entry.id],
      [
        "name",
        productionCommerceFormat(entry)?.name ??
          (entry.id === "A01" ? "Palm-up Product Float / A01" : entry.name),
      ],
    ] as const) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = content!;
      button.append(span);
    }
    const hint = document.createElement("small");
    hint.textContent = productionCommerceFormat(entry)
      ? "Production · 4:5 palm-up float"
      : capability(entry).implementation
        ? "Experimental"
        : "Experimental · Reference only";
    button.append(hint);
    button.addEventListener("click", () => {
      void selectEntry({ kind: entry.kind, id: entry.id }).catch((error) =>
        say(String(error), true),
      );
    });
    list.append(button);
  }
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No formats match these filters.";
    list.append(empty);
  }
  element("catalog-count").textContent = String(entries.length);
}

function renderNotes() {
  const format = commerceCatalog.formats.find(
    (entry) => entry.id === selection.id,
  );
  const recipe = commerceCatalog.recipes.find(
    (entry) => entry.id === selection.id,
  );
  element("selection-id").textContent =
    selection.id + (format ? " / " + format.motion : " / Recipe");
  const registered = commerceFormatRegistration(
    selection,
    value("art-direction"),
    value("profile"),
  );
  const production =
    registered.status === "production"
      ? productionCommerceFormat(selection)
      : undefined;
  const palmFloat =
    selection.kind === "recipe" &&
    selection.id === "A01" &&
    value("art-direction") === "floating" &&
    value("profile") === "feed";
  element("selection-title").textContent = palmFloat
    ? "Palm-up Product Float"
    : (production?.name ?? format?.name ?? recipe!.name);
  const ready = Boolean(capability(selection).implementation);
  element("support").textContent = production
    ? "Production · v" + production.version
    : ready
      ? "Experimental"
      : "Experimental · Reference only";
  element("support").dataset.stage = registered.status;
  const floating = value("art-direction") === "floating";
  element("callouts").hidden =
    floating || !["H04", "A01"].includes(selection.id);
  element("floating-fields").hidden = !floating;
  for (const id of ["headline", "cta", "copy-source"]) {
    const field = input(id);
    field.closest("label")!.hidden = floating;
    field.required = !floating;
  }
  element("callout-legend").textContent = "Product callouts";
  element("callout-label-0").textContent = "First callout";
  element("callout-label-1").textContent = "Second callout";
  element("callout-help").textContent =
    "Targets are fractions of the original image: x, y from 0 to 1.";
  const container = element("format-notes");
  container.replaceChildren();
  const table = document.createElement("dl");
  const notes = palmFloat
    ? [
        ["Format", "Palm-up Product Float · Experimental"],
        [
          "Assets",
          "One approved intact product cutout and a separate palm-up background.",
        ],
        [
          "Motion",
          "Stationary hand and camera; gentle vertical product hover.",
        ],
        [
          "Constraints",
          "Keep the supplied product intact, the palm and camera stationary, and a clear gap between hand and product. Use only a gentle vertical hover.",
        ],
      ]
    : format
      ? [
          ["Assets", format.asset],
          [
            "Motion",
            commerceCatalog.techniques.find((t) => t.id === format.motion)!
              .name,
          ],
          ["Hook", format.hook],
          ["Body", format.body],
          ["Close", format.close],
          ["Care", format.care],
        ]
      : [
          ["Formats", recipe!.formats],
          ["Assets", recipe!.assets],
          ["Hook", recipe!.hook],
          ["Body", recipe!.body],
          ["Close", recipe!.close],
        ];
  for (const [key, content] of notes) {
    const term = document.createElement("dt"),
      detail = document.createElement("dd");
    term.textContent = key!;
    detail.textContent = content!;
    table.append(term, detail);
  }
  container.append(table);
  for (const id of format?.refs ?? []) {
    const reference = commerceCatalog.references.find(
      (entry) => entry.id === id,
    )!;
    const link = document.createElement("a");
    link.href = reference.url;
    link.textContent = reference.title;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(link);
  }
}

async function selectEntry(next: CommerceSelection) {
  if (
    next.kind === "recipe" &&
    next.id === "A01" &&
    exampleFamily !== "beauty"
  ) {
    await loadFixture("a01-beauty-feed");
    return;
  }
  if (exampleFamily === "beauty" && capability(next).implementation) {
    const fields = [
      "headline",
      "cta",
      "copy-source",
      "product-name",
      "locale",
      "fps",
      "duration",
    ];
    if (
      ["H04", "A01"].includes(selection.id) &&
      value("art-direction") !== "floating" &&
      next.id !== "A01"
    )
      for (const index of [0, 1])
        fields.push("callout-" + index, "source-" + index, "target-" + index);
    const preserved = Object.fromEntries(
      fields
        .map((id) => [id, value(id)])
        .filter(([, content]) => content !== ""),
    );
    if (next.id === "A01" && Number(preserved.duration) < 10)
      preserved.duration = "10";
    await loadFixture(next.id.toLowerCase() + "-beauty-feed", preserved);
    return;
  }
  selection = next;
  invalidate();
  renderCatalog();
  renderNotes();
  if (selection.id === "A01" && Number(value("duration")) < 10)
    set("duration", 10);
  if (!capability(selection).implementation) {
    renderer?.dispose();
    active = undefined;
    canvas.hidden = true;
    element("empty-preview").hidden = false;
    say("Reference only. Review the assets and storyboard in Format notes.");
    controls();
    return;
  }
  await updatePreview();
}

function fillForm(brief: CommerceBrief) {
  draft = brief;
  selection = brief.selection;
  for (const [id, content] of Object.entries({
    "product-name": brief.product.name,
    preparation: brief.product.preparation,
    headline: brief.copy.headlines.join("\n"),
    cta: brief.copy.cta,
    profile: brief.profile,
    "art-direction": brief.artDirection,
    locale: brief.locale,
    fps: brief.fps,
    duration: brief.frameCount / brief.fps,
    "product-source": brief.product.provenance,
    "copy-source": brief.copy.source,
    "protected-region": brief.product.protectedRegion.join(", "),
    "safe-inset": brief.safeInset * 100,
    "backdrop-source": brief.floating?.provenance ?? "",
    "product-placement":
      brief.floating?.placement.join(", ") ?? "0.3, 0.2, 0.4",
    "palm-top": brief.floating?.palmTop ?? 0.74,
  }))
    set(id, content);
  const callouts = brief.copy.callouts.length
    ? brief.copy.callouts
    : [
        {
          text: "Illustrated cap",
          target: [0.5, 0.17],
          source: "Visible cap in the original fixture",
        },
        {
          text: "Sample container",
          target: [0.32, 0.77],
          source: "Visible original fixture outline",
        },
      ];
  callouts.forEach((callout, i) => {
    set("callout-" + i, callout.text);
    set("target-" + i, callout.target.join(", "));
    set("source-" + i, callout.source);
  });
  renderCatalog();
  renderNotes();
}
async function loadFixture(
  name = "h03-landscape",
  preserved: Record<string, string> = {},
) {
  invalidate();
  const request = generation;
  const briefResponse = await fetch("/commerce/scenes/" + name + ".brief.json");
  if (!briefResponse.ok) throw new Error("Could not load the selected example");
  const brief = CommerceBriefSchema.parse(await briefResponse.json());
  const filename = brief.product.imagePath.split("/").at(-1)!;
  const bytes = await fetchBytes("/commerce/assets/" + filename);
  const backdropName = brief.floating?.imagePath.split("/").at(-1);
  const backdropBytes = backdropName
    ? await fetchBytes("/commerce/assets/" + backdropName)
    : undefined;
  if (request !== generation) return;
  backdropFile =
    backdropBytes && backdropName
      ? { name: "assets/" + backdropName, bytes: backdropBytes }
      : undefined;
  input("backdrop-file").value = "";
  imageName = filename;
  imageBytes = bytes;
  exampleFamily = name.includes("-beauty-") ? "beauty" : undefined;
  input("product-file").value = "";
  element("fixture-note").hidden = false;
  element("fixture-note").textContent = brief.product.provenance;
  fillForm(brief);
  for (const [id, content] of Object.entries(preserved)) set(id, content);
  await updatePreview();
}

function download(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(blob(bytes, mime));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function base64(bytes: Uint8Array) {
  let result = "";
  for (let start = 0; start < bytes.length; start += 8192)
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(result);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void updatePreview();
});
form.addEventListener("input", () => {
  invalidate();
  renderNotes();
});
for (const id of ["search", "category", "availability"])
  element(id).addEventListener("input", renderCatalog);
element("load-beauty").addEventListener("click", () => {
  void loadFixture("h03-beauty-feed").catch((error) =>
    say(String(error), true),
  );
});
element("load-thai").addEventListener("click", () => {
  void loadFixture("h03-thai").catch((error) => say(String(error), true));
});
input("product-file").addEventListener("change", async () => {
  const file = input("product-file").files?.[0];
  if (!file) return;
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 20_000_000
  ) {
    say("Choose a PNG, JPEG or WebP image under 20 MB.", true);
    return;
  }
  imageName =
    "product." +
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[
      file.type
    ];
  imageBytes = new Uint8Array(await file.arrayBuffer());
  exampleFamily = undefined;
  const floating = value("art-direction") === "floating";
  if (!floating) {
    backdropFile = undefined;
    draft.floating = undefined;
    set("backdrop-source", "");
  }
  draft.product.id = file.name;
  set("product-name", file.name.replace(/\.[^.]+$/, ""));
  set("preparation", floating ? "cutout" : "photo");
  set("product-source", "");
  set("copy-source", "");
  set("headline", "");
  set("cta", "");
  for (const i of [0, 1]) {
    set("callout-" + i, "");
    set("source-" + i, "");
  }
  element("fixture-note").hidden = true;
  document.querySelector<HTMLDetailsElement>(".asset-details")!.open = true;
  invalidate();
  say(
    floating
      ? "Product loaded. Add its source and check its size and clearance above the hand."
      : "Image loaded. Add your copy and sources, and check the protected label region.",
  );
});
input("backdrop-file").addEventListener("change", async () => {
  const file = input("backdrop-file").files?.[0];
  if (!file) return;
  if (
    !["image/png", "image/webp"].includes(file.type) ||
    file.size > 20_000_000
  ) {
    say("Choose a PNG or WebP under 20 MB.", true);
    return;
  }
  backdropFile = {
    name:
      "assets/palm-background." + (file.type === "image/png" ? "png" : "webp"),
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
  set("backdrop-source", "");
  invalidate();
  say(
    "Palm background loaded. Check its source and the product clearance before updating.",
  );
});
scrub.addEventListener("input", () => {
  pause();
  show(Number(scrub.value));
});
element("restart").addEventListener("click", () => {
  pause();
  show(0);
});
element("play").addEventListener("click", () => {
  if (playing) {
    pause();
    return;
  }
  if (!active) return;
  if (frame >= active.scene.frameCount - 1) show(0);
  const startFrame = frame,
    start = performance.now();
  playing = true;
  element("play").textContent = "Pause";
  const tick = () => {
    if (!active || !playing) return;
    show(
      startFrame +
        Math.floor(((performance.now() - start) * active.scene.fps) / 1000),
    );
    if (frame >= active.scene.frameCount - 1) pause();
    else animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
});
element("download").addEventListener("click", async () => {
  if (!active || dirty) return;
  const snapshot = active,
    encode = (data: unknown) =>
      new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n");
  try {
    const files = [
      ...snapshot.files,
      { name: "scene.json", bytes: encode(snapshot.scene) },
      { name: "brief.json", bytes: encode(snapshot.brief) },
      {
        name: "assets/OFL.txt",
        bytes: await fetchBytes("/commerce/assets/OFL.txt"),
      },
      {
        name: "README.md",
        bytes: new TextEncoder().encode(
          "# Commerce source bundle\n\nUnzip this folder. From a Still Shift checkout, run:\n\npnpm still-shift animate-scene --scene /absolute/path/to/scene.json --output /absolute/path/to/output.mp4\n\nbrief.json is the editable source; scene.json is its prepared scene. Image and pinned font bytes are under assets/. Their checksums are recorded in scene.json. The font is Noto Sans Thai; its license is included. Product and copy provenance are recorded in the brief.\n",
        ),
      },
    ];
    download(
      createSourceZip(files),
      snapshot.scene.recipe.preset.toLowerCase() + "-source.zip",
      "application/zip",
    );
  } catch (error) {
    say(String(error), true);
  }
});
element("export").addEventListener("click", async () => {
  if (!active || dirty || exporting) return;
  const snapshot = active;
  exporting = true;
  controls();
  say("Rendering your MP4…");
  try {
    const files = [...snapshot.scene.assets, ...snapshot.scene.fonts].map(
      (asset) => {
        const file = snapshot.files.find((file) => file.name === asset.path);
        if (!file) throw new Error("Missing export asset: " + asset.path);
        return { id: asset.id, base64: base64(file.bytes) };
      },
    );
    const response = await fetch("/commerce/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Still-Shift": "commerce",
      },
      body: JSON.stringify({ scene: snapshot.scene, files }),
    });
    if (!response.ok) throw new Error(await response.text());
    download(
      new Uint8Array(await response.arrayBuffer()),
      snapshot.scene.recipe.preset.toLowerCase() +
        "-" +
        snapshot.scene.metadata.profile +
        ".mp4",
      "video/mp4",
    );
    say("MP4 exported. Save the source bundle to reproduce this edit.");
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  } finally {
    exporting = false;
    controls();
  }
});
for (const group of [...new Set(allEntries.map((entry) => entry.group))]) {
  const option = document.createElement("option");
  option.value = group;
  option.textContent = group;
  element("category").append(option);
}
const fontBytes = await fetchBytes("/commerce/assets/noto-sans-thai.ttf");
await loadFixture(
  new URL(location.href).searchParams.get("fixture") ?? "h03-landscape",
).catch((error) => say(String(error), true));
