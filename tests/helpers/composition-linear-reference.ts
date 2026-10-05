import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
import {
  CompositionBlendModeSchema,
  type Composition,
  type CompositionBlendMode,
} from "../../packages/scene-contract/src/index.ts";

export async function checkLinearOwnerRendering() {
  return checkNativeEffectRendering(
    {
      "color.invert": [
        { amount: 0 },
        { amount: 0.7 },
        {
          amount: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 11, value: 1 },
            ],
          },
        },
      ],
    },
    undefined,
    (comp) => {
      comp.colorSpace = "linear-srgb";
    },
  );
}
export async function checkLinearBlendRendering() {
  const rows = [];
  for (const mode of CompositionBlendModeSchema.options) {
    const result = await checkNativeEffectRendering(
      {
        "color.invert": [
          { amount: 0 },
          { amount: 0.7 },
          {
            amount: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 11, value: 1 },
              ],
            },
          },
        ],
      },
      ["solid", "group", "adjustment"],
      (comp) => {
        comp.colorSpace = "linear-srgb";
        comp.layers.find((layer) => layer.id === "art")!.blendMode =
          mode as CompositionBlendMode;
      },
    );
    rows.push(...result.rows.map((row) => ({ mode, ...row })));
  }
  return { cases: rows.length, frames: rows.length * 12, rows };
}
export async function checkLinearPixels() {
  const rows = [];
  for (const kind of ["white", "masked", "adjustment"]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "linear-oracle",
      width: 16,
      height: 16,
      fps: 24,
      frameCount: 2,
      background: "#000000",
      colorSpace: "linear-srgb",
      assets: [],
      layers: [
        {
          id: "art",
          type: "solid",
          size: [16, 16],
          color: "#ffffff80",
          transform: { anchor: [0, 0] },
        },
      ],
    };
    if (kind === "masked")
      comp.layers[0]!.masks = [
        {
          id: "mask",
          mode: "add",
          opacity: 0.5,
          path: {
            closed: true,
            vertices: [
              [0, 0],
              [16, 0],
              [16, 16],
              [0, 16],
            ],
          },
        },
      ];
    if (kind === "adjustment")
      comp.layers = [
        {
          id: "art",
          type: "adjustment",
          transform: { anchor: [0, 0], opacity: 0.5 },
          effects: [
            { id: "white", effect: "color.fill", params: { color: "#ffffff" } },
          ],
        },
      ];
    const expected = kind === "masked" ? 137 : 188;
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map(), fonts: new Map() },
        { backend },
      );
      try {
        preview.renderFrame(0);
        const pixel = Array.from(preview.readPixels().slice(0, 4));
        if (
          JSON.stringify(pixel) !==
          JSON.stringify([expected, expected, expected, 255])
        )
          throw Error(`Linear ${kind}/${backend}: ${pixel}`);
        rows.push({ kind, backend, pixel });
      } finally {
        preview.dispose();
      }
    }
  }
  const options = {
    colorSpace: "linear-srgb" as const,
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  };
  for (const kind of ["canvas2d", "webgl2"] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const backend =
      kind === "canvas2d"
        ? createCanvas2dBackend(options)
        : createWebgl2Backend(canvas, options);
    const target =
      kind === "canvas2d"
        ? (backend as ReturnType<typeof createCanvas2dBackend>).wrap(
            canvas,
            canvas.getContext("2d", { alpha: false })!,
          )
        : (backend as ReturnType<typeof createWebgl2Backend>).target;
    try {
      for (const count of [2, 3, 4, 8, 16, 32, 64]) {
        backend.accumulateExposure(target as never, count, (index) =>
          backend.clear(
            target as never,
            index % 2 ? [1, 1, 1, 1] : [0, 0, 0, 1],
          ),
        );
        const expected = count === 3 ? 156 : 188;
        const pixel = Array.from(
          backend.readPixels(target as never).slice(0, 4),
        );
        if (
          JSON.stringify(pixel) !==
          JSON.stringify([expected, expected, expected, 255])
        )
          throw Error(`Linear exposure ${kind}/${count}: ${pixel}`);
        rows.push({ kind: "exposure", backend: kind, count, pixel });
      }
    } finally {
      backend.dispose();
    }
  }
  return rows;
}

/** Every valid nonzero-alpha byte pair crosses the real raster and shader blend. */
export function checkLinearByteRendering() {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const context = tile.getContext("2d", { willReadFrequently: true })!,
    data = context.createImageData(256, 256);
  let pairs = 0;
  for (let alpha = 1; alpha <= 255; alpha++)
    for (let value = 0; value <= alpha; value++) {
      const offset = pairs++ * 4;
      data.data[offset] = Math.round((value * 255) / alpha);
      data.data[offset + 1] = Math.round(((alpha - value) * 255) / alpha);
      data.data[offset + 2] = Math.round((Math.round(alpha / 2) * 255) / alpha);
      data.data[offset + 3] = alpha;
    }
  context.putImageData(data, 0, 0);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const referenceCanvas = canvas.cloneNode() as HTMLCanvasElement;
  const options = {
    colorSpace: "linear-srgb" as const,
    images: {
      images: new Map<string, CanvasImageSource>([["tile", tile]]),
      sizes: new Map<string, readonly [number, number]>([["tile", [256, 256]]]),
    },
    drawText: () => {},
  };
  const reference = createCanvas2dBackend(options),
    target = reference.wrap(
      referenceCanvas,
      referenceCanvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      })!,
    ),
    gpu = createWebgl2Backend(canvas, options);
  const content = {
    type: "image" as const,
    width: 256,
    height: 256,
    fit: "stretch" as const,
    rasterize: "draw" as const,
    sources: [{ asset: "tile" }],
    state: 0,
  };
  const rows = [];
  try {
    for (const mode of CompositionBlendModeSchema.options) {
      reference.clear(target, [0.2, 0.4, 0.6, 1]);
      gpu.clear(gpu.target, [0.2, 0.4, 0.6, 1]);
      reference.drawImage(target, content, [1, 0, 0, 1, 0, 0], 1, mode, []);
      gpu.drawImage(gpu.target, content, [1, 0, 0, 1, 0, 0], 1, mode, []);
      const expected = reference.readPixels(target),
        actual = gpu.readPixels(gpu.target);
      let maximum = 0,
        squared = 0;
      for (let i = 0; i < expected.length; i++) {
        const delta = Math.abs(expected[i]! - actual[i]!);
        maximum = Math.max(maximum, delta);
        squared += delta * delta;
      }
      const psnr =
        squared === 0
          ? 999
          : 10 * Math.log10((255 * 255) / (squared / expected.length));
      if (maximum > 2 || psnr < 50)
        throw Error(`Linear byte ${mode}: delta ${maximum}, PSNR ${psnr}`);
      rows.push({ mode, maxDelta: maximum, psnr });
    }
  } finally {
    gpu.dispose();
    reference.dispose();
  }
  return {
    pairs,
    modes: rows.length,
    pairModeCases: pairs * rows.length,
    rows,
  };
}

import { executeGraph } from "../../packages/renderer-core/src/composition/render/backend.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
export function checkLinearCacheSwitch() {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "switch",
    width: 16,
    height: 16,
    fps: 24,
    frameCount: 1,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "white",
        type: "solid",
        parent: "group",
        size: [16, 16],
        color: "#ffffff80",
        transform: { anchor: [0, 0] },
      },
      {
        id: "black",
        type: "solid",
        parent: "group",
        size: [16, 16],
        color: "#000000",
        transform: { anchor: [0, 0] },
      },
      {
        id: "group",
        type: "group",
        size: [16, 16],
        transform: { anchor: [0, 0] },
        masks: [
          {
            id: "mask",
            mode: "add",
            path: {
              closed: true,
              vertices: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        ],
      },
    ],
  };
  const options = {
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  };
  const rows = [];
  for (const kind of ["canvas2d", "webgl2"] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const run = (() => {
      if (kind === "canvas2d") {
        const backend = createCanvas2dBackend(options),
          target = backend.wrap(
            canvas,
            canvas.getContext("2d", {
              alpha: false,
              willReadFrequently: true,
            })!,
          );
        return {
          render: () =>
            executeGraph(
              backend,
              buildRenderGraph(comp, evaluateComp(comp, 0)),
              target,
            ),
          read: () => backend.readPixels(target),
          dispose: () => backend.dispose(),
        };
      }
      const backend = createWebgl2Backend(canvas, options);
      return {
        render: () =>
          executeGraph(
            backend,
            buildRenderGraph(comp, evaluateComp(comp, 0)),
            backend.target,
          ),
        read: () => backend.readPixels(backend.target),
        dispose: () => backend.dispose(),
      };
    })();
    try {
      for (const colorSpace of ["srgb", "linear-srgb", "srgb"] as const) {
        comp.colorSpace = colorSpace;
        run.render();
        const pixel = Array.from(run.read().slice(0, 4)),
          expected = colorSpace === "linear-srgb" ? 188 : 128;
        if (
          JSON.stringify(pixel) !==
          JSON.stringify([expected, expected, expected, 255])
        )
          throw Error(`Color cache switch ${kind}/${colorSpace}: ${pixel}`);
        rows.push({ backend: kind, colorSpace, pixel });
      }
    } finally {
      run.dispose();
    }
  }
  return rows;
}
