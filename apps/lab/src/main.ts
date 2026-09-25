import {
  analyzeDepthSafety,
  applySafetyToScene,
  createWebGLPreview,
  evaluateFrame,
  isFlatPreset,
  resolvePreviewScene,
  type PreviewIntensity,
  type PreviewPreset,
  type PreviewScene,
  type SafetyAssessment,
  type WebGLPreview,
} from "../../../packages/renderer-core/src/index.ts";
import type { z } from "zod";

import {
  ApiErrorSchema,
  CorpusResponseSchema,
  PreparedEntrySchema,
  type CorpusEntry,
  type PreparedEntry,
  type PreviewPair,
} from "../lab-contract.ts";
import "./style.css";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing lab element: ${id}`);
  return element as T;
};

const canvas = byId<HTMLCanvasElement>("preview");
const frameSlider = byId<HTMLInputElement>("frame");
const playButton = byId<HTMLButtonElement>("play");
const select = byId<HTMLSelectElement>("corpus-entry");
const prepareButton = byId<HTMLButtonElement>("prepare");
const galleryButton = byId<HTMLButtonElement>("build-gallery");
const presetSelect = byId<HTMLSelectElement>("preset");
const intensitySelect = byId<HTMLSelectElement>("intensity");
const seedInput = byId<HTMLInputElement>("seed");
const sourceInput = byId<HTMLInputElement>("local-source");
const depthInput = byId<HTMLInputElement>("local-depth");
const status = byId<HTMLElement>("status");
const sourceImage = byId<HTMLImageElement>("source-image");
const depthImage = byId<HTMLImageElement>("depth-image");
const parameters = byId<HTMLElement>("parameters");
const gallery = byId<HTMLElement>("gallery");
const corpusEntries: CorpusEntry[] = [];
const posters = new Map<string, string>();
let scene: PreviewScene | null = null;
let renderer: WebGLPreview | null = null;
let timer: number | null = null;
let currentFrame = 0;
let localUrls: string[] = [];
let previewRequestId = 0;
let activeImages: {
  name: string;
  pair: PreviewPair;
  source: HTMLImageElement;
  depth: HTMLImageElement;
} | null = null;
const safetyAssessments = new WeakMap<HTMLImageElement, SafetyAssessment>();

const depthPresets: PreviewPreset[] = [
  "slow_push",
  "horizontal_drift",
  "cinematic_float",
];
const editorialPresets: PreviewPreset[] = [
  "locked_hold",
  "story_settle",
  "panel_reveal",
  "comparison_step",
];
const galleryPresets = (): PreviewPreset[] =>
  isFlatPreset(presetSelect.value as PreviewPreset)
    ? editorialPresets
    : depthPresets;

const stop = (): void => {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  playButton.textContent = "Play";
  playButton.setAttribute("aria-label", "Play preview");
};

const formatTime = (frame: number, fps: number): string => {
  const seconds = Math.floor(frame / fps);
  const frames = frame % fps;
  return `${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
};

const showFrame = (frameIndex: number): void => {
  if (!scene || !renderer) return;
  currentFrame = frameIndex;
  renderer.renderFrame(frameIndex);
  frameSlider.value = String(frameIndex);
  const frame = evaluateFrame(scene, frameIndex);
  byId<HTMLElement>("timecode").textContent =
    `${formatTime(frameIndex, scene.timeline.fps)} / ${formatTime(scene.timeline.frameCount, scene.timeline.fps)}`;
  parameters.textContent = JSON.stringify(
    {
      rendererVersion: scene.rendererVersion,
      presetVersion: scene.presetVersion,
      source: scene.source,
      canvas: scene.canvas,
      timeline: scene.timeline,
      motion: scene.motion,
      quality: scene.quality,
      evaluatedFrame: frame,
      warnings: scene.warnings,
    },
    null,
    2,
  );
};

const loadImage = async (url: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
};

const analyzePair = (
  source: HTMLImageElement,
  depth: HTMLImageElement,
): SafetyAssessment => {
  const cached = safetyAssessments.get(depth);
  if (cached) return cached;
  const scale = Math.min(256 / source.naturalWidth, 256 / source.naturalHeight);
  const width = Math.max(2, Math.round(source.naturalWidth * scale));
  const height = Math.max(2, Math.round(source.naturalHeight * scale));
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = width;
  analysisCanvas.height = height;
  const context = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas is required for safety analysis");
  context.drawImage(source, 0, 0, width, height);
  const sourcePixels = context.getImageData(0, 0, width, height).data;
  context.clearRect(0, 0, width, height);
  context.drawImage(depth, 0, 0, width, height);
  const depthPixels = context.getImageData(0, 0, width, height).data;
  const assessment = analyzeDepthSafety({
    width,
    height,
    source: sourcePixels,
    depth: depthPixels,
  });
  safetyAssessments.set(depth, assessment);
  return assessment;
};

const selectedSeed = (): number => {
  const seed = Number(seedInput.value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("Motion seed must be an unsigned 32-bit integer");
  }
  return seed;
};

const resolveLabScene = (
  source: HTMLImageElement,
  depth: HTMLImageElement,
  durationMs: number,
  preset: PreviewPreset = presetSelect.value as PreviewPreset,
  intensity: PreviewIntensity = intensitySelect.value as PreviewIntensity,
  seed: number = selectedSeed(),
): PreviewScene => {
  const scene = resolvePreviewScene({
    sourceWidth: source.naturalWidth,
    sourceHeight: source.naturalHeight,
    depthWidth: depth.naturalWidth,
    depthHeight: depth.naturalHeight,
    durationMs,
    fps: 30,
    canvasWidth: 1920,
    canvasHeight: 1080,
    preset,
    intensity,
    seed,
  });
  if (scene.motion.mode === "flat_2d") return scene;
  return applySafetyToScene(scene, analyzePair(source, depth));
};

const loadScene = async (pair: PreviewPair) => {
  const [source, depth] = await Promise.all([
    loadImage(pair.sourceUrl),
    loadImage(pair.depthUrl),
  ]);
  return {
    source,
    depth,
    resolvedScene: resolveLabScene(source, depth, pair.durationMs),
  };
};

const activateScene = (
  name: string,
  pair: PreviewPair,
  source: HTMLImageElement,
  depth: HTMLImageElement,
  nextScene: PreviewScene,
  frameIndex = 0,
): void => {
  stop();
  renderer?.dispose();
  renderer = createWebGLPreview(canvas, nextScene, source, depth);
  scene = nextScene;
  activeImages = { name, pair, source, depth };
  byId<HTMLElement>("scene-name").textContent = name;
  byId<HTMLElement>("empty-preview").hidden = true;
  sourceImage.src = pair.sourceUrl;
  depthImage.src = pair.depthUrl;
  byId<HTMLElement>("depth-caption").textContent =
    nextScene.motion.mode === "flat_2d" ? "Depth unused" : "Prepared depth";
  frameSlider.max = String(nextScene.timeline.frameCount - 1);
  frameSlider.disabled = false;
  playButton.disabled = false;
  showFrame(Math.min(frameIndex, nextScene.timeline.frameCount - 1));
  status.classList.remove("error");
  status.textContent = `${name} ready · ${nextScene.motion.preset} / ${nextScene.motion.intensity} · ${nextScene.motion.mode} · ${nextScene.timeline.frameCount} frames · ${nextScene.warnings.length} warnings`;
};

const inspectPair = async (
  name: string,
  pair: PreviewPair,
  requestId: number,
): Promise<void> => {
  if (requestId !== previewRequestId) return;
  stop();
  status.textContent = `Loading ${name}…`;
  const { source, depth, resolvedScene } = await loadScene(pair);
  if (requestId !== previewRequestId) return;
  activateScene(name, pair, source, depth, resolvedScene);
};

const refreshScene = (): void => {
  if (!activeImages) return;
  try {
    const { name, pair, source, depth } = activeImages;
    const nextScene = resolveLabScene(source, depth, pair.durationMs);
    activateScene(name, pair, source, depth, nextScene, currentFrame);
  } catch (error) {
    showError(error);
  }
};

const fetchJson = async <T extends z.ZodType>(
  url: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> => {
  const response = await fetch(url, init);
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(value);
    throw new Error(
      error.success ? error.data.error : `Request failed: ${response.status}`,
    );
  }
  return schema.parse(value);
};

const prepareEntry = async (id: string): Promise<PreparedEntry> =>
  fetchJson(`/api/prepare?id=${encodeURIComponent(id)}`, PreparedEntrySchema, {
    method: "POST",
  });

const showError = (error: unknown): void => {
  stop();
  status.textContent = error instanceof Error ? error.message : String(error);
  status.classList.add("error");
};

const prepareSelected = async (): Promise<void> => {
  const id = select.value;
  if (!id) return;
  const requestId = ++previewRequestId;
  status.classList.remove("error");
  prepareButton.disabled = true;
  status.textContent = `Preparing ${id}…`;
  try {
    const prepared = await prepareEntry(id);
    if (requestId !== previewRequestId) return;
    await inspectPair(prepared.id, prepared, requestId);
  } catch (error) {
    if (requestId === previewRequestId) showError(error);
  } finally {
    if (requestId === previewRequestId) prepareButton.disabled = !select.value;
  }
};

const addGalleryCard = (
  entry: CorpusEntry,
  preset: PreviewPreset,
  poster: string | null,
  error?: unknown,
): void => {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "gallery-item";
  if (poster) {
    const image = document.createElement("img");
    image.src = poster;
    image.alt = "Preview frame for " + entry.id + " with " + preset;
    card.append(image);
    card.addEventListener("click", () => {
      presetSelect.value = preset;
      select.value = entry.id;
      void prepareSelected();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  } else {
    card.disabled = true;
    const failure = document.createElement("span");
    failure.textContent =
      error instanceof Error ? error.message : String(error);
    card.append(failure);
  }
  const label = document.createElement("strong");
  label.textContent = entry.id + " · " + preset;
  card.append(label);
  gallery.append(card);
};

const galleryFrameIndex = (scene: PreviewScene): number => {
  const { preset } = scene.motion;
  if (preset === "panel_reveal") return 8;
  if (preset === "comparison_step")
    return Math.floor(scene.timeline.frameCount * 0.32) + 8;
  if (preset === "story_settle") return 10;
  return Math.floor(scene.timeline.frameCount / 2);
};

const buildGallery = async (): Promise<void> => {
  galleryButton.disabled = true;
  status.classList.remove("error");
  gallery.replaceChildren();
  posters.clear();
  const posterCanvas = document.createElement("canvas");
  posterCanvas.width = canvas.width;
  posterCanvas.height = canvas.height;
  try {
    const intensity = intensitySelect.value as PreviewIntensity;
    const seed = selectedSeed();
    const presets = galleryPresets();
    for (const [index, entry] of corpusEntries.entries()) {
      byId<HTMLElement>("gallery-note").textContent =
        "Building gallery " +
        (index + 1) +
        "/" +
        corpusEntries.length +
        ": " +
        entry.id;
      try {
        const prepared = await prepareEntry(entry.id);
        const [source, depth] = await Promise.all([
          loadImage(prepared.sourceUrl),
          loadImage(prepared.depthUrl),
        ]);
        for (const preset of presets) {
          try {
            const resolvedScene = resolveLabScene(
              source,
              depth,
              prepared.durationMs,
              preset,
              intensity,
              seed,
            );
            const posterRenderer = createWebGLPreview(
              posterCanvas,
              resolvedScene,
              source,
              depth,
            );
            let poster: string;
            try {
              posterRenderer.renderFrame(galleryFrameIndex(resolvedScene));
              poster = posterCanvas.toDataURL("image/png");
            } finally {
              posterRenderer.dispose();
            }
            posters.set(entry.id + ":" + preset, poster);
            addGalleryCard(entry, preset, poster);
          } catch (error) {
            addGalleryCard(entry, preset, null, error);
          }
        }
      } catch (error) {
        for (const preset of presets)
          addGalleryCard(entry, preset, null, error);
      }
    }
    byId<HTMLElement>("gallery-note").textContent =
      posters.size +
      "/" +
      corpusEntries.length * presets.length +
      " preview frames generated. Select a tile to inspect motion.";
  } catch (error) {
    showError(error);
  } finally {
    galleryButton.disabled = false;
  }
};

presetSelect.addEventListener("change", refreshScene);
intensitySelect.addEventListener("change", refreshScene);
seedInput.addEventListener("change", refreshScene);

select.addEventListener("change", () => {
  previewRequestId += 1;
  prepareButton.disabled = !select.value;
  status.textContent = select.value
    ? `${select.value} selected. Prepare to inspect its preview.`
    : "Choose a corpus image to prepare.";
});
prepareButton.addEventListener("click", () => {
  void prepareSelected();
});
galleryButton.addEventListener("click", () => {
  void buildGallery();
});
byId<HTMLButtonElement>("load-local").addEventListener("click", () => {
  void loadLocal().catch(showError);
});

const neutralDepthUrl = (source: HTMLImageElement): string => {
  const depthCanvas = document.createElement("canvas");
  depthCanvas.width = source.naturalWidth;
  depthCanvas.height = source.naturalHeight;
  const context = depthCanvas.getContext("2d");
  if (!context) throw new Error("2D canvas is required for a flat preview");
  context.fillStyle = "#808080";
  context.fillRect(0, 0, depthCanvas.width, depthCanvas.height);
  return depthCanvas.toDataURL("image/png");
};

const loadLocal = async (): Promise<void> => {
  const source = sourceInput.files?.[0];
  const depth = depthInput.files?.[0];
  if (!source) throw new Error("Choose a source image");
  if (!depth && !isFlatPreset(presetSelect.value as PreviewPreset)) {
    throw new Error("Choose a depth PNG for a depth preset");
  }
  localUrls.forEach((url) => URL.revokeObjectURL(url));
  localUrls = [URL.createObjectURL(source)];
  if (depth) localUrls.push(URL.createObjectURL(depth));
  const requestId = ++previewRequestId;
  prepareButton.disabled = !select.value;
  status.classList.remove("error");
  const depthUrl = depth
    ? localUrls[1]!
    : neutralDepthUrl(await loadImage(localUrls[0]!));
  const pair: PreviewPair = {
    sourceUrl: localUrls[0]!,
    depthUrl,
    durationMs: 5000,
  };
  await inspectPair(source.name, pair, requestId);
};
frameSlider.addEventListener("input", () => {
  stop();
  showFrame(Number(frameSlider.value));
});
playButton.addEventListener("click", () => {
  if (!scene) return;
  if (timer !== null) return stop();
  playButton.textContent = "Pause";
  playButton.setAttribute("aria-label", "Pause preview");
  timer = window.setInterval(() => {
    if (!scene) return stop();
    showFrame((currentFrame + 1) % scene.timeline.frameCount);
  }, 1000 / scene.timeline.fps);
});

void fetchJson("/api/corpus", CorpusResponseSchema)
  .then((corpus) => {
    corpusEntries.push(...corpus.entries);
    byId<HTMLElement>("corpus-status").textContent = corpus.entries.length
      ? `${corpus.entries.length} images · corpus ${corpus.status}`
      : "The real explainer corpus has not been supplied yet.";
    for (const entry of corpus.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.id} · ${entry.categories.join(", ")}`;
      select.append(option);
    }
    galleryButton.disabled = corpus.entries.length === 0;
  })
  .catch(showError);
