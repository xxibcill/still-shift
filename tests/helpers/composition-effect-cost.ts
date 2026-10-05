import type { Composition } from "@still-shift/scene-contract";
import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import { ce6EffectCases } from "../../benchmarks/fixtures/composition/ce6/catalogue.ts";

/** Serial render + complete readback; cold shader compilation and warm frames are separate. */
export function measureCe6EffectCosts() {
  const width = 1920,
    height = 1080,
    rows = [];
  for (const [effect, params] of Object.entries(ce6EffectCases(width, height)))
    for (const backend of ["canvas2d", "webgl2"] as const) {
      console.info(`CE6 effect cost ${effect}/${backend}`);
      const usesMap =
        effect === "distort.displacement-map" ||
        effect === "transition.gradient-wipe";
      const doc: Composition = {
        schemaVersion: "composition-1",
        id: `cost-${effect.replaceAll(".", "-")}`,
        width,
        height,
        fps: 24,
        frameCount: 32,
        assets: [],
        background: "#101a2a",
        layers: [
          {
            id: "source",
            type: "group",
            size: [width, height],
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "treatment",
                effect,
                params,
                ...(usesMap ? { inputs: { map: "map" } } : {}),
              },
            ],
          },
          ...["#f0ba58", "#3baea0b3", "#b86884"].map((color, index) => ({
            id: `stripe-${index}`,
            type: "solid" as const,
            parent: "source",
            size: [width / 3, height] as [number, number],
            color,
            transform: {
              anchor: [0, 0] as [number, number],
              position: {
                x: {
                  keys: [
                    {
                      frame: 0,
                      value: (index * width) / 3,
                      easing: "linear" as const,
                    },
                    {
                      frame: 31,
                      value: (index * width) / 3 + 8,
                      easing: "linear" as const,
                    },
                  ],
                },
                y: 0,
              },
            },
          })),
          {
            id: "map",
            type: "solid",
            enabled: false,
            size: [width, height],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "rank",
                effect: "color.gradient-ramp",
                params: {
                  start: [0, 0],
                  end: [width, height],
                  startColor: "#336699",
                  endColor: "#dddddd",
                },
              },
            ],
          },
        ],
      };
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        doc,
        { images: new Map(), fonts: new Map() },
        { backend },
      );
      try {
        const render = (frame: number) => {
          const start = performance.now();
          preview.renderFrame(frame);
          const pixels = preview.readPixels();
          if (pixels.length !== width * height * 4)
            throw Error("Incomplete cost readback");
          return performance.now() - start;
        };
        const cold = render(0);
        render(1);
        render(2);
        const warm = [3, 4, 5, 6, 7].map(render).sort((a, b) => a - b);
        rows.push({
          effect,
          backend,
          width,
          height,
          params,
          coldRenderReadbackMs: cold,
          warmRenderReadbackMedianMs: warm[2]!,
          warmRenderReadbackMeanMs:
            warm.reduce((a, b) => a + b, 0) / warm.length,
          warmRenderReadbackSamplesMs: warm,
          method:
            "first-frame shader/preparation cost; two warmups; five advancing frames; complete synchronous readback; cached staged inputs permitted",
        });
      } finally {
        preview.dispose();
      }
    }
  return rows;
}
