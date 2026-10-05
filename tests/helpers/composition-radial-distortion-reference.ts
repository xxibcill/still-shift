import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkRadialDistortionRendering() {
  return checkNativeEffectRendering({
    "distort.bulge": [
      {},
      { radius: [40, 25], center: [0.4, 0.6], amount: 0.85 },
      {
        radius: [35, 20],
        amount: {
          keys: [
            { frame: 0, value: -1 },
            { frame: 11, value: 1 },
          ],
        },
      },
    ],
    "distort.ripple": [
      {},
      { amplitude: 20, wavelength: 23.75, phase: 123.5, decay: 0.3 },
      {
        amplitude: -12,
        wavelength: 40,
        phase: {
          keys: [
            { frame: 0, value: -360 },
            { frame: 11, value: 720 },
          ],
        },
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
import { RADIAL_INTEGER_SHADER } from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
/** Independent arbitrary-precision root oracle, covering the full-frame integer range. */
function exactRoot(x: number, y: number) {
  const square = BigInt(x) ** 2n + BigInt(y) ** 2n;
  let low = 0n,
    high = 200000n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle * middle <= square) low = middle;
    else high = middle;
  }
  return Number(low);
}
export function checkRadialRootCodes() {
  const release = registerCompositionEffect({
    id: "test.radial-root",
    definition: compositionEffectDefinition("distort.bulge")!,
    renderGpu(context, input) {
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `${RADIAL_INTEGER_SHADER}\nvoid main(){ivec2 coordinate=ivec2(gl_FragCoord.xy),delta=ivec2((coordinate.x-128)*1023+63,(coordinate.y-128)*997-47);uint root=radialRoot(delta);pixel=vec4(float(root&255u),float((root>>8u)&255u),float(root>>16u),255.0)/255.0;}`,
        output,
        [input],
      );
      return output;
    },
    renderCanvas(context, input) {
      const output = context.createSurface(input.width, input.height),
        image = output.ctx.createImageData(input.width, input.height);
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const root = exactRoot((x - 128) * 1023 + 63, (y - 128) * 997 - 47),
            i = (y * 256 + x) * 4;
          image.data.set([root & 255, (root >>> 8) & 255, root >>> 16, 255], i);
        }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  });
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "roots",
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
        effects: [{ id: "root", effect: "test.radial-root" }],
      },
    ],
  };
  const rows: { backend: string; maxDelta: number }[] = [];
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
            const root = exactRoot((x - 128) * 1023 + 63, (y - 128) * 997 - 47),
              i = (y * 256 + x) * 4,
              expected = [root & 255, (root >>> 8) & 255, root >>> 16, 255];
            for (let c = 0; c < 4; c++)
              maxDelta = Math.max(
                maxDelta,
                Math.abs(pixels[i + c]! - expected[c]!),
              );
          }
        if (maxDelta !== 0)
          throw Error(`Radial root oracle/${backend}: ${maxDelta}`);
        rows.push({ backend, maxDelta });
      } finally {
        preview.dispose();
      }
    }
  } finally {
    release();
  }
  return { points: 65536, rows };
}

import {
  radialDistortionControls,
  radialControlBytes,
  radialSourcePoint,
} from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
export function checkRadialSourceCodes() {
  const cases: {
    effect: string;
    params: Parameters<typeof radialDistortionControls>[1];
  }[] = [
    {
      effect: "distort.bulge",
      params: { center: [0.4, 0.6], radius: [1000, 2000], amount: 1 },
    },
    {
      effect: "distort.bulge",
      params: { center: [0, 1], radius: [1 / 16, 10000], amount: -1 },
    },
    {
      effect: "distort.ripple",
      params: {
        center: [0, 1],
        amplitude: 1000,
        wavelength: 1,
        phase: 90,
        decay: 0,
      },
    },
    {
      effect: "distort.ripple",
      params: {
        center: [0.4, 0.6],
        amplitude: -1000,
        wavelength: 23.75,
        phase: 35999.123,
        decay: 1,
      },
    },
  ];
  const rows: {
    case: number;
    axis: number;
    backend: string;
    maxDelta: number;
  }[] = [];
  for (const [variant, { effect, params }] of cases.entries())
    for (const axis of [0, 1]) {
      const controls = radialDistortionControls(effect, params, 8192, 8192);
      const release = registerCompositionEffect({
        id: "test.radial-source",
        definition: compositionEffectDefinition("distort.bulge")!,
        renderGpu(context, input) {
          const bytes = radialControlBytes(controls),
            table = context.createSurface(256, bytes.length / 1024),
            output = context.createSurface(input.width, input.height);
          context.uploadBytes(table, bytes);
          context.pass(
            `${RADIAL_INTEGER_SHADER}\nvoid main(){ivec2 point=(ivec2(gl_FragCoord.xy)*64+32)*16+8;vec2 sourcePoint=radialSource(point);uint value=uint(sourcePoint[${axis}]*16.0+1048576.0);pixel=vec4(float(value&255u),float((value>>8u)&255u),float((value>>16u)&255u),255.0)/255.0;}`,
            output,
            [input, table],
            {
              centerFixed: controls.center,
              radiusFixed: controls.radius,
              bulge: controls.bulge ? 1 : 0,
            },
          );
          return output;
        },
        renderCanvas(context, input) {
          const output = context.createSurface(input.width, input.height),
            image = output.ctx.createImageData(input.width, input.height);
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const value =
                radialSourcePoint(controls, x * 64 + 32.5, y * 64 + 32.5)[
                  axis
                ]! *
                  16 +
                1048576;
              image.data.set(
                [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, 255],
                (y * 128 + x) * 4,
              );
            }
          output.ctx.putImageData(image, 0, 0);
          return output;
        },
      });
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "source-codes",
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
            effects: [{ id: "code", effect: "test.radial-source" }],
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
                const value =
                    radialSourcePoint(controls, x * 64 + 32.5, y * 64 + 32.5)[
                      axis
                    ]! *
                      16 +
                    1048576,
                  expected = [
                    value & 255,
                    (value >>> 8) & 255,
                    (value >>> 16) & 255,
                    255,
                  ],
                  i = (y * 128 + x) * 4;
                for (let c = 0; c < 4; c++)
                  maxDelta = Math.max(
                    maxDelta,
                    Math.abs(pixels[i + c]! - expected[c]!),
                  );
              }
            if (maxDelta !== 0)
              throw Error(
                `Radial source oracle ${variant}/${axis}/${backend}: ${maxDelta}`,
              );
            rows.push({ case: variant, axis, backend, maxDelta });
          } finally {
            preview.dispose();
          }
        }
      } finally {
        release();
      }
    }
  return {
    coordinatePoints: 128 * 128 * cases.length * 2,
    virtualFrame: [8192, 8192],
    rows,
  };
}
