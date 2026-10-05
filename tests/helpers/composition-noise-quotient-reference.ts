import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  NOISE_FIELD_SHADER,
  TURBULENT_OFFSET_SHADER,
  turbulentOffset,
} from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
export function checkTurbulentQuotients() {
  const release = registerCompositionEffect({
    id: "test.noise-quotient",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: {
        amountFixed: {
          type: "scalar",
          default: 16000,
          min: -16000,
          max: 16000,
          integer: true,
        },
      },
    }),
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `${NOISE_FIELD_SHADER}\n${TURBULENT_OFFSET_SHADER}\nvoid main(){uint value=uint(gl_FragCoord.x)+uint(gl_FragCoord.y)*256u;uint encoded=uint(displacement(value)+32768);pixel=vec4(float(encoded&255u)/255.0,float(encoded>>8u)/255.0,0.0,1.0);}`,
        output,
        [input],
        { amountFixed: params.amountFixed as number },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height),
        image = output.ctx.createImageData(input.width, input.height);
      for (let value = 0; value < 65536; value++) {
        const encoded =
          turbulentOffset(value, params.amountFixed as number) + 32768;
        image.data[value * 4] = encoded & 255;
        image.data[value * 4 + 1] = encoded >>> 8;
        image.data[value * 4 + 3] = 255;
      }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  });
  const rows: { amountFixed: number; maxDelta: number }[] = [];
  try {
    for (const amountFixed of [16000, -16000, 1000, -1000, 16, -16, 0]) {
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
            effects: [
              {
                id: "divide",
                effect: "test.noise-quotient",
                params: { amountFixed },
              },
            ],
          },
        ],
      };
      let maxDelta = 0;
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
          for (let value = 0; value < 65536; value++) {
            const offset = Math.floor(((value - 32768) * amountFixed) / 65535),
              encoded = offset + 32768,
              expected = [encoded & 255, encoded >>> 8, 0, 255];
            for (let c = 0; c < 4; c++)
              maxDelta = Math.max(
                maxDelta,
                Math.abs(pixels[value * 4 + c]! - expected[c]!),
              );
          }
        } finally {
          preview.dispose();
        }
      }
      if (maxDelta !== 0)
        throw Error(`Turbulent quotient oracle ${amountFixed}: ${maxDelta}`);
      rows.push({ amountFixed, maxDelta });
    }
  } finally {
    release();
  }
  return { valuesPerCase: 65536, cases: rows.length, rows };
}
