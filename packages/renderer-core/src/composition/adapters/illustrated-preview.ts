import type { IllustratedScene } from "../../prepared-scene.ts";
import {
  createCompositionPreview,
  type CompositionPreview,
} from "../render/renderer.ts";
import { prepareIllustratedComposition } from "./illustrated.ts";
import { familyCompositionWindowAt } from "./timeline.ts";
import { validateStoryCompositionCoverage } from "./story-coverage.ts";
import type { Images } from "./illustrated-assets.ts";

/** Preparation once, then the shared native frame path; retains the authoring inspector metadata. */
export function createPreparedIllustratedPreview(
  canvas: HTMLCanvasElement,
  scene: IllustratedScene,
  images: Images,
) {
  canvas.width = scene.width;
  canvas.height = scene.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw Error("Canvas 2D is unavailable");
  const prepared = prepareIllustratedComposition(scene, images, context);
  const windows = prepared.windows;
  const create = (composition = prepared.composition, frames?: number[]) =>
    createCompositionPreview(canvas, composition, prepared.resources, {
      backend: "canvas2d",
      ...(frames ? { validationFrames: frames } : {}),
    });
  const frames = (start: number, end: number) =>
    Array.from({ length: end - start }, (_, i) => start + i);
  if (windows && prepared.composition.metadata?.storyCameraCover) {
    const pixels = new Map<string, ImageData>();
    const readPixels = (id: string) => {
      const existing = pixels.get(id);
      if (existing) return existing;
      const asset = prepared.composition.assets.find(
        (asset) => asset.id === id,
      )!;
      if (asset.type !== "image")
        throw new Error(`Cover asset is not an image: ${id}`);
      const image = prepared.resources.images.get(id);
      if (!image) throw new Error(`Cover image was not loaded: ${id}`);
      const probe = document.createElement("canvas");
      probe.width = asset.width;
      probe.height = asset.height;
      try {
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D is unavailable");
        ctx.drawImage(image, 0, 0);
        const result = ctx.getImageData(0, 0, probe.width, probe.height);
        pixels.set(id, result);
        return result;
      } finally {
        probe.width = probe.height = 0;
      }
    };
    // Preparation checks every owned frame before any seek or export can use it.
    for (const window of windows)
      validateStoryCompositionCoverage(
        window.composition,
        readPixels,
        frames(window.start, window.end),
      );
  }
  let activeWindow = windows?.[0];
  let preview: CompositionPreview = create(
    prepared.composition,
    activeWindow ? frames(activeWindow.start, activeWindow.end) : undefined,
  );
  let disposed = false;
  return {
    backend: preview.backend,
    rendererVersion: preview.rendererVersion,
    readPixels: () => preview.readPixels(),
    get textBounds() {
      return preview.textBounds;
    },
    get composition() {
      return activeWindow?.composition ?? prepared.composition;
    },
    ...(windows ? { windows } : {}),
    typography: prepared.typography,
    resolvedTextSizes: prepared.resolvedTextSizes,
    renderFrame(frame: number) {
      if (disposed) throw new Error("Illustrated preview is disposed");
      if (windows) {
        const window = familyCompositionWindowAt(windows, frame);
        if (window !== activeWindow) {
          const next = create(
            window.composition,
            frames(window.start, window.end),
          );
          preview.dispose();
          preview = next;
          activeWindow = window;
        }
      }
      return preview.renderFrame(frame);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preview.dispose();
    },
  };
}
