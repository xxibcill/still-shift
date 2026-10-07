import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkNoiseEffectRendering() {
  return checkNativeEffectRendering({
    "stylize.fractal-noise": [
      {},
      {
        scale: 73.25,
        octaves: 8,
        evolution: -215999.123,
        seed: 2147483647,
        contrast: 2,
        brightness: -0.15,
        amount: 0.7,
        dark: "#22337780",
        light: "#eecd44",
      },
      {
        evolution: {
          keys: [
            { frame: 0, value: -1.1 },
            { frame: 11, value: 2.1 },
          ],
        },
        scale: 16,
        seed: 99,
        octaves: 4,
      },
    ],
    "distort.turbulent": [
      {},
      {
        scale: 73.25,
        octaves: 8,
        evolution: -215999.123,
        seed: 2147483647,
        amount: 25,
      },
      {
        evolution: {
          keys: [
            { frame: 0, value: -1.1 },
            { frame: 11, value: 2.1 },
          ],
        },
        scale: 16,
        seed: 99,
        octaves: 4,
        amount: -30,
      },
    ],
  });
}

import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  compositionEffectDefinition,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  noiseControls,
  noiseField,
  noiseFieldUniforms,
  NOISE_FIELD_SHADER,
} from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
export function checkNoiseFieldCodes() {
  const release = registerCompositionEffect({
    id: "test.noise-code",
    definition: compositionEffectDefinition("stylize.fractal-noise")!,
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `${NOISE_FIELD_SHADER}\nvoid main(){uint value=fieldAt(gl_FragCoord.xy,installedSeed());pixel=vec4(float(value&255u)/255.0,float(value>>8u)/255.0,0.0,1.0);}`,
        output,
        [input],
        noiseFieldUniforms(noiseControls(params)),
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height),
        image = output.ctx.createImageData(input.width, input.height),
        controls = noiseControls(params);
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const value = noiseField(controls, x + 0.5, y + 0.5),
            index = (y * input.width + x) * 4;
          image.data[index] = value & 255;
          image.data[index + 1] = value >>> 8;
          image.data[index + 3] = 255;
        }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  });
  const rows: { case: number; maxDelta: number }[] = [];
  const cases = [
    { seed: 1, scale: 64, octaves: 1, evolution: 0 },
    { seed: 2147483647, scale: 73.25, octaves: 8, evolution: -215999.123 },
    { seed: 0, scale: 1, octaves: 8, evolution: 216000 },
    { seed: 99, scale: 10000, octaves: 4, evolution: -1.001 },
    { seed: 2147483647, scale: 1.125, octaves: 8, evolution: 0.9999 },
  ];
  try {
    for (const [variant, params] of cases.entries()) {
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "codes",
        width: 128,
        height: 128,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [],
        layers: [
          {
            id: "art",
            type: "solid",
            size: [128, 128],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [{ id: "code", effect: "test.noise-code", params }],
          },
        ],
      };
      const controls = noiseControls(params);
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
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const value = noiseField(controls, x + 0.5, y + 0.5),
                index = (y * 128 + x) * 4,
                expected = [value & 255, value >>> 8, 0, 255];
              for (let c = 0; c < 4; c++)
                maxDelta = Math.max(
                  maxDelta,
                  Math.abs(pixels[index + c]! - expected[c]!),
                );
            }
        } finally {
          preview.dispose();
        }
      }
      if (maxDelta !== 0)
        throw Error(`Packed noise code oracle ${variant}: ${maxDelta}`);
      rows.push({ case: variant, maxDelta });
    }
  } finally {
    release();
  }
  return { cases: rows.length, fieldPoints: 128 * 128 * rows.length, rows };
}
