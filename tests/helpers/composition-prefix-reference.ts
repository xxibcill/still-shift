import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";
import { preparedProvider } from "../../packages/renderer-core/src/composition/render/providers.ts";

export type PrefixVariant =
  | "closed"
  | "mixed-batch"
  | "upstream"
  | "late"
  | "changing-provider"
  | "linear";
export async function checkSharedCompositionPrefixes(options: {
  backend: "canvas2d" | "webgl2";
  alpha: boolean;
  software: boolean;
  variant: PrefixVariant;
  worker: number;
  credential: string;
  scopeKey: string;
  baseUrl: string;
}) {
  const image = document.createElement("canvas");
  image.width = 7;
  image.height = 9;
  const pixels = new ImageData(7, 9);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = (i * 17) % 256;
    pixels.data[i + 1] = (i * 33) % 256;
    pixels.data[i + 2] = 197;
    pixels.data[i + 3] = 51 + ((i * 13) % 205);
  }
  image.getContext("2d")!.putImageData(pixels, 0, 0);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "closed-prefix",
    width: 32,
    height: 24,
    fps: 60,
    frameCount: 8,
    background: "#22446680",
    ...(options.variant === "linear" ? { colorSpace: "linear-srgb" } : {}),
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.png",
        width: 7,
        height: 9,
        sha256: "sha256:" + "1".repeat(64),
      },
    ],
    layers: [
      {
        id: "moving",
        type: "image",
        size: [17, 13],
        fit: "stretch",
        sources: [{ asset: "art" }],
        transform: {
          anchor: [0, 0],
          rotation: 17.2,
          position: {
            keys: [
              { frame: 0, value: [2.25, 1.35] },
              { frame: 7, value: [14.45, 11.25] },
            ],
          },
        },
      },
      {
        id: "paint",
        type: "provider",
        provider: "native-prefix@1.0.0",
        params: {},
        transform: { anchor: [0, 0] },
        ...(options.variant === "late" ? { inPoint: 4 } : {}),
      },
      {
        id: "floor",
        type: "solid",
        size: [19, 17],
        color: "#cc663380",
        transform: { anchor: [0, 0], position: [1.25, 2.45], rotation: -11.2 },
      },
    ],
  };
  if (options.variant === "mixed-batch") {
    const moving = composition.layers[0]!;
    composition.layers[0] = {
      id: moving.id,
      type: "solid",
      size: [17, 13],
      color: "#3377bb80",
      transform: moving.transform,
    };
  }
  if (options.variant === "upstream") composition.layers.reverse();
  if (options.software)
    composition.layers.push({
      id: "software",
      type: "shape",
      contents: [
        { id: "rect", type: "rect", position: [31, 23], size: [1, 1] },
        { id: "fill", type: "fill", color: "#11335580" },
      ],
    });
  let draws = 0;
  const providers = [
    {
      id: "native-prefix@1.0.0",
      prepare() {
        return preparedProvider(
          (ctx: CanvasRenderingContext2D, time: number) => {
            draws++;
            const gradient = ctx.createLinearGradient(0, 0, 32, 24);
            gradient.addColorStop(
              0,
              options.variant === "changing-provider"
                ? `rgba(${32 + time * 17},187,118,0.5)`
                : "#14bb7680",
            );
            gradient.addColorStop(1, "#4488bb60");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 32, 24);
          },
          {
            visualKey: (time) =>
              options.variant === "changing-provider"
                ? String(time)
                : "immutable-gradient",
            boundedCanvas: true,
            bounds: { left: 0, top: 0, right: 32, bottom: 24 },
          },
        );
      },
    },
  ];
  const resources = () => ({
    images: new Map([["art", image]]),
    fonts: new Map(),
  });
  const expected = new Map<number, Uint8ClampedArray>();
  const reference = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    { backend: options.backend, preserveAlpha: options.alpha, providers },
  );
  try {
    for (let frame = 0; frame < 8; frame++) {
      reference.renderFrame(frame);
      expected.set(frame, reference.readPixels().slice());
    }
  } finally {
    reference.dispose();
  }
  draws = 0;
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources(),
    {
      backend: options.backend,
      preserveAlpha: options.alpha,
      providers,
      collectStatistics: true,
      surfaceCache: {
        scopeKey: options.scopeKey,
        byteLimit: 16 * 1024 * 1024,
        exchange: compositionSurfaceExchange(options),
      },
    },
  );
  const frames = [0, 1, 2, 3, 4, 5, 6, 7, 7, 4, 1, 6, 0];
  try {
    for (const frame of frames) {
      await preview.prepareFrame(frame);
      preview.renderFrame(frame);
      const actual = preview.readPixels(),
        baseline = expected.get(frame)!;
      if (actual.length !== baseline.length)
        throw Error("Prefix target size changed");
      for (let i = 0; i < actual.length; i++)
        if (actual[i] !== baseline[i])
          throw Error(
            `${options.backend}/${options.alpha}/${options.software}/${options.variant}/${frame}: byte ${i}, ${actual[i]} instead of ${baseline[i]}`,
          );
    }
    return {
      worker: options.worker,
      frameChecks: frames.length,
      nativeProviderPaints: draws,
      submissionStatistics: preview.renderStatistics!(),
      statistics: preview.rootCacheStatistics!(),
      independent: preview.surfaceCacheStatistics!(),
    };
  } finally {
    preview.dispose();
  }
}
