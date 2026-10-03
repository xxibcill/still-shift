import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import type { ProviderContent } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { Matrix } from "../../packages/renderer-core/src/node-transform.ts";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";

/** Filtered primitives must match CPU Canvas even when ANGLE uses hardware. */
export function checkWebglPrimitiveBlur() {
  const width = 192,
    height = 128;
  const options = {
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
    drawProvider: (ctx: CanvasRenderingContext2D, content: ProviderContent) => {
      ctx.fillStyle = content.state ? "#294ca7" : "#cb3217";
      for (let y = 4; y < 90; y += 12)
        for (let x = 4; x < 150; x += 11) ctx.fillRect(x, y, 4, 8);
    },
  };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const referenceCanvas = canvas.cloneNode() as HTMLCanvasElement;
  const reference = createCanvas2dBackend({ ...options, softwareRaster: true });
  const expected = reference.wrap(
    referenceCanvas,
    referenceCanvas.getContext("2d", { willReadFrequently: true })!,
  );
  const gpu = createWebgl2Backend(canvas, options);
  const content: ProviderContent = {
    type: "provider",
    key: "blurred-pattern",
    time: 0,
    layer: {
      id: "pattern",
      type: "provider",
      provider: "test.pattern@1.0.0",
      params: {},
    },
  };
  const matrix: Matrix = [1, 0, 0, 1, 12, 12];
  const reports = [];
  try {
    // Alternate filtered and ordinary paints of the same size to exercise pooling.
    for (const radius of [0, 1, 4, 0, 2.5, 6, 1])
      for (const mix of [1, 0.37])
        for (const batched of [false, true]) {
          reference.clear(expected, [1, 1, 1, 1]);
          gpu.clear(gpu.target, [1, 1, 1, 1]);
          const state = { ...content, state: 1, stateFrom: 0, stateMix: mix };
          const primitive = reference.createSurface(width, height);
          reference.drawProvider(
            primitive,
            state,
            matrix,
            0.7,
            "normal",
            [],
            undefined,
            radius,
          );
          reference.composite(
            primitive,
            expected,
            "normal",
            1,
            [1, 0, 0, 1, 0, 0],
            [],
          );
          reference.releaseSurface(primitive);
          if (batched)
            gpu.drawVectors!(gpu.target, [
              {
                kind: "draw",
                layer: "pattern",
                content: state,
                matrix,
                transforms: [matrix],
                opacity: 0.7,
                blend: "normal",
                clips: [],
                paintBlur: radius,
              },
            ]);
          else
            gpu.drawProvider(
              gpu.target,
              state,
              matrix,
              0.7,
              "normal",
              [],
              undefined,
              radius,
            );
          gpu.present();
          const compared = compareFrames(
            reference.readPixels(expected),
            gpu.readPixels(gpu.target),
            width,
            height,
          );
          if (!meetsTier(compared, "near"))
            throw new Error(
              `Primitive blur parity: ${JSON.stringify({ radius, mix, batched, ...compared })}`,
            );
          reports.push({
            radius,
            mix,
            batched,
            maxDelta: compared.maxChannelDelta,
          });
        }
    return reports;
  } finally {
    gpu.dispose();
    reference.dispose();
  }
}
