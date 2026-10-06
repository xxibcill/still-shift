import type { Composition } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Reference from "../helpers/composition-lighting-reference.ts";
/** Offscreen transparent RGBA targets test alpha at its real shading boundary. */
export async function lightingAlphaAcceptance(
  page: Page,
  doc: Composition,
  assetUrls: Record<string, string>,
  frames: number[],
  name: string,
) {
  return page.evaluate(
    async ({ json, assetUrls, frames, name }) => {
      const url = "/packages/renderer-core/src/index.ts",
        referenceUrl = "/tests/helpers/composition-lighting-reference.ts",
        m = (await import(url)) as typeof Render,
        ref = (await import(referenceUrl)) as typeof Reference;
      const doc = JSON.parse(json) as Composition;
      delete doc.background;
      const unlit = structuredClone(doc);
      for (const scope of [unlit, ...(unlit.precomps ?? [])])
        for (const layer of scope.layers)
          if (layer.receivesLight !== undefined) layer.receivesLight = false;
      const resources = await m.loadCompositionResources(
        doc,
        (id) => assetUrls[id]!,
      );
      const outputs = [];
      for (const source of [doc, unlit]) {
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const probe = document
            .createElement("canvas")
            .getContext("2d", { willReadFrequently: true })!,
          text = m.prepareCompositionText(source, resources.fonts, probe);
        const backend = m.createWebgl2Backend(canvas, {
          softwareRaster: true,
          images: {
            images: resources.images,
            ...(resources.pngImages ? { pngImages: resources.pngImages } : {}),
            sizes: new Map(
              source.assets.flatMap((a) =>
                a.type === "image"
                  ? [[a.id, [a.width, a.height] as const]]
                  : [],
              ),
            ),
          },
          drawText: text.draw,
          contentBounds: (content) =>
            content.type === "text" ? text.contentBounds(content) : undefined,
          contentKey: (content) =>
            content.type === "text" ? text.contentKey(content) : undefined,
          boundedCanvas: (content) => content.type === "text",
          singleImage: (content) =>
            content.type === "text" && text.singleImage(content),
          stableImages: (content) =>
            content.type === "text" && text.stableImages(content),
        });
        const target = backend.createSurface(source.width, source.height),
          samples = [];
        try {
          for (const frame of frames) {
            m.renderCompositionExposure(backend, target, source, frame, {
              textBounds: text.bounds,
            });
            samples.push(backend.readPixels(target));
          }
        } finally {
          backend.releaseSurface(target);
          backend.dispose();
        }
        outputs.push(samples);
      }
      let maxAlphaDelta = 0,
        oracleMaxDelta = 0,
        partialAlphaPixels = 0;
      for (let f = 0; f < frames.length; f++) {
        const lit = outputs[0]![f]!,
          plain = outputs[1]![f]!,
          expected = ref.lightingFixtureReference(name, frames[f]!);
        for (let at = 3; at < lit.length; at += 4) {
          maxAlphaDelta = Math.max(
            maxAlphaDelta,
            Math.abs(lit[at]! - plain[at]!),
          );
          if (lit[at]! > 0 && lit[at]! < 255) partialAlphaPixels++;
        }
        if (expected) {
          const premultiplied = lit.slice();
          for (let at = 0; at < lit.length; at += 4)
            for (let c = 0; c < 3; c++)
              premultiplied[at + c] = Math.round(
                (lit[at + c]! * lit[at + 3]!) / 255,
              );
          for (let at = 3; at < lit.length; at += 4) premultiplied[at] = 255;
          const comparison = m.compareFrames(
            premultiplied,
            expected,
            doc.width,
            doc.height,
          );
          if (!m.meetsTier(comparison, "near"))
            throw Error(
              `${name}/${frames[f]}: independent premultiplied oracle ${JSON.stringify(comparison)}`,
            );
          oracleMaxDelta = Math.max(oracleMaxDelta, comparison.maxChannelDelta);
          if (name === "ambient")
            for (let at = 3; at < lit.length; at += 4)
              if (lit[at] !== 128)
                throw Error("Ambient source alpha must stay 128");
        }
      }
      if (maxAlphaDelta !== 0)
        throw Error(`${name}: lighting changed alpha by ${maxAlphaDelta}`);
      return {
        frames: frames.length,
        maxAlphaDelta,
        partialAlphaPixels,
        oracleMaxDelta,
        output:
          "offscreen straight RGBA; CPU comparison in premultiplied bytes",
      };
    },
    { json: JSON.stringify(doc), assetUrls, frames, name },
  );
}
