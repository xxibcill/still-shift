import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { runtimeBrowserUrl } from "@still-shift/execution-runtime/browser";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import type { LayerPixelEnergy } from "../../packages/renderer-core/src/story-continuous-quality.ts";

/** Browser pixels use the exact same role toggles as the Lab inspector. */
export async function measureSceneLayerEnergy(
  scenePath: string,
): Promise<LayerPixelEnergy> {
  const loaded = await loadPreparedScene(scenePath);
  if (loaded.scene.schemaVersion !== "story-scene-1")
    throw new Error("Motion craft energy requires a story scene");
  const root = resolve(".");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(
      runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "export"),
    );
    return await page.evaluate(
      async ({ root, scene, paths }) => {
        const { createIllustratedPreview, loadIllustratedImages } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
          );
        const { withoutMotionLayer, withoutFocalMotion, layerOrder } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/motion-inspector.ts`
          );
        const { measureLayerPixelEnergy } = await import(
          `/@fs/${root}/packages/renderer-core/src/story-continuous-quality.ts`
        );
        const images = await loadIllustratedImages(
          scene,
          (id: string) => `/@fs/${paths[id]}`,
        );
        const variants = new Map<
          string,
          {
            canvas: HTMLCanvasElement;
            preview: ReturnType<typeof createIllustratedPreview>;
          }
        >();
        const includeFocal = !!scene.review?.focalEvents?.length;
        for (const role of [
          "full",
          ...layerOrder,
          ...(includeFocal ? ["focal"] : []),
        ]) {
          const canvas = document.createElement("canvas");
          variants.set(role, {
            canvas,
            preview: createIllustratedPreview(
              canvas,
              role === "full"
                ? scene
                : role === "focal"
                  ? withoutFocalMotion(scene)
                  : withoutMotionLayer(scene, role),
              images,
            ),
          });
        }
        const reduced = document.createElement("canvas");
        reduced.width = 320;
        reduced.height = 180;
        const ctx = reduced.getContext("2d", { willReadFrequently: true })!;
        try {
          return await measureLayerPixelEnergy(
            scene.frameCount,
            async (frame: number, role?: string) => {
              const variant = variants.get(role ?? "full")!;
              variant.preview.renderFrame(frame);
              ctx.clearRect(0, 0, 320, 180);
              ctx.drawImage(variant.canvas, 0, 0, 320, 180);
              return ctx.getImageData(0, 0, 320, 180).data;
            },
            includeFocal,
          );
        } finally {
          for (const variant of variants.values()) variant.preview.dispose();
        }
      },
      { root, scene: loaded.scene, paths: loaded.assetPaths },
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}
