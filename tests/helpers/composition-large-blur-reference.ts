import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { compareFrames } from "../../packages/renderer-core/src/frame-tolerance.ts";
export function checkClampedGaussianRendering() {
  const rows = [];
  for (const [width, height] of [
    [512, 512],
    [513, 257],
  ])
    for (const radius of [136, 150, 270, 531, 532, 533, 1000])
      for (const kind of ["solid", "stripes"]) {
        const composition: Composition = {
          schemaVersion: "composition-1",
          id: "clamped-Gaussian",
          width: width!,
          height: height!,
          fps: 24,
          frameCount: 2,
          assets: [],
          background: "#000000",
          layers: [
            {
              id: "paint",
              type: "solid",
              size: [width!, height!],
              color: "#df573b",
              transform: { anchor: [0, 0] },
              effects: [
                { id: "soft", effect: "blur.gaussian", params: { radius } },
              ],
            },
          ],
        };
        if (kind === "stripes") {
          const effects = composition.layers[0]!.effects;
          composition.layers = [
            {
              id: "paint",
              type: "group",
              size: [width!, height!],
              transform: { anchor: [0, 0] },
              effects,
            },
            ...["#ffbb227f", "#2266dd", "#22dd997f", "#cc3366"].map(
              (color, index) => ({
                id: `strip-${index}`,
                type: "solid" as const,
                parent: "paint",
                size: [width! / 4, height!] as [number, number],
                color,
                transform: {
                  anchor: [0, 0] as [number, number],
                  position: [(index * width!) / 4, 0] as [number, number],
                },
              }),
            ),
          ];
        }
        const resources = { images: new Map(), fonts: new Map() };
        const reference = createCompositionPreview(
          document.createElement("canvas"),
          composition,
          resources,
        );
        const gpu = createCompositionPreview(
          document.createElement("canvas"),
          composition,
          resources,
          { backend: "webgl2" },
        );
        try {
          for (const frame of [1, 0, 1]) {
            reference.renderFrame(frame);
            gpu.renderFrame(frame);
            const metrics = compareFrames(
              reference.readPixels(),
              gpu.readPixels(),
              width!,
              height!,
            );
            if (metrics.maxChannelDelta > 2 || metrics.psnr < 50)
              throw new Error(
                `Clamped Gaussian ${radius}: delta ${metrics.maxChannelDelta}, PSNR ${metrics.psnr}`,
              );
            rows.push({
              width,
              height,
              radius,
              kind,
              frame,
              maxDelta: metrics.maxChannelDelta,
              psnr: metrics.psnr,
            });
          }
        } finally {
          reference.dispose();
          gpu.dispose();
        }
      }
  return rows;
}
