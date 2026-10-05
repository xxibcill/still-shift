import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import {
  gradientControls,
  gradientRank,
  gradientUniforms,
  GRADIENT_RANK_SHADER,
} from "../../packages/renderer-core/src/composition/render/gradient-controls.ts";
export function checkGradientRankCodes() {
  const cases = [
      { start: [0, 0], end: [16, 0] },
      { start: [0, 0], end: [96, 72] },
      { start: [96, 72], end: [0, 0] },
      { start: [-1000000, -1000000], end: [1000000, 1000000] },
      { start: [4128.499, 4128.5], end: [4128.501, 4128.5] },
      { start: [4128.498, 4128.5], end: [4128.502, 4128.5] },
      { start: [15, 15], end: [15, 15] },
    ],
    rows: { case: number; backend: string; maxDelta: number }[] = [];
  for (const [variant, params] of cases.entries()) {
    const controls = gradientControls(params),
      release = registerCompositionEffect({
        id: "test.gradient-rank",
        definition: defineCompositionEffect({
          version: "1.0.0",
          properties: {},
        }),
        renderGpu(context, input) {
          const output = context.createSurface(input.width, input.height);
          context.pass(
            `${GRADIENT_RANK_SHADER}\nvoid main(){int rank=gradientRank(vec2(ivec2(gl_FragCoord.xy))*64.0+32.5);pixel=vec4(float(rank&255),float(rank>>8),0.0,255.0)/255.0;}`,
            output,
            [input],
            gradientUniforms(controls),
          );
          return output;
        },
        renderCanvas(context, input) {
          const output = context.createSurface(input.width, input.height),
            image = output.ctx.createImageData(input.width, input.height);
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const rank = gradientRank(controls, x * 64 + 32.5, y * 64 + 32.5);
              image.data.set(
                [rank & 255, rank >>> 8, 0, 255],
                (y * 128 + x) * 4,
              );
            }
          output.ctx.putImageData(image, 0, 0);
          return output;
        },
      });
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "rank",
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
          effects: [{ id: "rank", effect: "test.gradient-rank" }],
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
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const rank = gradientRank(controls, x * 64 + 32.5, y * 64 + 32.5),
                expected = [rank & 255, rank >>> 8, 0, 255],
                i = (y * 128 + x) * 4;
              for (let c = 0; c < 4; c++)
                maxDelta = Math.max(
                  maxDelta,
                  Math.abs(pixels[i + c]! - expected[c]!),
                );
            }
          if (maxDelta !== 0)
            throw Error(
              `Gradient rank oracle ${variant}/${backend}: ${maxDelta}`,
            );
          rows.push({ case: variant, backend, maxDelta });
        } finally {
          preview.dispose();
        }
      }
    } finally {
      release();
    }
  }
  return {
    rankPoints: 128 * 128 * cases.length,
    virtualFrame: [8192, 8192],
    rows,
  };
}
