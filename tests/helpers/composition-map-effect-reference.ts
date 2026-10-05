import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkMapEffectRendering() {
  return checkNativeEffectRendering(
    {
      "distort.displacement-map": [
        {},
        { amount: [20, -14], channelX: 4, channelY: 0, midpoint: 0.3 },
        {
          amount: {
            keys: [
              { frame: 0, value: [-20, 10] },
              { frame: 11, value: [20, -10] },
            ],
          },
          channelX: 3,
          channelY: 2,
        },
      ],
      "transition.gradient-wipe": [
        { progress: 0.4 },
        { progress: 0.7, channel: 0, invert: 1, softness: 0.3 },
        {
          progress: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 11, value: 1 },
            ],
          },
          softness: 0.1,
        },
      ],
    },
    undefined,
    configureMap,
  );
}

function configureMap(comp: Composition) {
  comp.layers.find((layer) => layer.id === "art")!.effects![0]!.inputs = {
    map: "source",
  };
  comp.layers.push({
    id: "source",
    type: "solid",
    size: [96, 72],
    color: "#ffffff",
    enabled: false,
    transform: { anchor: [0, 0], opacity: 0.8 },
    effects: [
      {
        id: "field",
        effect: "color.gradient-ramp",
        params: {
          startColor: "#000000",
          endColor: "#ffcc77",
          start: [0, 0],
          end: {
            keys: [
              { frame: 0, value: [96, 72] },
              { frame: 11, value: [60, 64] },
            ],
          },
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
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
export async function checkStagedMapBytes() {
  const release = registerCompositionEffect({
    id: "test.map-bytes",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: {
        field: { type: "scalar", default: 0, min: 0, max: 1, integer: true },
      },
      requiresLayers: ["map"],
      generatesContent: true,
    }),
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      context.pass(
        "uniform float field;void main(){vec4 value=texelFetch(backdrop,ivec2(gl_FragCoord.xy),0);pixel=vec4(field==0.0?value.rgb:vec3(value.a),1.0);}",
        output,
        [input, context.layers.get("map")!],
        { field: params.field as number },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const source = context.layers!.get("map")!,
        image = source.ctx.getImageData(0, 0, input.width, input.height),
        output = context.createSurface(input.width, input.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const a = image.data[i + 3]!;
        for (let c = 0; c < 3; c++)
          image.data[i + c] =
            params.field === 0 ? Math.round((image.data[i + c]! * a) / 255) : a;
        image.data[i + 3] = 255;
      }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  });
  try {
    const matrix = await checkNativeEffectRendering(
      { "test.map-bytes": [{ field: 0 }, { field: 1 }] },
      ["image"],
      configureMap,
    );
    if (matrix.rows.some((row) => row.maxDelta !== 0))
      throw Error("Staged gradient map bytes are not exact");
    return matrix;
  } finally {
    release();
  }
}
export function checkMapPixelOracles() {
  const image = document.createElement("canvas");
  image.width = 32;
  image.height = 16;
  const context = image.getContext("2d")!,
    data = context.createImageData(32, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++)
      data.data.set([x * 7, 80, 255 - x * 7, 255], (y * 32 + x) * 4);
  context.putImageData(data, 0, 0);
  const rows: { effect: string; backend: string; pixels: number[][] }[] = [];
  for (const effect of ["distort.displacement-map", "transition.gradient-wipe"])
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const displace = effect === "distort.displacement-map";
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "map-oracle",
        width: 32,
        height: 16,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [
          {
            id: "tile",
            type: "image",
            path: "tile.png",
            width: 32,
            height: 16,
            sha256: `sha256:${"0".repeat(64)}`,
          },
        ],
        layers: [
          displace
            ? {
                id: "art",
                type: "image",
                size: [32, 16],
                fit: "stretch",
                sources: [{ asset: "tile" }],
                transform: { anchor: [0, 0] },
                effects: [
                  {
                    id: "map",
                    effect,
                    inputs: { map: "source" },
                    params: { amount: [16, 0], midpoint: 0 },
                  },
                ],
              }
            : {
                id: "art",
                type: "solid",
                size: [32, 16],
                color: "#ffffff",
                transform: { anchor: [0, 0] },
                effects: [
                  {
                    id: "wipe",
                    effect,
                    inputs: { map: "source" },
                    params: { progress: 0.5, channel: 0 },
                  },
                ],
              },
          {
            id: "source",
            type: "solid",
            size: [32, 16],
            color: "#ff0000",
            enabled: false,
            transform: { anchor: [0, 0] },
            ...(!displace
              ? {
                  effects: [
                    {
                      id: "ramp",
                      effect: "color.gradient-ramp",
                      params: { start: [0, 0], end: [32, 0] },
                    },
                  ],
                }
              : {}),
          },
        ],
      };
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map([["tile", image]]), fonts: new Map() },
        { backend },
      );
      try {
        preview.renderFrame(0);
        const pixels = preview.readPixels(),
          points: [number, number, number[]][] = displace
            ? [
                [0, 8, [112, 80, 143, 255]],
                [15, 8, [217, 80, 38, 255]],
                [16, 8, [0, 0, 0, 255]],
              ]
            : [
                [15, 8, [0, 0, 0, 255]],
                [16, 8, [255, 255, 255, 255]],
              ],
          observed: number[][] = [];
        for (const [x, y, expected] of points) {
          const actual = Array.from(
            pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4),
          );
          if (actual.some((v, c) => v !== expected[c]))
            throw Error(
              `Map pixel oracle ${effect}/${backend}: ${actual} != ${expected}`,
            );
          observed.push(actual);
        }
        rows.push({ effect, backend, pixels: observed });
      } finally {
        preview.dispose();
      }
    }
  return rows;
}
