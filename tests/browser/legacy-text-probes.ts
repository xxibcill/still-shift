import type { Page } from "playwright";
import type { PreparedScene } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Adapter from "../../packages/renderer-core/src/composition/adapters/illustrated.ts";
import type * as Oracle from "../helpers/legacy-illustrated-oracle.ts";
import { legacyTextProbeVariants } from "../helpers/composition-legacy-text-probe.ts";

export async function legacyTextProbeAcceptance(
  page: Page,
  id: string,
  source: PreparedScene,
  urls: Record<string, string>,
) {
  const variants = legacyTextProbeVariants(id, source);
  if (!variants.length) return [];
  return page.evaluate(
    async ({ variants, urls }) => {
      const renderUrl = "/packages/renderer-core/src/index.ts",
        adapterUrl =
          "/packages/renderer-core/src/composition/adapters/illustrated.ts",
        oracleUrl = "/tests/helpers/legacy-illustrated-oracle.ts",
        renderer: typeof Render = await import(renderUrl),
        adapter: typeof Adapter = await import(adapterUrl),
        oracle: typeof Oracle = await import(oracleUrl),
        reports = [];
      for (const variant of variants) {
        const scene = renderer.compilePreparedScene(variant.scene),
          referenceScene = renderer.compilePreparedScene(variant.reference),
          images = await oracle.loadIllustratedImages(scene, (id) => urls[id]!),
          modeHashes = new Map<string, string>();
        const composition = renderer.legacyToComposition(variant.scene);
        const titleOrdinal = variant.scene.nodes.findIndex(
          (node) => node.id === variant.probes[0]!.renamed,
        );
        const unknownAlias = Object.entries(
          composition.metadata!.legacyLayerAliases as Record<string, number>,
        ).find(([, ordinal]) => ordinal === titleOrdinal)![0];
        if (
          [scene, referenceScene].some((source) =>
            source.nodes.some((node) => node.id === unknownAlias),
          )
        )
          throw Error("Unknown native probe alias is an authored node");
        const probes = [
          ...variant.probes.map((probe) => ({ ...probe, unknown: false })),
          { original: unknownAlias, renamed: unknownAlias, unknown: true },
        ];
        for (const probe of probes)
          for (const mode of ["ink-only", "container-only"] as const) {
            const selected = Object.assign(new Map(images), images, {
                textProbe: { node: probe.renamed, mode },
              }),
              originalProbe = JSON.stringify(selected.textProbe),
              referenceImages = Object.assign(new Map(images), images, {
                textProbe: { node: probe.original, mode },
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
                referenceScene,
                referenceImages,
              );
            if (JSON.stringify(selected.textProbe) !== originalProbe)
              throw Error(
                "Preparing a legacy probe mutated its caller's target",
              );
            let maxChannelDelta = 0,
              referenceHash = "";
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
                if (metrics.maxChannelDelta !== 0)
                  throw Error(
                    `Legacy text probe ${variant.id}/${probe.original}/${mode}/${frame}: ${JSON.stringify(metrics)}`,
                  );
                maxChannelDelta = Math.max(
                  maxChannelDelta,
                  metrics.maxChannelDelta,
                );
                if (frame === frames.at(-1))
                  referenceHash = Array.from(
                    new Uint8Array(
                      await crypto.subtle.digest(
                        "SHA-256",
                        new Uint8Array(reference),
                      ),
                    ),
                  ).join(",");
              }
              if (
                mode === "container-only" &&
                !probe.unknown &&
                modeHashes.get(probe.original) === referenceHash
              )
                throw Error(
                  `Legacy text probe modes are indistinguishable for ${variant.id}/${probe.original}`,
                );
              if (
                mode === "container-only" &&
                probe.unknown &&
                modeHashes.get(probe.original) !== referenceHash
              )
                throw Error(
                  `Unknown legacy text probe changed rendering for ${variant.id}/${probe.original}`,
                );
              modeHashes.set(probe.original, referenceHash);
              if (prepared.resources.textProbe === selected.textProbe)
                throw Error(
                  "Prepared legacy probe still aliases its caller's object",
                );
              reports.push({
                id: variant.id,
                node: probe.original,
                mode,
                frames,
                maxChannelDelta,
                referenceHash,
                unknownTarget: probe.unknown,
              });
            } finally {
              native.dispose();
              original.dispose();
            }
          }
      }
      return reports;
    },
    { variants, urls },
  );
}
