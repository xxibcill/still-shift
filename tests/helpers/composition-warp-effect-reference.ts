import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export async function checkWarpEffectRendering() {
  const matrix = await checkNativeEffectRendering({
    "distort.transform": [
      {},
      { offset: [8, -3], scale: [1.3, 0.8], rotation: 35 },
      {
        offset: {
          x: {
            keys: [
              { frame: 0, value: -10 },
              { frame: 11, value: 10 },
            ],
          },
          y: 0,
        },
        scale: [-1, 0.7],
        rotation: -25,
      },
      {
        offset: [14.5, -7.5],
        anchor: [0.5, 0.5],
        scale: [1 / 256, 10],
        rotation: 45,
      },
    ],
    "distort.corner-pin": [
      {},
      {
        topLeft: [0.15, 0.1],
        topRight: [0.8, 0.2],
        bottomRight: [0.95, 0.9],
        bottomLeft: [0.1, 0.8],
      },
      {
        topRight: {
          x: {
            keys: [
              { frame: 0, value: 0.8 },
              { frame: 11, value: 1.1 },
            ],
          },
          y: 0.1,
        },
      },
    ],
  });
  return { ...matrix, cancellationOracle: checkWarpCancellation() };
}

import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
function checkWarpCancellation() {
  const image = document.createElement("canvas");
  image.width = 320;
  image.height = 180;
  const context = image.getContext("2d")!,
    pixels = context.createImageData(320, 180);
  for (const [x, y, color] of [
    [159, 89, [255, 0, 0, 255]],
    [160, 89, [0, 255, 0, 255]],
    [159, 90, [0, 0, 255, 255]],
    [160, 90, [255, 255, 255, 255]],
  ] as [number, number, number[]][])
    pixels.data.set(color, (y * 320 + x) * 4);
  context.putImageData(pixels, 0, 0);
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "cancellation",
    width: 320,
    height: 180,
    fps: 24,
    frameCount: 1,
    background: "#000000",
    assets: [
      {
        id: "tile",
        type: "image",
        path: "tile.png",
        width: 320,
        height: 180,
        sha256: `sha256:${"0".repeat(64)}`,
      },
    ],
    layers: [
      {
        id: "image",
        type: "image",
        size: [320, 180],
        fit: "stretch",
        sources: [{ asset: "tile" }],
        transform: { anchor: [0, 0] },
        effects: [
          {
            id: "warp",
            effect: "distort.transform",
            params: { offset: [14.5, -7.5], scale: [1 / 256, 1] },
          },
        ],
      },
    ],
  };
  const rows: { backend: string; pixel: number[] }[] = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map([["tile", image]]), fonts: new Map() },
      { backend },
    );
    try {
      preview.renderFrame(0);
      const pixel = [
        ...preview
          .readPixels()
          .slice((82 * 320 + 174) * 4, (82 * 320 + 174) * 4 + 4),
      ];
      if (
        pixel.some((value, c) => Math.abs(value - [128, 128, 128, 255][c]!) > 1)
      )
        throw Error(`Warp cancellation oracle ${backend}: ${pixel}`);
      rows.push({ backend, pixel });
    } finally {
      preview.dispose();
    }
  }
  return rows;
}
