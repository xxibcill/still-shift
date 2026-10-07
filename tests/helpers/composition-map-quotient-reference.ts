import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  MAP_CHANNEL_SHADER,
  MAP_DISPLACEMENT_SHADER,
} from "../../packages/renderer-core/src/composition/render/map-effects.ts";
export function checkMapDisplacementCodes() {
  const rows: {
    midpoint: number;
    amount: number;
    backend: string;
    maxDelta: number;
  }[] = [];
  for (const midpoint of [0, 128, 255])
    for (const amount of [16000, -16000]) {
      const release = registerCompositionEffect({
        id: "test.map-quotient",
        definition: defineCompositionEffect({
          version: "1.0.0",
          properties: {},
        }),
        renderGpu(context, input) {
          const output = context.createSurface(input.width, input.height);
          context.pass(
            `${MAP_CHANNEL_SHADER}\n${MAP_DISPLACEMENT_SHADER}\nvoid main(){int value=displaced(uint(gl_FragCoord.x-0.5),uint(gl_FragCoord.y-0.5),int(amountFixed.x))+32768;pixel=vec4(float(value&255),float(value>>8),0.0,255.0)/255.0;}`,
            output,
            [input],
            { amountFixed: [amount, 0], midpoint },
          );
          return output;
        },
        renderCanvas(context, input) {
          const output = context.createSurface(input.width, input.height),
            image = output.ctx.createImageData(input.width, input.height);
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 256; x++) {
              const value =
                Math.floor(((x - midpoint) * amount * y) / 65025) + 32768;
              image.data.set(
                [value & 255, value >>> 8, 0, 255],
                (y * 256 + x) * 4,
              );
            }
          output.ctx.putImageData(image, 0, 0);
          return output;
        },
      });
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "quotients",
        width: 256,
        height: 256,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [],
        layers: [
          {
            id: "art",
            type: "solid",
            size: [256, 256],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [{ id: "code", effect: "test.map-quotient" }],
          },
        ],
      };
      try {
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const preview = createCompositionPreview(
            document.createElement("canvas"),
            comp,
            { images: new Map(), fonts: new Map() },
            { backend },
          );
          try {
            preview.renderFrame(0);
            const pixels = preview.readPixels();
            let maxDelta = 0;
            for (let y = 0; y < 256; y++)
              for (let x = 0; x < 256; x++) {
                const value =
                    Math.floor(((x - midpoint) * amount * y) / 65025) + 32768,
                  expected = [value & 255, value >>> 8, 0, 255],
                  i = (y * 256 + x) * 4;
                for (let c = 0; c < 4; c++)
                  maxDelta = Math.max(
                    maxDelta,
                    Math.abs(pixels[i + c]! - expected[c]!),
                  );
              }
            if (maxDelta !== 0)
              throw Error(
                `Map quotient ${midpoint}/${amount}/${backend}: ${maxDelta}`,
              );
            rows.push({ midpoint, amount, backend, maxDelta });
          } finally {
            preview.dispose();
          }
        }
      } finally {
        release();
      }
    }
  return { valueAlphaPairs: 65536, cases: 6, quotients: 393216, rows };
}
