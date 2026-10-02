import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { Matrix } from "../../packages/renderer-core/src/node-transform.ts";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";

/** Exercise clipped image edges and filter precision beyond the first bitmap span. */
export function checkWebglEffectSampling() {
  const width = 1080,
    height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const referenceCanvas = canvas.cloneNode() as HTMLCanvasElement;
  const options = {
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  };
  const gpu = createWebgl2Backend(canvas, options);
  const reference = createCanvas2dBackend(options);
  const expected = reference.wrap(
    referenceCanvas,
    referenceCanvas.getContext("2d", { alpha: false })!,
  );
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  const effects: RenderEffect[] = [
    ...[0, 90, 37].map((angle) => ({
      id: `directional/${angle}`,
      effect: "blur.directional",
      enabled: true,
      params: { length: 22, angle, samples: 16 },
    })),
    {
      id: "sine/spans",
      effect: "distort.sine",
      enabled: true,
      params: { amount: 16, wavelength: 340, phase: 2.1031582618174345 },
    },
  ];
  function paint<S extends Surface>(
    backend: RenderBackend<S>,
    target: S,
    effect: RenderEffect,
  ) {
    backend.clear(target, [0.95, 0.93, 0.89, 1]);
    const layer = backend.createSurface(width, height);
    try {
      backend.fillRect(
        layer,
        identity,
        width,
        height,
        [0.2, 0.3, 0.4, 0.3],
        1,
        "normal",
        [],
      );
      for (const x of [0, 150.2, 830, 1075])
        backend.fillRect(
          layer,
          [1, 0, 0, 1, x, 0],
          4.8,
          height,
          [0.85, 0.81, 0.72, 1],
          1,
          "normal",
          [],
        );
      backend.applyEffects(layer, [effect]);
      backend.composite(layer, target, "normal", 1, identity, []);
    } finally {
      backend.releaseSurface(layer);
    }
  }
  try {
    return effects.map((effect) => {
      paint(reference, expected, effect);
      paint(gpu, gpu.target, effect);
      gpu.present();
      const result = compareFrames(
        reference.readPixels(expected),
        gpu.readPixels(gpu.target),
        width,
        height,
      );
      if (!meetsTier(result, "near"))
        throw new Error(`${effect.id}: ${JSON.stringify(result)}`);
      return { id: effect.id, maxDelta: result.maxChannelDelta };
    });
  } finally {
    gpu.dispose();
    reference.dispose();
  }
}
