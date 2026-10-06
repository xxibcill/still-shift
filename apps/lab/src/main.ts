import {
  analyzeDepthSafety,
  applySafetyToScene,
  createWebGLPreview,
  evaluateFrame,
  isFlatPreset,
  fallback2DScene,
  resolvePreviewScene,
  type PreviewIntensity,
  type PreviewPreset,
  type PreviewScene,
  type SafetyAssessment,
  type WebGLPreview,
} from "../../../packages/renderer-core/src/index.ts";
import type { z } from "zod";
import {
  formatSize,
  OutputFormatSchema,
} from "../../../packages/scene-contract/src/output-format.ts";
import { drawFormatGuides, setPreviewAspect } from "./format-guides.ts";
import {
  cropSafetyPixels,
  type CropWindow,
  estimateDepthSubject,
  focusCropWindow,
  subjectCropViolation,
  type FocusPoint,
} from "../../../packages/renderer-core/src/depth-reframe.ts";

import {
  ApiErrorSchema,
  CorpusResponseSchema,
  DepthPreparationFailureSchema,
  PreparedEntrySchema,
  type CorpusEntry,
  type PreviewPair,
} from "../lab-contract.ts";
import "./style.css";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing lab element: ${id}`);
  return element as T;
};

let canvas = byId<HTMLCanvasElement>("preview");
const guides = byId<HTMLCanvasElement>("preview-guides");
const formatSelect = byId<HTMLSelectElement>("output-format");
const focusModeSelect = byId<HTMLSelectElement>("focus-mode");
const focusXInput = byId<HTMLInputElement>("focus-x");
const focusYInput = byId<HTMLInputElement>("focus-y");
const showGuides = byId<HTMLInputElement>("show-guides");
const previewStage = byId<HTMLElement>("preview-stage");
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
  depth: HTMLImageElement | null;
} | null = null;
const safetyAssessments = new WeakMap<HTMLImageElement, SafetyAssessment>();
type AnalysisPixels = {
  source: HTMLImageElement;
  width: number;
  height: number;
  sourcePixels: Uint8ClampedArray;
  depthPixels: Uint8ClampedArray;
};
const analysisPixels = new WeakMap<HTMLImageElement, AnalysisPixels>();

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
  drawFormatGuides(guides, scene.canvas, showGuides.checked);
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
      framing: scene.framing,
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

const readAnalysisPixels = (
  source: HTMLImageElement,
  depth: HTMLImageElement,
): AnalysisPixels => {
  const cached = analysisPixels.get(depth);
  if (cached?.source === source) return cached;
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
  const pixels = { source, width, height, sourcePixels, depthPixels };
  analysisPixels.set(depth, pixels);
  return pixels;
};

const analyzePair = (
  source: HTMLImageElement,
  depth: HTMLImageElement,
  crop?: CropWindow,
): SafetyAssessment => {
  const cached = crop ? undefined : safetyAssessments.get(depth);
  if (cached) return cached;
  const { width, height, sourcePixels, depthPixels } = readAnalysisPixels(
    source,
    depth,
  );
  const visibleSource = crop
    ? cropSafetyPixels(width, height, sourcePixels, crop)
    : { width, height, pixels: sourcePixels };
  const visibleDepth = crop
    ? cropSafetyPixels(width, height, depthPixels, crop)
    : { pixels: depthPixels };
  const assessment = analyzeDepthSafety({
    width: visibleSource.width,
    height: visibleSource.height,
    source: visibleSource.pixels,
    depth: visibleDepth.pixels,
  });
  if (!crop) safetyAssessments.set(depth, assessment);
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
  depth: HTMLImageElement | null,
  durationMs: number,
  preset: PreviewPreset = presetSelect.value as PreviewPreset,
  intensity: PreviewIntensity = intensitySelect.value as PreviewIntensity,
  seed: number = selectedSeed(),
): PreviewScene => {
  const size = formatSize(OutputFormatSchema.parse(formatSelect.value));
  const vertical = size.height > size.width;
  let focus: FocusPoint | undefined;
  let focusSource: "provided" | "depth-estimate" | undefined;
  if (vertical) {
    const pixels = depth ? readAnalysisPixels(source, depth) : undefined;
    const subject = pixels
      ? estimateDepthSubject(pixels.width, pixels.height, pixels.depthPixels)
      : null;
    if (focusModeSelect.value === "manual") {
      focus = [Number(focusXInput.value), Number(focusYInput.value)];
      focusSource = "provided";
    } else {
      focus = subject?.focus;
      focusSource = focus ? "depth-estimate" : undefined;
    }
    if (!focus)
      throw new Error(
        "Vertical preview needs a focus point; no large near-depth subject could be estimated. Choose Set manually.",
      );
    const crop = focusCropWindow(
      source.naturalWidth,
      source.naturalHeight,
      size.width,
      size.height,
      focus,
    );
    if (subject && pixels) {
      const tolerance = 1 / Math.min(pixels.width, pixels.height);
      const violation = subjectCropViolation(subject, crop, tolerance);
      if (violation)
        throw new Error(
          `Estimated near-depth subject exceeds the vertical crop (left ${violation.left.toFixed(3)}, right ${violation.right.toFixed(3)}, top ${violation.top.toFixed(3)}, bottom ${violation.bottom.toFixed(3)}). Choose another focus or use wider source art.`,
        );
    }
  }
  const scene = resolvePreviewScene({
    sourceWidth: source.naturalWidth,
    sourceHeight: source.naturalHeight,
    depthWidth: depth?.naturalWidth ?? source.naturalWidth,
    depthHeight: depth?.naturalHeight ?? source.naturalHeight,
    durationMs,
    fps: 30,
    canvasWidth: size.width,
    canvasHeight: size.height,
    ...(focus && focusSource ? { focus, focusSource } : {}),
    preset,
    intensity,
    seed,
  });
  if (scene.motion.mode === "flat_2d") return scene;
  return depth
    ? applySafetyToScene(scene, analyzePair(source, depth, scene.framing?.crop))
    : fallback2DScene(scene, "DEPTH_PREPARATION_FAILED");
};

const loadScene = async (pair: PreviewPair) => {
  const source = await loadImage(pair.sourceUrl);
  const loadedDepth = pair.depthUrl
    ? await loadImage(pair.depthUrl).catch(() => null)
    : null;
  const depth =
    loadedDepth?.naturalWidth === source.naturalWidth &&
    loadedDepth.naturalHeight === source.naturalHeight
      ? loadedDepth
      : null;
  return {
    source,
    depth,
    resolvedScene: resolveLabScene(source, depth, pair.durationMs),
  };
};

const activateScene = async (
  name: string,
  pair: PreviewPair,
  source: HTMLImageElement,
  depth: HTMLImageElement | null,
  nextScene: PreviewScene,
  requestId: number,
  frameIndex = 0,
): Promise<void> => {
  // Prepare on a private canvas. A superseded async load must not alter the
  // active canvas or dispose the newer scene's GPU resources.
  const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
  nextCanvas.width = nextScene.canvas.width;
  nextCanvas.height = nextScene.canvas.height;
  const nextRenderer = await createWebGLPreview(
    nextCanvas,
    nextScene,
    source,
    depth,
  );
  if (requestId !== previewRequestId) {
    nextRenderer.dispose();
    return;
  }
  stop();
  renderer?.dispose();
  canvas.replaceWith(nextCanvas);
  canvas = nextCanvas;
  setPreviewAspect(previewStage, nextScene.canvas);
  renderer = nextRenderer;
  scene = nextScene;
  activeImages = { name, pair, source, depth };
  byId<HTMLElement>("scene-name").textContent = name;
  byId<HTMLElement>("empty-preview").hidden = true;
  sourceImage.src = pair.sourceUrl;
  depthImage.hidden = depth === null;
  if (depth && pair.depthUrl) depthImage.src = pair.depthUrl;
  else depthImage.removeAttribute("src");
  byId<HTMLElement>("depth-caption").textContent =
    nextScene.motion.mode === "flat_2d" ? "Depth unused" : "Prepared depth";
  frameSlider.max = String(nextScene.timeline.frameCount - 1);
  frameSlider.disabled = false;
  playButton.disabled = false;
  showFrame(Math.min(frameIndex, nextScene.timeline.frameCount - 1));
  status.classList.remove("error");
  status.textContent = `${name} ready · ${nextScene.canvas.width} × ${nextScene.canvas.height} · ${nextScene.motion.preset} / ${nextScene.motion.intensity} · ${nextScene.motion.mode} · ${nextScene.timeline.frameCount} frames · ${nextScene.warnings.length} warnings`;
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
  await activateScene(name, pair, source, depth, resolvedScene, requestId);
};

const refreshScene = (): void => {
  if (!activeImages) return;
  const requestId = ++previewRequestId;
  const { name, pair, source, depth } = activeImages;
  void (async () => {
    try {
      const nextScene = resolveLabScene(source, depth, pair.durationMs);
      await activateScene(
        name,
        pair,
        source,
        depth,
        nextScene,
        requestId,
        currentFrame,
      );
    } catch (error) {
      if (requestId === previewRequestId) showError(error);
    }
  })();
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

const prepareEntry = async (
  id: string,
): Promise<PreviewPair & { id: string }> => {
  const response = await fetch(`/api/prepare?id=${encodeURIComponent(id)}`, {
    method: "POST",
  });
  const value: unknown = await response.json();
  if (response.ok) return PreparedEntrySchema.parse(value);
  const failure = DepthPreparationFailureSchema.safeParse(value);
  if (response.status === 422 && failure.success) {
    return {
      id,
      sourceUrl: failure.data.sourceUrl,
      depthUrl: null,
      durationMs: failure.data.durationMs,
    };
  }
  const error = ApiErrorSchema.safeParse(value);
  throw new Error(
    error.success ? error.data.error : `Request failed: ${response.status}`,
  );
};

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

type GalleryCard = {
  entry: CorpusEntry;
  preset: PreviewPreset;
  intensity: PreviewIntensity;
  seed: number;
  poster: string | null;
  aspectRatio?: string;
  error?: unknown;
};

const addGalleryCard = ({
  entry,
  preset,
  intensity,
  seed,
  poster,
  aspectRatio,
  error,
}: GalleryCard): void => {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "gallery-item";
  if (poster) {
    const image = document.createElement("img");
    image.src = poster;
    if (aspectRatio) image.style.aspectRatio = aspectRatio;
    image.alt = "Preview frame for " + entry.id + " with " + preset;
    card.append(image);
    card.addEventListener("click", () => {
      presetSelect.value = preset;
      intensitySelect.value = intensity;
      seedInput.value = String(seed);
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
  label.textContent =
    entry.id + " · " + preset + " · " + intensity + " · seed " + seed;
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
  try {
    const intensity = intensitySelect.value as PreviewIntensity;
    const seed = selectedSeed();
    const presets = galleryPresets();
    gallery.replaceChildren();
    posters.clear();
    const posterCanvas = document.createElement("canvas");
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
        const { source, depth } = await loadScene(prepared);
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
            posterCanvas.width = resolvedScene.canvas.width;
            posterCanvas.height = resolvedScene.canvas.height;
            const posterRenderer = await createWebGLPreview(
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
            addGalleryCard({
              entry,
              preset,
              intensity,
              seed,
              poster,
              aspectRatio: `${resolvedScene.canvas.width} / ${resolvedScene.canvas.height}`,
            });
          } catch (error) {
            addGalleryCard({
              entry,
              preset,
              intensity,
              seed,
              poster: null,
              error,
            });
          }
        }
      } catch (error) {
        for (const preset of presets)
          addGalleryCard({
            entry,
            preset,
            intensity,
            seed,
            poster: null,
            error,
          });
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
const updateFormatNote = () => {
  byId<HTMLElement>("format-note").hidden = formatSelect.value !== "vertical";
  byId<HTMLElement>("focus-controls").hidden =
    formatSelect.value !== "vertical";
  byId<HTMLElement>("manual-focus").hidden =
    formatSelect.value !== "vertical" || focusModeSelect.value !== "manual";
};
formatSelect.addEventListener("change", () => {
  updateFormatNote();
  refreshScene();
});
focusXInput.addEventListener("change", refreshScene);
focusYInput.addEventListener("change", refreshScene);
focusModeSelect.addEventListener("change", () => {
  updateFormatNote();
  refreshScene();
});
showGuides.addEventListener("change", () => {
  if (scene) drawFormatGuides(guides, scene.canvas, showGuides.checked);
});
const requestedFormat = new URLSearchParams(location.search).get("format");
if (OutputFormatSchema.safeParse(requestedFormat).success)
  formatSelect.value = requestedFormat!;
updateFormatNote();

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

const loadLocal = async (): Promise<void> => {
  const source = sourceInput.files?.[0];
  const depth = depthInput.files?.[0];
  if (!source) return showError(new Error("Choose a source image"));
  localUrls.forEach((url) => URL.revokeObjectURL(url));
  localUrls = [URL.createObjectURL(source)];
  if (depth) localUrls.push(URL.createObjectURL(depth));
  const requestId = ++previewRequestId;
  prepareButton.disabled = !select.value;
  status.classList.remove("error");
  const pair: PreviewPair = {
    sourceUrl: localUrls[0]!,
    depthUrl: localUrls[1] ?? null,
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
