import type { Composition,CompositionLayer } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";
/** Cold + two warmups + five serial measured render/readbacks. Opt-in timing only. */
export async function cameraSampleCosts(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      m = (await import(url)) as typeof Render,
      reports = [];
    for (const count of [1, 8, 64])
      for (const samples of [1, 4]) {
        const doc: Composition = {
            schemaVersion: "composition-1",
            id: "camera-cost",
            width: 1920,
            height: 1080,
            fps: 24,
            frameCount: 32,
            background: "#17232e",
            assets: [],
            motionBlur: {
              enabled: samples > 1,
              shutterAngle: 180,
              shutterPhase: 0,
              samples,
            },
            layers: [
              { id: "camera", type: "camera" },
              ...Array.from({ length: count }, (_, i):CompositionLayer => ({
                id: `plane-${i}`,
                type: "solid" as const,
                size: [150, 100] as [number, number],
                color: "#eb8d55",
                threeD: true,
                motionBlur: true,
                transform: {
                  position: {
                    keys: [
                      {
                        frame: 0,
                        value: [
                          150 + (i % 8) * 210,
                          120 + Math.floor(i / 8) * 120,
                          i * 4,
                        ],
                      },
                      {
                        frame: 31,
                        value: [
                          175 + (i % 8) * 210,
                          135 + Math.floor(i / 8) * 120,
                          i * 4 + 20,
                        ],
                        interpolation: "linear" as const,
                      },
                    ],
                  },
                  rotationY: 25,
                },
              })),
            ],
          },
          preview = m.createCompositionPreview(
            document.createElement("canvas"),
            doc,
            { images: new Map(), fonts: new Map() },
            { backend: "webgl2" },
          );
        const times: number[] = [],
          sampleCounts: number[] = [];
        try {
          for (let i = 0; i < 8; i++) {
            const start = performance.now(),
              report = preview.renderFrame(8 + i);
            preview.readPixels();
            times.push(performance.now() - start);
            sampleCounts.push(report.samples);
          }
        } finally {
          preview.dispose();
        }
        const measured = times.slice(3),
          sorted = [...measured].sort((a, b) => a - b);
        reports.push({
          layers: count,
          shutterSamples: samples,
          cold: times[0],
          warmups: times.slice(1, 3),
          measured,
          median: sorted[2],
          actualSampleCounts: sampleCounts,
        });
      }
    return reports;
  });
}
