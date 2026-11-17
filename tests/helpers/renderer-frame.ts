// Read one composition frame straight from the renderer canvas in the pinned
// browser, before any export encoding. Explicit `--format` profiles re-encode
// the canvas's sRGB bytes with the BT.709 transfer (docs/composition-reference.md,
// "Output formats"), which changes code values but no geometry, so geometry
// checks compare measurements with these canvas pixels.
import type { Composition } from "@still-shift/scene-contract";
import type * as Renderer from "@still-shift/renderer-core";
import { loadComposition } from "../../packages/animation-engine/src/composition-render.ts";
import { withRendererPage } from "../../packages/animation-engine/src/composition-browser-page.ts";

/** Frame `frame` of a composition-1 JSON file as straight RGB8 (sRGB). */
export async function rendererFrame(path: string, frame = 0) {
  const loaded = await loadComposition(path, "canvas2d");
  const { width, height } = loaded.composition;
  const rgba = await withRendererPage(
    loaded.assetPaths,
    { cacheDirectoryPrefix: "renderer-frame-vite-" },
    (page) =>
      page.evaluate(
        async ({ json, preparedMedia, frame }) => {
          const renderer = (
            globalThis as typeof globalThis & {
              __stillShiftLintRenderer: typeof Renderer;
            }
          ).__stillShiftLintRenderer;
          const comp = JSON.parse(json) as Composition;
          const resources = await renderer.loadCompositionResources(
            comp,
            (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
            preparedMedia ? { preparedMedia } : {},
          );
          const preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            comp,
            resources,
          );
          try {
            await preview.prepareFrame?.(frame);
            await (preview.renderFrameAsync?.(frame) ??
              preview.renderFrame(frame));
            return Array.from(preview.readPixels());
          } finally {
            preview.dispose();
          }
        },
        {
          json: JSON.stringify(loaded.composition),
          preparedMedia: loaded.preparedMedia ?? null,
          frame,
        },
      ),
  );
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return { width, height, rgb };
}
