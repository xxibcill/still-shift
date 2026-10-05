import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkShadowEffectRendering() {
  return checkNativeEffectRendering({
    "light.drop-shadow": [
      {},
      { color: "#2255dd80", opacity: 0.75, offset: [5.25, -3.125], blur: 3.75 },
      {
        blur: 0,
        color: "#eecc55",
        offset: {
          keys: [
            { frame: 0, value: [-10, 5] },
            { frame: 11, value: [10, -5] },
          ],
        },
      },
    ],
    "light.inner-shadow": [
      {},
      { color: "#2255dd80", opacity: 0.75, offset: [5.25, -3.125], blur: 3.75 },
      {
        blur: 0,
        color: "#eecc55",
        offset: {
          keys: [
            { frame: 0, value: [-10, 5] },
            { frame: 11, value: [10, -5] },
          ],
        },
      },
    ],
  });
}
export function checkShadowEffectLimits() {
  return checkNativeEffectRendering(
    {
      "light.drop-shadow": [
        { blur: 128, offset: [0.25, -0.5], opacity: 0.75, color: "#ff440080" },
      ],
      "light.inner-shadow": [
        { blur: 128, offset: [0.25, -0.5], opacity: 0.75, color: "#ff440080" },
      ],
    },
    ["solid"],
  );
}
import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
export function checkShadowPixelOracles() {
  const image = document.createElement("canvas");
  image.width = 16;
  image.height = 16;
  const ctx = image.getContext("2d")!,
    data = ctx.createImageData(16, 16);
  data.data.set([255, 255, 255, 128], (4 * 16 + 4) * 4);
  data.data.set([255, 255, 255, 128], (4 * 16 + 5) * 4);
  ctx.putImageData(data, 0, 0);
  const rows: { effect: string; backend: string; pixels: number[][] }[] = [];
  for (const effect of ["light.drop-shadow", "light.inner-shadow"])
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const inner = effect === "light.inner-shadow";
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "shadow-oracle",
        width: 16,
        height: 16,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [
          {
            id: "tile",
            type: "image",
            path: "tile.png",
            width: 16,
            height: 16,
            sha256: `sha256:${"0".repeat(64)}`,
          },
        ],
        layers: [
          {
            id: "art",
            type: "image",
            size: [16, 16],
            fit: "stretch",
            sources: [{ asset: "tile" }],
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "shadow",
                effect,
                params: {
                  blur: 0,
                  offset: inner ? [1, 0] : [4, 0],
                  color: inner ? "#000000" : "#ff0000",
                },
              },
            ],
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
          points: [number, number, number[]][] = inner
            ? [
                [4, 4, [0, 0, 0, 255]],
                [5, 4, [64, 64, 64, 255]],
              ]
            : [
                [4, 4, [128, 128, 128, 255]],
                [8, 4, [128, 0, 0, 255]],
                [6, 4, [0, 0, 0, 255]],
              ],
          pixels: number[][] = [];
        for (const [x, y, expected] of points) {
          const actual = Array.from(
            bytes.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4),
          );
          if (actual.some((v, c) => v !== expected[c]))
            throw Error(
              `Independent shadow oracle ${effect}/${backend}: ${actual} != ${expected}`,
            );
          pixels.push(actual);
        }
        rows.push({ effect, backend, pixels });
      } finally {
        preview.dispose();
      }
    }
  return rows;
}
