import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type { PreviewScene } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Legacy from "../helpers/legacy-depth-oracle.ts";
import type * as Fixtures from "../helpers/composition-depth-graph.ts";
import type * as Providers from "../../packages/renderer-core/src/composition/render/providers.ts";

/** Old Three renders only local depth pixels; native graph integration happens once. */
export async function depthGraphAcceptance(
  page: Page,
  base: Composition,
  scene: PreviewScene,
  assetUrls: Record<string, string>,
) {
  return page.evaluate(
    async ({ baseJson, scene, assetUrls }) => {
      const base = JSON.parse(baseJson) as Composition;
      const renderUrl = "/packages/renderer-core/src/index.ts",
        legacyUrl = "/tests/helpers/legacy-depth-oracle.ts",
        fixtureUrl = "/tests/helpers/composition-depth-graph.ts",
        providerUrl =
          "/packages/renderer-core/src/composition/render/providers.ts";
      const renderer: typeof Render = await import(renderUrl),
        legacy: typeof Legacy = await import(legacyUrl),
        fixtures: typeof Fixtures = await import(fixtureUrl),
        providers: typeof Providers = await import(providerUrl);
      const resources = await renderer.loadCompositionResources(
        base,
        (id) => assetUrls[id]!,
      );
      const oldCanvas = document.createElement("canvas");
      oldCanvas.width = 160;
      oldCanvas.height = 90;
      const old = legacy.createWebGLPreview(
        oldCanvas,
        scene,
        resources.images.get("source") as HTMLImageElement,
        resources.images.get("depth") as HTMLImageElement,
      );
      const frames: Extract<
        Composition["assets"][number],
        { type: "image" }
      >[] = [];
      const rasterImages = new Map<string, CanvasImageSource>();
      try {
        for (let frame = 0; frame < base.frameCount; frame++) {
          old.renderFrame(frame);
          const url = oldCanvas.toDataURL("image/png"),
            bytes = await (await fetch(url)).arrayBuffer(),
            hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (value) => value.toString(16).padStart(2, "0"),
            ).join("");
          const image = new Image();
          image.src = url;
          await image.decode();
          const id = `old-raster-${frame}`;
          rasterImages.set(id, image);
          frames.push({
            id,
            type: "image",
            path: `${id}.png`,
            width: 160,
            height: 90,
            sha256: `sha256:${hash}`,
          });
        }
      } finally {
        old.dispose();
      }
      const provider: Providers.CanvasContentProvider = {
        id: "test.depth-raster@1.0.0",
        prepare(layer, resources) {
          const ids = layer.params.frames as string[],
            width = layer.params.width as number,
            height = layer.params.height as number,
            index = (time: number) =>
              Math.max(0, Math.min(ids.length - 1, Math.floor(time)));
          if (ids.some((id) => !resources.images.has(id)))
            throw Error("Independent depth raster missing");
          return providers.preparedProvider(
            (ctx, time) => {
              ctx.drawImage(
                resources.images.get(ids[index(time)]!)!,
                0,
                0,
                width,
                height,
              );
            },
            {
              boundedCanvas: true,
              stableImages: true,
              singleImage: true,
              bounds: { left: 0, top: 0, right: width, bottom: height },
              visualKey: (time) => ids[index(time)]!,
            },
          );
        },
      };
      const font = base.assets.find((asset) => asset.type === "font");
      if (!font || font.type !== "font")
        throw Error("Pinned depth caption font missing");
      // Fixture factory adds its own caption dependency; avoid duplicating its asset.
      const original = {
        ...base,
        assets: base.assets.filter((asset) => asset.id !== font.id),
      };
      const graphs = fixtures.depthGraphFixtures(original, font),
        reports = [];
      for (const doc of graphs) {
        const reference = fixtures.depthRasterReference(doc, frames),
          nativeCanvas = document.createElement("canvas"),
          referenceCanvas = document.createElement("canvas"),
          native = renderer.createCompositionPreview(
            nativeCanvas,
            doc,
            resources,
            { backend: "webgl2" },
          ),
          expected = renderer.createCompositionPreview(
            referenceCanvas,
            reference,
            {
              ...resources,
              images: new Map([...resources.images, ...rasterImages]),
              pngImages: new Set([
                ...(resources.pngImages ?? []),
                ...rasterImages.keys(),
              ]),
            },
            { backend: "webgl2", providers: [provider] },
          );
        const hashes: string[] = [],
          pngs: string[] = [];
        let maxChannelDelta = 0;
        try {
          for (let frame = 0; frame < doc.frameCount; frame++) {
            native.renderFrame(frame);
            expected.renderFrame(frame);
            const pixels = native.readPixels(),
              comparison = renderer.compareFrames(
                expected.readPixels(),
                pixels,
                doc.width,
                doc.height,
              );
            if (!renderer.meetsTier(comparison, "near"))
              throw Error(
                `${doc.id}/${frame}: old local depth integration ${JSON.stringify(comparison)}`,
              );
            maxChannelDelta = Math.max(
              maxChannelDelta,
              comparison.maxChannelDelta,
            );
            hashes.push(
              Array.from(
                new Uint8Array(
                  await crypto.subtle.digest("SHA-256", pixels.slice().buffer),
                ),
                (value) => value.toString(16).padStart(2, "0"),
              ).join(""),
            );
            pngs.push(nativeCanvas.toDataURL("image/png").split(",")[1]!);
          }
          for (let frame = doc.frameCount - 1; frame >= 0; frame--) {
            native.renderFrame(frame);
            const hash = Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  native.readPixels().slice().buffer,
                ),
              ),
              (value) => value.toString(16).padStart(2, "0"),
            ).join("");
            if (hash !== hashes[frame])
              throw Error(`${doc.id}/${frame}: reverse seek changed pixels`);
          }
          reports.push({
            doc,
            frames: doc.frameCount,
            maxChannelDelta,
            hashes,
            pngs,
          });
        } finally {
          native.dispose();
          expected.dispose();
        }
      }
      return reports;
    },
    { baseJson: JSON.stringify(base), scene, assetUrls },
  );
}
