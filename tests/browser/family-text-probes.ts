import type { Page } from "playwright";
import type { IllustratedScene } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Adapter from "../../packages/renderer-core/src/composition/adapters/illustrated.ts";
import type * as Oracle from "../helpers/legacy-illustrated-oracle.ts";

/** Contrast diagnostics retain their independently drawn ink/container separation. */
export async function familyTextProbeAcceptance(
  page: Page,
  scene: IllustratedScene,
  urls: Record<string, string>,
) {
  return page.evaluate(
    async ({ json, urls }) => {
      const scene = JSON.parse(json) as IllustratedScene,
        renderUrl = "/packages/renderer-core/src/index.ts",
        adapterUrl =
          "/packages/renderer-core/src/composition/adapters/illustrated.ts",
        oracleUrl = "/tests/helpers/legacy-illustrated-oracle.ts",
        renderer: typeof Render = await import(renderUrl),
        adapter: typeof Adapter = await import(adapterUrl),
        oracle: typeof Oracle = await import(oracleUrl),
        images = await oracle.loadIllustratedImages(scene, (id) => urls[id]!),
        reports = [];
      for (const node of scene.nodes.filter((node) => node.type === "text"))
        for (const mode of ["ink-only", "container-only"] as const) {
          const selected = Object.assign(new Map(images), images, {
              textProbe: { node: node.id, mode },
            }),
            canvas = document.createElement("canvas"),
            oldCanvas = document.createElement("canvas");
          canvas.width = scene.width;
          canvas.height = scene.height;
          const prepared = adapter.prepareIllustratedComposition(
              scene,
              selected,
              canvas.getContext("2d")!,
            ),
            native = renderer.createCompositionPreview(
              canvas,
              prepared.composition,
              prepared.resources,
            ),
            original = oracle.createIllustratedPreview(
              oldCanvas,
              scene,
              selected,
            );
          let maxChannelDelta = 0;
          const frames = [
            0,
            Math.floor(scene.timeline.frameCount / 2),
            scene.timeline.frameCount - 1,
          ];
          try {
            for (const frame of frames) {
              native.renderFrame(frame);
              original.renderFrame(frame);
              const reference = oldCanvas
                  .getContext("2d")!
                  .getImageData(0, 0, scene.width, scene.height).data,
                metrics = renderer.compareFrames(
                  reference,
                  native.readPixels(),
                  scene.width,
                  scene.height,
                );
              if (!renderer.meetsTier(metrics, "near"))
                throw Error(
                  `Text probe ${node.id}/${mode}/${frame}: ${JSON.stringify(metrics)}`,
                );
              maxChannelDelta = Math.max(
                maxChannelDelta,
                metrics.maxChannelDelta,
              );
            }
            reports.push({ node: node.id, mode, frames, maxChannelDelta });
          } finally {
            native.dispose();
            original.dispose();
          }
        }
      return reports;
    },
    { json: JSON.stringify(scene), urls },
  );
}
