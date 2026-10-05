import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

type EffectParams = NonNullable<
  NonNullable<CompositionLayer["effects"]>[number]["params"]
>;
const variants: Readonly<Record<string, EffectParams[]>> = {
  "color.curves": [
    {},
    {
      curve: [
        [0, 0],
        [0.25, 0.6],
        [0.75, 0.3],
        [1, 1],
      ],
      amount: 0.8,
    },
    {
      curve: [
        [0, 0],
        {
          x: 0.5,
          y: {
            keys: [
              { frame: 0, value: 0.1 },
              { frame: 11, value: 0.9 },
            ],
          },
        },
        [1, 1],
      ],
    },
  ],
  "color.levels": [
    {},
    {
      inputBlack: 0.1,
      inputWhite: 0.85,
      gamma: 0.7,
      outputBlack: 0.08,
      outputWhite: 0.92,
    },
    { inputBlack: 0.7, inputWhite: 0.2, gamma: 2 },
  ],
  "color.tint": [
    {},
    { black: "#bb336680", white: "#ffee2280", amount: 0.65 },
    {
      black: "#2233ff",
      white: "#ee7755",
      amount: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 11, value: 1 },
        ],
      },
    },
  ],
  "color.hue-saturation": [
    {},
    { hue: 120, saturation: 40, lightness: -25 },
    {
      hue: {
        keys: [
          { frame: 0, value: -180 },
          { frame: 11, value: 360 },
        ],
      },
      saturation: -35,
      lightness: 10,
    },
  ],
  "color.exposure": [
    {},
    { exposure: 1.5, offset: -0.03, gamma: 0.7 },
    {
      exposure: {
        keys: [
          { frame: 0, value: -2 },
          { frame: 11, value: 2 },
        ],
      },
      gamma: 1.5,
    },
  ],
  "color.brightness-contrast": [
    {},
    { brightness: 0.1, contrast: 0.65 },
    {
      contrast: {
        keys: [
          { frame: 0, value: -0.8 },
          { frame: 11, value: 0.8 },
        ],
      },
    },
  ],
  "color.fill": [
    { color: "#df5077" },
    { color: "#22e6cc80", amount: 0.65 },
    {
      color: "#aadd33",
      amount: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 11, value: 1 },
        ],
      },
    },
  ],
  "color.gradient-ramp": [
    {},
    {
      start: [10, 10],
      end: [70, 55],
      startColor: "#eec344",
      endColor: "#df507780",
    },
    {
      start: [0, 0],
      end: {
        x: {
          keys: [
            { frame: 0, value: 80 },
            { frame: 11, value: -80 },
          ],
        },
        y: 60,
      },
      startColor: "#88cc33",
      endColor: "#7733dd",
      amount: 0.75,
    },
  ],
  "color.invert": [
    {},
    { amount: 0.3 },
    {
      amount: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 11, value: 1 },
        ],
      },
    },
  ],
  "color.posterize": [
    {},
    { levels: 3 },
    {
      levels: {
        keys: [
          { frame: 0, value: 2 },
          { frame: 11, value: 16 },
        ],
      },
    },
  ],
};
const kinds = [
  "solid",
  "image",
  "text",
  "shape",
  "provider",
  "group",
  "precomp",
  "collapsed",
  "adjustment",
] as const;
const box = (id = "art"): Extract<CompositionLayer, { type: "solid" }> => ({
  id,
  type: "solid",
  color: "#33669980",
  size: [48, 32],
  transform: { anchor: [0, 0], position: [18, 15] },
});
function fixture(
  kind: (typeof kinds)[number],
  effect: string,
  params: EffectParams,
): Composition {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "colors",
    width: 96,
    height: 72,
    fps: 24,
    frameCount: 12,
    background: "#192937",
    assets: [],
    layers: [],
  };
  let root: CompositionLayer = box();
  if (kind === "image") {
    comp.assets = [
      {
        id: "tile",
        type: "image",
        path: "tile.png",
        sha256: `sha256:${"0".repeat(64)}`,
        width: 48,
        height: 32,
      },
    ];
    root = {
      id: "art",
      type: "image",
      sources: [{ asset: "tile" }],
      size: [48, 32],
      fit: "stretch",
      transform: { anchor: [0, 0], position: [18, 15] },
    };
  } else if (kind === "text")
    root = {
      id: "art",
      type: "text",
      text: "Aa",
      fontSize: 28,
      color: "#df507780",
      transform: { position: [15, 48] },
    };
  else if (kind === "shape")
    root = {
      id: "art",
      type: "shape",
      contents: [
        {
          id: "rect",
          type: "rect",
          size: [48, 32],
          position: [42, 31],
          roundness: 6,
        },
        { id: "fill", type: "fill", color: "#eec34480" },
      ],
    };
  else if (kind === "provider")
    root = {
      id: "art",
      type: "provider",
      provider: "test.colors@1.0.0",
      params: {},
      transform: { position: [18, 15] },
    };
  else if (kind === "group") {
    root = {
      id: "art",
      type: "group",
      size: [80, 60],
      clip: true,
      transform: { anchor: [0, 0] },
    };
    comp.layers.push(
      { ...box("child"), parent: "art" },
      {
        ...box("other"),
        color: "#eec34480",
        parent: "art",
        transform: { anchor: [0, 0], position: [40, 25] },
      },
    );
  } else if (kind === "precomp" || kind === "collapsed") {
    comp.precomps = [
      { id: "child", width: 96, height: 72, frameCount: 12, layers: [box()] },
    ];
    root = {
      id: "art",
      type: "precomp",
      comp: "child",
      collapseTransforms: kind === "collapsed",
      transform: { anchor: [0, 0] },
    };
  } else if (kind === "adjustment") {
    comp.layers.push(box("back"));
    root = { id: "art", type: "adjustment", transform: { opacity: 0.65 } };
  }
  root.effects = [{ id: "correction", effect, params }];
  if (kind === "adjustment") comp.layers.unshift(root);
  else comp.layers.push(root);
  return comp;
}
export async function checkColorEffectRendering(
  selectedKinds?: readonly (typeof kinds)[number][],
) {
  return checkNativeEffectRendering(variants, selectedKinds);
}
export async function checkNativeEffectRendering(
  variants: Readonly<Record<string, EffectParams[]>>,
  selectedKinds: readonly (typeof kinds)[number][] = kinds,
) {
  const tile = document.createElement("canvas");
  tile.width = 48;
  tile.height = 32;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = "#33669980";
  ctx.fillRect(0, 0, 48, 32);
  ctx.fillStyle = "#eec34460";
  ctx.fillRect(10, 5, 20, 20);
  const resources = {
    images: new Map<string, CanvasImageSource>([["tile", tile]]),
    fonts: new Map(),
  };
  const providers = [
    {
      id: "test.colors@1.0.0",
      prepare: () => (context: CanvasRenderingContext2D) => {
        context.fillStyle = "#df507780";
        context.beginPath();
        context.arc(24, 16, 14, 0, Math.PI * 2);
        context.fill();
      },
    },
  ];
  const rows: {
    effect: string;
    kind: string;
    variant: number;
    frames: number;
    maxDelta: number;
    psnr: number;
  }[] = [];
  for (const [effect, values] of Object.entries(variants))
    for (const kind of selectedKinds)
      for (const [variant, params] of values.entries()) {
        const comp = fixture(kind, effect, params);
        const previews = (["canvas2d", "webgl2"] as const).map((backend) =>
          createCompositionPreview(
            document.createElement("canvas"),
            comp,
            resources,
            { backend, providers },
          ),
        );
        let maximum = 0,
          squared = 0,
          channels = 0;
        const stored: Uint8ClampedArray[][] = [[], []];
        try {
          for (let frame = 0; frame < 12; frame++) {
            const pixels = previews.map((preview) => {
              preview.renderFrame(frame);
              return new Uint8ClampedArray(preview.readPixels());
            });
            for (let i = 0; i < pixels[0]!.length; i++) {
              const delta = Math.abs(pixels[0]![i]! - pixels[1]![i]!);
              maximum = Math.max(maximum, delta);
              squared += delta * delta;
              channels++;
            }
            pixels.forEach((p, index) => stored[index]!.push(p));
          }
          const psnr =
            squared === 0
              ? 999
              : 10 * Math.log10((255 * 255) / (squared / channels));
          if (maximum > 2 || psnr < 50)
            throw Error(
              `Native effect ${effect}/${kind}/${variant}: max delta ${maximum}, PSNR ${psnr}`,
            );
          for (const [index, preview] of previews.entries())
            for (const frame of [11, 0, 7, 2, 10, 1, 5]) {
              preview.renderFrame(frame);
              const pixels = preview.readPixels();
              if (
                !pixels.every((byte, i) => byte === stored[index]![frame]![i])
              )
                throw Error(
                  `Color effect seek differs ${effect}/${kind}/${variant}/${frame}`,
                );
            }
          rows.push({
            effect,
            kind,
            variant,
            frames: 12,
            maxDelta: maximum,
            psnr,
          });
        } finally {
          for (const preview of previews) preview.dispose();
        }
      }
  return { cases: rows.length, frames: rows.length * 12, rows };
}

/** All 32,895 valid nonzero-alpha premultiplied byte pairs cross real Canvas/GPU stages. */
function byteEffectCases(
  cases: { effect: string; label: string; params: EffectParams }[],
) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const context = tile.getContext("2d", { willReadFrequently: true })!;
  const image = context.createImageData(256, 256);
  for (let alpha = 1; alpha <= 255; alpha++)
    for (let premultiplied = 0; premultiplied <= alpha; premultiplied++) {
      const i = (alpha * 256 + premultiplied) * 4;
      image.data[i] = Math.round((premultiplied * 255) / alpha);
      image.data[i + 1] = 255 - image.data[i]!;
      image.data[i + 2] = (image.data[i]! * 3) % 256;
      image.data[i + 3] = alpha;
    }
  context.putImageData(image, 0, 0);
  const resources = {
    images: new Map<string, CanvasImageSource>([["tile", tile]]),
    fonts: new Map(),
  };
  const rows: { label: string; maxDelta: number; psnr: number }[] = [];
  for (const { effect, label, params } of cases) {
    const composition: Composition = {
      schemaVersion: "composition-1",
      id: "byte-rounding",
      width: 256,
      height: 256,
      fps: 24,
      frameCount: 1,
      background: "#000000",
      assets: [
        {
          id: "tile",
          type: "image",
          path: "tile.png",
          sha256: `sha256:${"0".repeat(64)}`,
          width: 256,
          height: 256,
        },
      ],
      layers: [
        {
          id: "image",
          type: "image",
          sources: [{ asset: "tile" }],
          size: [256, 256],
          fit: "stretch",
          transform: { anchor: [0, 0] },
          effects: [{ id: "quantize", effect, params }],
        },
      ],
    };
    const previews = (["canvas2d", "webgl2"] as const).map((backend) =>
      createCompositionPreview(
        document.createElement("canvas"),
        composition,
        resources,
        { backend },
      ),
    );
    try {
      const frames = previews.map((preview) => {
        preview.renderFrame(0);
        return preview.readPixels();
      });
      let maxDelta = 0,
        squared = 0;
      for (let i = 0; i < frames[0]!.length; i++) {
        const delta = Math.abs(frames[0]![i]! - frames[1]![i]!);
        maxDelta = Math.max(maxDelta, delta);
        squared += delta * delta;
      }
      const psnr =
        squared === 0
          ? 999
          : 10 * Math.log10((255 * 255) / (squared / frames[0]!.length));
      if (maxDelta > 2 || psnr < 50)
        throw Error(
          `Color byte-rounding ${label}: delta ${maxDelta}, PSNR ${psnr}`,
        );
      rows.push({ label, maxDelta, psnr });
    } finally {
      for (const preview of previews) preview.dispose();
    }
  }
  return { pairs: 32895, rows };
}

export function checkColorEffectByteRounding() {
  const result = byteEffectCases(
    [2, 3, 6, 10, 16, 256].map((levels) => ({
      effect: "color.posterize",
      label: String(levels),
      params: { levels },
    })),
  );
  return {
    pairs: result.pairs,
    rows: result.rows.map(({ label, ...row }) => ({
      levels: Number(label),
      ...row,
    })),
  };
}
export function checkColorCurveByteRounding() {
  return byteEffectCases([
    { effect: "color.curves", label: "identity", params: {} },
    {
      effect: "color.curves",
      label: "invert",
      params: {
        curve: [
          [0, 1],
          [1, 0],
        ],
      },
    },
    {
      effect: "color.curves",
      label: "tight-control-points",
      params: {
        curve: [
          [0, 0],
          [128 / 255 - 1e-12, 0.1],
          [128 / 255, 0.9],
          [128 / 255 + 1e-12, 0.1],
          [1, 1],
        ],
      },
    },
    {
      effect: "color.curves",
      label: "sixteen-points",
      params: {
        curve: Array.from({ length: 16 }, (_, i) => [i / 15, i % 2]),
        amount: 0.8,
      },
    },
  ]);
}
