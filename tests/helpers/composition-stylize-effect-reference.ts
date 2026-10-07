import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkStylizeEffectRendering() {
  return checkNativeEffectRendering({
    "stylize.vignette": [
      {},
      {
        center: [0.3, 0.7],
        radius: [50, 25],
        softness: 0.3,
        amount: 0.9,
        color: "#44117780",
      },
      {
        radius: [40, 30],
        softness: 0.001,
        amount: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 11, value: 1 },
          ],
        },
      },
    ],
    "stylize.chromatic-aberration": [
      {},
      { offset: [12.02, -7.03], amount: 0.75 },
      {
        offset: {
          keys: [
            { frame: 0, value: [-15, 7] },
            { frame: 11, value: [9, -6] },
          ],
        },
      },
    ],
  });
}

import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
export function checkStylizePixelOracles() {
  const image = document.createElement("canvas");
  image.width = 32;
  image.height = 16;
  const context = image.getContext("2d")!,
    data = context.createImageData(32, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++)
      data.data.set([x * 7, 80, 255 - x * 7, 255], (y * 32 + x) * 4);
  context.putImageData(data, 0, 0);
  const results: { effect: string; backend: string; pixels: number[][] }[] = [];
  for (const effect of ["stylize.vignette", "stylize.chromatic-aberration"])
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "oracle",
        width: 32,
        height: 16,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [
          {
            id: "tile",
            type: "image",
            path: "tile.png",
            width: 32,
            height: 16,
            sha256: `sha256:${"0".repeat(64)}`,
          },
        ],
        layers: [
          effect === "stylize.vignette"
            ? {
                id: "art",
                type: "solid",
                size: [32, 16],
                color: "#ffffff",
                transform: { anchor: [0, 0] },
                effects: [
                  {
                    id: "v",
                    effect,
                    params: {
                      center: [16.5 / 32, 8.5 / 16],
                      radius: [8, 4],
                      softness: 0.5,
                      amount: 1,
                    },
                  },
                ],
              }
            : {
                id: "art",
                type: "image",
                size: [32, 16],
                fit: "stretch",
                sources: [{ asset: "tile" }],
                transform: { anchor: [0, 0] },
                effects: [{ id: "c", effect, params: { offset: [1, 0] } }],
              },
        ],
      };
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map([["tile", image]]), fonts: new Map() },
        { backend },
      );
      try {
        preview.renderFrame(0);
        const bytes = preview.readPixels(),
          points =
            effect === "stylize.vignette"
              ? [
                  [16, 8, [255, 255, 255, 255]],
                  [22, 8, [128, 128, 128, 255]],
                  [24, 8, [0, 0, 0, 255]],
                ]
              : [
                  [16, 8, [119, 80, 150, 255]],
                  [0, 8, [7, 80, 0, 255]],
                  [31, 8, [0, 80, 45, 255]],
                ];
        const pixels: number[][] = [];
        for (const [x, y, expected] of points as [number, number, number[]][]) {
          const actual = Array.from(
            bytes.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4),
          );
          if (actual.some((v, c) => v !== expected[c]))
            throw Error(
              `Independent ${effect}/${backend} oracle ${x},${y}: ${actual} != ${expected}`,
            );
          pixels.push(actual);
        }
        results.push({ effect, backend, pixels });
      } finally {
        preview.dispose();
      }
    }
  return results;
}
