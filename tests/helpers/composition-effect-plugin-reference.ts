import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";

/** The Canvas implementation uses straight bytes; the GPU transforms premultiplied texels. */
export async function checkEffectPluginRendering() {
  const release = registerCompositionEffect({
    id: "test.invert",
    definition: defineCompositionEffect({
      version: "1.0.0",
      properties: { amount: { type: "scalar", default: 1, min: 0, max: 1 } },
    }),
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `uniform float amount; void main() {
        vec4 value=texelFetch(source,ivec2(gl_FragCoord.xy),0);
        pixel=bytes(vec4(mix(value.rgb,vec3(value.a)-value.rgb,amount),value.a));
      }`,
        output,
        [input],
        { amount: params.amount as number },
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const pixels = input.ctx.getImageData(0, 0, input.width, input.height);
      for (let i = 0; i < pixels.data.length; i += 4)
        for (let c = 0; c < 3; c++)
          pixels.data[i + c] = Math.round(
            pixels.data[i + c]! +
              (255 - 2 * pixels.data[i + c]!) * (params.amount as number),
          );
      output.ctx.putImageData(pixels, 0, 0);
      return output;
    },
  });
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "plugin",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 12,
    background: "#141e28",
    assets: [],
    layers: [
      {
        id: "background",
        type: "solid",
        color: "#445566",
        size: [64, 48],
        transform: { anchor: [0, 0] },
        effects: [
          { id: "invert", effect: "test.invert", params: { amount: 0.5 } },
        ],
      },
      {
        id: "foreground",
        type: "solid",
        color: "#33669980",
        size: [32, 24],
        transform: { anchor: [0, 0], position: [12, 10] },
        effects: [
          {
            id: "invert",
            effect: "test.invert",
            params: {
              amount: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 11, value: 1 },
                ],
              },
            },
          },
        ],
      },
    ],
  };
  const resources = {
    images: new Map<string, CanvasImageSource>(),
    fonts: new Map(),
  };
  const previews = await Promise.all(
    (["canvas2d", "webgl2"] as const).map((backend) => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 48;
      return createCompositionPreview(canvas, composition, resources, {
        backend,
      });
    }),
  );
  let maximum = 0;
  const stored: number[][] = [];
  try {
    for (let frame = 0; frame < 12; frame++) {
      const bytes = previews.map((preview) => {
        preview.renderFrame(frame);
        return preview.readPixels();
      });
      for (let i = 0; i < bytes[0]!.length; i++)
        maximum = Math.max(maximum, Math.abs(bytes[0]![i]! - bytes[1]![i]!));
      stored.push(Array.from(bytes[1]!));
      // Independent opaque background: 50% invert is a neutral 128 byte.
      for (const pixels of bytes)
        if (
          Math.abs(pixels[0]! - 128) > 1 ||
          Math.abs(pixels[1]! - 128) > 1 ||
          Math.abs(pixels[2]! - 128) > 1
        )
          throw Error("Effect plugin failed independent neutral-gray oracle");
    }
    if (maximum > 2)
      throw Error(`Effect plugin backend difference ${maximum} exceeds 2`);
    for (const frame of [11, 0, 7, 2, 10, 1, 5]) {
      previews[1]!.renderFrame(frame);
      const actual = previews[1]!.readPixels();
      if (!actual.every((byte, index) => byte === stored[frame]![index]))
        throw Error(`Plugin seek changed frame ${frame}`);
    }
    return { frames: 12, randomSeeks: 7, maxDelta: maximum };
  } finally {
    for (const preview of previews) preview.dispose();
    release();
  }
}
