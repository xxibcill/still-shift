import type { Composition } from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  createCompositionPreviewAsync,
  loadCompositionResources,
  ManagedMemory,
  createRenderCanvas,
  withManagedMemory,
} from "../../packages/renderer-core/src/index.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";

export function tintCapacityFixture(): Composition {
  return {
    schemaVersion: "composition-1",
    id: "tint-capacity",
    width: 1024,
    height: 512,
    fps: 60,
    frameCount: 64,
    background: null,
    assets: [
      {
        id: "body",
        type: "font",
        path: "/assets/story-motion/fonts/plex-sans-semibold.ttf",
        sha256:
          "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
        weight: "600",
      },
    ],
    layers: [
      {
        id: "caption",
        type: "text",
        text: "AAAAAAAAAA",
        fontAsset: "body",
        fontSize: 300,
        color: {
          keys: [
            { frame: 0, value: "#ff0000" },
            { frame: 63, value: "#0000ff" },
          ],
        },
        transform: { anchor: [0, 0], position: [0, 300] },
      },
    ],
  };
}

/** Exact forward/reverse pixels and actual managed native retirement under cache pressure. */
export async function checkTintCapacity(options: {
  backend: "canvas2d" | "webgl2";
  baseUrl: string;
  worker: number;
  credential: string;
  scopeKey: string;
}) {
  const composition = tintCapacityFixture();
  const assetUrl = (id: string) =>
    composition.assets.find((asset) => asset.id === id)!.path;
  const resources = await loadCompositionResources(composition, assetUrl);
  const baseline = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources,
    {
      backend: options.backend,
      preserveAlpha: true,
    },
  );
  const expected: string[] = [];
  try {
    for (let frame = 0; frame < composition.frameCount; frame++) {
      baseline.renderFrame(frame);
      expected.push(
        await sha256Hex(baseline.readPixels().buffer as ArrayBuffer),
      );
    }
  } finally {
    baseline.dispose();
  }
  const memory = new ManagedMemory({
    pixels: 512 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  let retainedCanvasBytes = 0,
    uncachedPaints = 0,
    comparedFrames = 0;
  const byteLimit = 128 * 1024 ** 2;
  try {
    await withManagedMemory(memory, async () => {
      const resources = await loadCompositionResources(composition, assetUrl);
      const preview = await createCompositionPreviewAsync(
        createRenderCanvas(),
        composition,
        resources,
        {
          backend: options.backend,
          preserveAlpha: true,
          surfaceCache: {
            scopeKey: options.scopeKey,
            byteLimit,
            exchange: compositionSurfaceExchange(options),
          },
        },
      );
      try {
        const forward = Array.from(
          { length: composition.frameCount },
          (_, frame) => frame,
        );
        for (const frames of [forward, [...forward].reverse(), forward])
          for (const frame of frames) {
            memory.beginScratch();
            try {
              await preview.prepareFrame(frame);
              preview.renderFrame(frame);
              const actual = await sha256Hex(
                preview.readPixels().buffer as ArrayBuffer,
              );
              if (actual !== expected[frame])
                throw Error(
                  `Tint capacity pixels differ at ${options.backend}/${frame}`,
                );
              comparedFrames++;
            } finally {
              memory.endScratch();
            }
          }
        const statistics = preview.sourceCacheStatistics!();
        retainedCanvasBytes = statistics.retainedCanvasBytes;
        uncachedPaints = statistics.sources.reduce(
          (sum, source) => sum + source.uncachedPaints,
          0,
        );
        releaseRenderMetadata(statistics);
        if (retainedCanvasBytes > byteLimit || uncachedPaints === 0)
          throw Error(
            "Tint capacity fixture did not exercise bounded uncached painting",
          );
      } finally {
        preview.dispose();
      }
    });
  } finally {
    memory.dispose();
  }
  return {
    backend: options.backend,
    comparedFrames,
    retainedCanvasBytes,
    uncachedPaints,
    memory: memory.statistics,
  };
}
