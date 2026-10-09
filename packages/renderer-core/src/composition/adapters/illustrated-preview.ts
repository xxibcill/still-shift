import type { IllustratedScene } from "../../prepared-scene.ts";
import {
  createCompositionPreview,
  prepareCompositionPreview,
  type CompositionPreview,
} from "../render/renderer.ts";
import {
  prepareIllustratedComposition,
  type PreparedIllustratedComposition,
} from "./illustrated.ts";
import { familyCompositionWindowAt } from "./timeline.ts";
import type { Images } from "./illustrated-assets.ts";

/** Preparation once, then the shared native frame path; retains the authoring inspector metadata. */
export function createPreparedIllustratedPreview(
  canvas: HTMLCanvasElement,
  scene: IllustratedScene,
  images: Images,
): Omit<CompositionPreview, "prepareFrame"> &
  Omit<PreparedIllustratedComposition, "resources"> {
  canvas.width = scene.width;
  canvas.height = scene.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw Error("Canvas 2D is unavailable");
  const prepared = prepareIllustratedComposition(scene, images, context);
  const windows = prepared.windows;
  // Validate and measure all windows before exposing playback. Temporary backends
  // are released immediately; only local content is retained across seeks.
  const preparedWindows = new Map(
    windows?.map((window) => [
      window,
      prepareCompositionPreview(window.composition, prepared.resources, {
        backend: "canvas2d",
        validationFrames: Array.from(
          { length: window.end - window.start },
          (_, i) => window.start + i,
        ),
      }),
    ]),
  );
  let activeWindow = windows?.[0];
  let preview: CompositionPreview = activeWindow
    ? preparedWindows.get(activeWindow)!.create(canvas)
    : createCompositionPreview(
        canvas,
        prepared.composition,
        prepared.resources,
        {
          backend: "canvas2d",
        },
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
          const next = preparedWindows.get(window)!.create(canvas);
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
      preparedWindows.clear();
    },
  };
}
