import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";

export function checkAdjustmentEffectRendering() {
  return checkNativeEffectRendering(
    {
      "time.echo": [
        { count: 2, spacing: 2, decay: 0.5 },
        { count: 3, spacing: 1, decay: 0.7 },
        { count: 1, spacing: 3, decay: 0.3 },
      ],
      "blur.primitive": [
        { radius: 0 },
        { radius: 2 },
        {
          radius: {
            keys: [
              { frame: 0, value: 1 },
              { frame: 11, value: 4 },
            ],
          },
        },
      ],
    },
    undefined,
    (comp) => {
      const layer = comp.layers.find((layer) => layer.id === "art")!;
      if (layer.effects![0]!.effect === "time.echo")
        layer.transform = {
          ...layer.transform,
          position: {
            x: {
              keys: [
                { frame: 0, value: 18 },
                { frame: 11, value: 40 },
              ],
            },
            y: 15,
          },
          anchor: [0, 0],
        };
      const backdrop = comp.layers.find((layer) => layer.id === "back");
      if (backdrop)
        backdrop.transform = {
          anchor: [0, 0],
          position: {
            x: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 11, value: 36 },
              ],
            },
            y: 15,
          },
        };
    },
  );
}
export function checkOffscreenPrecompBlur() {
  return checkNativeEffectRendering(
    {
      "blur.primitive": [
        { radius: 0 },
        { radius: 2 },
        {
          radius: {
            keys: [
              { frame: 0, value: 1 },
              { frame: 11, value: 4 },
            ],
          },
        },
      ],
    },
    ["precomp", "collapsed"],
    (comp) => {
      const layer = comp.layers.find((layer) => layer.id === "art")!;
      layer.transform = {
        ...layer.transform,
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 18 },
              { frame: 11, value: 40 },
            ],
          },
          y: 15,
        },
      };
    },
  );
}
export async function checkAdjustmentHistoryPixels() {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "history-pixels",
    width: 64,
    height: 32,
    fps: 24,
    frameCount: 12,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "inset",
        type: "precomp",
        comp: "history",
        transform: { anchor: [0, 0] },
      },
    ],
    precomps: [
      {
        id: "history",
        width: 64,
        height: 32,
        frameCount: 12,
        layers: [
          {
            id: "adjust",
            type: "adjustment",
            effects: [
              {
                id: "trail",
                effect: "time.echo",
                params: { count: 2, spacing: 2, decay: 0.5 },
              },
            ],
          },
          {
            id: "art",
            type: "solid",
            size: [4, 8],
            color: "#ffffff",
            transform: {
              anchor: [0, 0],
              position: {
                x: {
                  keys: [
                    { frame: 0, value: 0, interpolation: "linear" },
                    { frame: 11, value: 44, interpolation: "linear" },
                  ],
                },
                y: 8,
              },
            },
          },
        ],
      },
    ],
  };
  const rows = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
      { backend },
    );
    try {
      preview.renderFrame(8);
      const bytes = preview.readPixels();
      const pixels = [16, 24, 32, 40].map((x) =>
        Array.from(bytes.slice((12 * 64 + x) * 4, (12 * 64 + x) * 4 + 4)),
      );
      const expected = [
        [64, 64, 64, 255],
        [128, 128, 128, 255],
        [255, 255, 255, 255],
        [0, 0, 0, 255],
      ];
      if (JSON.stringify(pixels) !== JSON.stringify(expected))
        throw Error(`Adjustment echo ${backend}: ${JSON.stringify(pixels)}`);
      const stored = new Uint8ClampedArray(bytes);
      for (const frame of [0, 11, 2, 8]) preview.renderFrame(frame);
      if (!preview.readPixels().every((byte, i) => byte === stored[i]))
        throw Error("Adjustment history seek differs");
      rows.push({ backend, pixels });
    } finally {
      preview.dispose();
    }
  }
  return rows;
}
