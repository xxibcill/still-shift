// EC (docs/editorial-typography-improvement-plan.md#ec--effect-render-cost-shadow-halo):
// the Canvas drop shadow did its sampling, both blur passes and the composite
// over every pixel of the layer surface, so a title's halo cost the same as a
// full-frame blur. The shadow can only paint near the layer's opaque pixels;
// work outside that region must be skipped with byte-identical output.
import { expect, it } from "vitest";
import {
  blurShadowMask,
  shadowCompositePixel,
  shadowEffectKernel,
  shadowGaussianKernel,
} from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
import { samplePremultiplied } from "../../packages/renderer-core/src/composition/render/sampled-blur.ts";

type Params = {
  blur: number;
  offset: number[];
  color: number[];
  opacity: number;
};

function harness(width: number, height: number, data: Uint8ClampedArray) {
  let put: Uint8ClampedArray | undefined;
  const surface = (w: number, h: number, pixels?: Uint8ClampedArray) => ({
    width: w,
    height: h,
    canvas: {},
    ctx: {
      getImageData: () => ({ data: new Uint8ClampedArray(pixels!) }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        put = new Uint8ClampedArray(image.data);
      },
    },
  });
  const context = { createSurface: (w: number, h: number) => surface(w, h) };
  return {
    input: surface(width, height, data),
    context,
    output: () => put!,
  };
}

/** The original full-surface algorithm, composed from the exported steps. */
function reference(
  w: number,
  h: number,
  data: Uint8ClampedArray,
  params: Params,
) {
  const image = new Uint8ClampedArray(data);
  const premultiplied = new Uint8Array(image.length);
  for (let i = 0; i < image.length; i += 4) {
    const alpha = image[i + 3]!;
    for (let c = 0; c < 3; c++)
      premultiplied[i + c] = Math.round((image[i + c]! * alpha) / 255);
    premultiplied[i + 3] = alpha;
  }
  const offset = params.offset.map((v) => Math.round(v * 16) / 16);
  const mask = new Uint8Array(w * h),
    sample = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      samplePremultiplied(
        premultiplied,
        w,
        h,
        x + 0.5 - offset[0]!,
        y + 0.5 - offset[1]!,
        sample,
        {},
      );
      mask[y * w + x] = sample[3]!;
    }
  const k = shadowGaussianKernel(params.blur);
  const blurred = blurShadowMask(
    blurShadowMask(mask, w, h, k, [1, 0], 0),
    w,
    h,
    k,
    [0, 1],
    0,
  );
  for (let i = 0; i < premultiplied.length; i += 4) {
    const out = shadowCompositePixel(
      false,
      premultiplied.subarray(i, i + 4),
      blurred[i / 4]!,
      params as never,
    );
    for (let c = 0; c < 3; c++)
      image[i + c] = out[3] ? Math.round((out[c]! * 255) / out[3]) : 0;
    image[i + 3] = out[3]!;
  }
  return image;
}

/** Deterministic pseudo-random bytes. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sparseImage(
  w: number,
  h: number,
  next: () => number,
  boxes: [number, number, number, number][],
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [left, top, right, bottom] of boxes)
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const i = (y * w + x) * 4,
          // Opaque, translucent and edge alphas, as anti-aliased glyphs have.
          alpha = next() < 0.6 ? 255 : Math.floor(next() * 256);
        // Canvas image data is unpremultiplied with zero colour at alpha 0.
        for (let c = 0; c < 3; c++)
          data[i + c] = alpha ? Math.floor(next() * 256) : 0;
        data[i + 3] = alpha;
      }
  return data;
}

it("matches the full-surface drop shadow byte for byte", () => {
  const kernel = shadowEffectKernel("light.drop-shadow")!;
  const cases: {
    w: number;
    h: number;
    boxes: [number, number, number, number][];
    params: Params;
  }[] = [
    // Centred glyph, zero-offset halo.
    {
      w: 48,
      h: 40,
      boxes: [[18, 15, 29, 24]],
      params: {
        blur: 3,
        offset: [0, 0],
        color: [0.2, 0.05, 0.1, 1],
        opacity: 0.9,
      },
    },
    // Fractional and negative offsets.
    {
      w: 41,
      h: 37,
      boxes: [[10, 12, 20, 18]],
      params: {
        blur: 2.4,
        offset: [1.3, -2.7],
        color: [0, 0, 0, 0.6],
        opacity: 0.8,
      },
    },
    // Content touching every edge; the kernel overhangs the surface.
    {
      w: 30,
      h: 22,
      boxes: [
        [0, 0, 4, 3],
        [25, 18, 29, 21],
        [0, 19, 2, 21],
      ],
      params: {
        blur: 5,
        offset: [-3.2, 4.1],
        color: [1, 0.5, 0, 1],
        opacity: 1,
      },
    },
    // Two separated glyphs, no blur.
    {
      w: 36,
      h: 20,
      boxes: [
        [3, 3, 6, 8],
        [28, 10, 32, 15],
      ],
      params: {
        blur: 0,
        offset: [2, 1],
        color: [0.1, 0.1, 0.1, 1],
        opacity: 0.5,
      },
    },
    // Offset larger than the surface margin: the shadow leaves the surface.
    {
      w: 24,
      h: 24,
      boxes: [[8, 8, 12, 12]],
      params: { blur: 1.5, offset: [30, -30], color: [0, 0, 0, 1], opacity: 1 },
    },
    // Fully transparent input (the legibility background probe).
    {
      w: 32,
      h: 18,
      boxes: [],
      params: { blur: 4, offset: [0, 0], color: [0, 0, 0, 1], opacity: 1 },
    },
  ];
  cases.forEach((value, index) => {
    const data = sparseImage(value.w, value.h, random(index + 7), value.boxes);
    const { input, context, output } = harness(value.w, value.h, data);
    kernel.renderCanvas!(context as never, input as never, value.params);
    expect(Array.from(output()), `case ${index}`).toEqual(
      Array.from(reference(value.w, value.h, data, value.params)),
    );
  });
});

it("does drop-shadow work near the opaque pixels only", () => {
  // A 16 px glyph on a 2048² surface with a 48 px kernel radius. The
  // full-surface passes take seconds here; the bounded ones milliseconds,
  // plus two linear sweeps of the surface.
  const w = 2048,
    h = 2048;
  const data = sparseImage(w, h, random(3), [[1000, 1000, 1015, 1015]]);
  const kernel = shadowEffectKernel("light.drop-shadow")!;
  const { input, context, output } = harness(w, h, data);
  const params = {
    blur: 16,
    offset: [0, 6],
    color: [0.1, 0.04, 0.04, 1],
    opacity: 0.8,
  };
  const started = performance.now();
  kernel.renderCanvas!(context as never, input as never, params);
  const elapsed = performance.now() - started;
  expect(elapsed).toBeLessThan(1500);
  // The shadow still paints: below the glyph, inside the kernel radius.
  expect(output()[(1040 * w + 1008) * 4 + 3]).toBeGreaterThan(0);
  expect(output()[(1100 * w + 1008) * 4 + 3]).toBe(0);
});
