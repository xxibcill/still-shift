import type { Composition } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Identity camera projection must preserve the inherited drawing filter, including offscreen halos. */
export async function cameraGroupBlurAcceptance(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      m = (await import(url)) as typeof Render,
      reports = [];
    for (const backend of ["canvas2d", "webgl2"] as const)
      for (const childRadius of [undefined, 0, 2])
        for (const left of [40, 102])
          for (const collapsed of [false, true]) {
            const samples: Uint8ClampedArray[] = [];
            for (const threeD of [false, true]) {
              const doc: Composition = {
                schemaVersion: "composition-1",
                id: "inherited-blur",
                width: 100,
                height: 100,
                fps: 24,
                frameCount: 1,
                assets: [],
                layers: [
                  { id: "camera", type: "camera" },
                  {
                    id: "group",
                    type: "group",
                    size: [100, 100],
                    transform: { anchor: [0, 0] },
                    effects: [
                      {
                        id: "blur",
                        effect: "blur.primitive",
                        params: { radius: 5 },
                      },
                    ],
                  },
                  {
                    id: "art",
                    type: "solid",
                    size: [20, 20],
                    color: "#ffffff",
                    parent: "group",
                    threeD,
                    transform: {
                      anchor: [0, 0],
                      position: threeD ? [left, 40, 0] : [left, 40],
                    },
                    ...(childRadius === undefined
                      ? {}
                      : {
                          effects: [
                            {
                              id: "blur",
                              effect: "blur.primitive",
                              params: { radius: childRadius },
                            },
                          ],
                        }),
                  },
                ],
              };
              if (collapsed) {
                const art = doc.layers.pop()!;
                delete art.parent;
                doc.precomps = [
                  {
                    id: "source",
                    width: 100,
                    height: 100,
                    frameCount: 1,
                    layers: [art],
                  },
                ];
                doc.layers.push({
                  id: "nested",
                  type: "precomp",
                  comp: "source",
                  parent: "group",
                  collapseTransforms: true,
                  transform: { anchor: [0, 0] },
                });
              }
              const preview = m.createCompositionPreview(
                document.createElement("canvas"),
                doc,
                { images: new Map(), fonts: new Map() },
                { backend },
              );
              try {
                preview.renderFrame(0);
                samples.push(preview.readPixels().slice());
              } finally {
                preview.dispose();
              }
            }
            const haloX = left === 40 ? 39 : 99,
              halo = (50 * 100 + haloX) * 4,
              metrics = m.compareFrames(samples[0]!, samples[1]!, 100, 100);
            if (
              !samples[0]![halo] ||
              !samples[1]![halo] ||
              metrics.maxChannelDelta > 1
            )
              throw Error(
                `${backend}/${childRadius}/${left}/${collapsed}: projected primitive blur ${JSON.stringify(metrics)}`,
              );
            reports.push({
              backend,
              childRadius: childRadius ?? "inherited",
              left,
              collapsed,
              halo: samples[1]![halo],
              metrics,
            });
          }
    return reports;
  });
}
