import {
  createWebGLPreview,
  evaluateFrame,
  resolvePreviewScene,
  type PreviewScene,
  type WebGLPreview,
} from "../../../packages/renderer-core/src/index.ts";
import "./style.css";

type CorpusEntry = {
  id: string;
  categories: string[];
  expectedShotDurationMs: number;
};
type PreparedEntry = {
  id: string;
  sourceUrl: string;
  depthUrl: string;
  dimensions: { width: number; height: number };
  durationMs: number;
  cacheStatus: string;
  model: unknown;
};

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

const loadScene = async (
  sourceUrl: string,
  depthUrl: string,
  durationMs: number,
): Promise<{
  source: HTMLImageElement;
  depth: HTMLImageElement;
  resolvedScene: PreviewScene;
}> => {
  const [source, depth] = await Promise.all([
    loadImage(sourceUrl),
    loadImage(depthUrl),
  ]);
  const nextScene = resolvePreviewScene({
    sourceWidth: source.naturalWidth,
    sourceHeight: source.naturalHeight,
    depthWidth: depth.naturalWidth,
    depthHeight: depth.naturalHeight,
    durationMs,
    fps: 30,
    canvasWidth: 1920,
    canvasHeight: 1080,
    preset: "slow_push",
    intensity: "subtle",
  });
  return { source, depth, resolvedScene: nextScene };
};

const inspectPair = async (
  name: string,
  sourceUrl: string,
  depthUrl: string,
  durationMs: number,
  requestId: number,
): Promise<void> => {
  if (requestId !== previewRequestId) return;
  stop();
  status.textContent = `Loading ${name}…`;
  const {
    source,
    depth,
    resolvedScene: nextScene,
  } = await loadScene(sourceUrl, depthUrl, durationMs);
  if (requestId !== previewRequestId) return;
  renderer?.dispose();
  renderer = createWebGLPreview(canvas, nextScene, source, depth);
  scene = nextScene;
  byId<HTMLElement>("scene-name").textContent = name;
  byId<HTMLElement>("empty-preview").hidden = true;
  sourceImage.src = sourceUrl;
  depthImage.src = depthUrl;
  frameSlider.max = String(nextScene.timeline.frameCount - 1);
  frameSlider.disabled = false;
  playButton.disabled = false;
  showFrame(0);
  status.textContent = `${name} ready · ${nextScene.timeline.frameCount} frames · ${nextScene.warnings.length} clamps`;
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(value.error ?? `Request failed: ${response.status}`);
  return value;
};

const prepareEntry = async (id: string): Promise<PreparedEntry> =>
  fetchJson<PreparedEntry>(`/api/prepare?id=${encodeURIComponent(id)}`, {
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
    await inspectPair(
      prepared.id,
      prepared.sourceUrl,
      prepared.depthUrl,
      prepared.durationMs,
      requestId,
    );
  } catch (error) {
    if (requestId === previewRequestId) showError(error);
  } finally {
    if (requestId === previewRequestId) prepareButton.disabled = !select.value;
  }
};

const buildGallery = async (): Promise<void> => {
  galleryButton.disabled = true;
  status.classList.remove("error");
  gallery.replaceChildren();
  posters.clear();
  const posterCanvas = document.createElement("canvas");
  posterCanvas.width = canvas.width;
  posterCanvas.height = canvas.height;
  for (const [index, entry] of corpusEntries.entries()) {
    byId<HTMLElement>("gallery-note").textContent =
      `Building gallery ${index + 1}/${corpusEntries.length}: ${entry.id}`;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gallery-item";
    try {
      const prepared = await prepareEntry(entry.id);
      const { source, depth, resolvedScene } = await loadScene(
        prepared.sourceUrl,
        prepared.depthUrl,
        prepared.durationMs,
      );
      const posterRenderer = createWebGLPreview(
        posterCanvas,
        resolvedScene,
        source,
        depth,
      );
      let poster: string;
      try {
        posterRenderer.renderFrame(
          Math.floor(resolvedScene.timeline.frameCount / 2),
        );
        poster = posterCanvas.toDataURL("image/png");
      } finally {
        posterRenderer.dispose();
      }
      posters.set(entry.id, poster);
      const image = document.createElement("img");
      image.src = poster;
      image.alt = `Midpoint preview for ${entry.id}`;
      card.append(image);
      card.addEventListener("click", () => {
        select.value = entry.id;
        void prepareSelected();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    } catch (error) {
      card.disabled = true;
      const failure = document.createElement("span");
      failure.textContent =
        error instanceof Error ? error.message : String(error);
      card.append(failure);
    }
    const label = document.createElement("strong");
    label.textContent = entry.id;
    card.append(label);
    gallery.append(card);
  }
  byId<HTMLElement>("gallery-note").textContent =
    `${posters.size}/${corpusEntries.length} midpoint previews generated. Select a tile to inspect motion.`;
  galleryButton.disabled = false;
};

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
  const source = sourceInput.files?.[0];
  const depth = depthInput.files?.[0];
  if (!source || !depth)
    return showError(new Error("Choose both a source image and depth PNG"));
  localUrls.forEach((url) => URL.revokeObjectURL(url));
  localUrls = [URL.createObjectURL(source), URL.createObjectURL(depth)];
  const requestId = ++previewRequestId;
  prepareButton.disabled = !select.value;
  status.classList.remove("error");
  void inspectPair(
    source.name,
    localUrls[0]!,
    localUrls[1]!,
    5000,
    requestId,
  ).catch((error: unknown) => {
    if (requestId === previewRequestId) showError(error);
  });
});
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

void fetchJson<{ status: string; entries: CorpusEntry[] }>("/api/corpus")
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
