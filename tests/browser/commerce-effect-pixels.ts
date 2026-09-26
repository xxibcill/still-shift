import assert from "node:assert/strict";
import type { Page } from "playwright";

/** Independent Canvas reference checks for the effects' compositing contract. */
export async function verifyCommerceEffectPixels(page: Page, root: string) {
  // tsx names nested functions with this helper when serializing the callback.
  await page.evaluate("globalThis.__name = value => value");
  const result = await page.evaluate(async (root) => {
    const { compilePreparedScene } = await import(
      "/@fs/" + root + "/packages/renderer-core/src/prepared-scene.ts"
    );
    const { createIllustratedPreview } = await import(
      "/@fs/" + root + "/packages/renderer-core/src/illustrated-renderer.ts"
    );
    const { PreparedNodeSchema } = await import(
      "/@fs/" + root + "/packages/scene-contract/src/prepared.ts"
    );
    const original = await (
      await fetch("/commerce/scenes/a01-beauty-feed.json")
    ).json();
    const width = 160,
      height = 120;
    const product = PreparedNodeSchema.parse({
      type: "rect",
      id: "subject",
      x: 10,
      y: 20,
      width: 60,
      height: 80,
      fill: "#FF2008",
      opacity: 0.35,
    });
    const foreground = PreparedNodeSchema.parse({
      type: "rect",
      id: "foreground",
      x: 60,
      y: 20,
      width: 25,
      height: 70,
      fill: "#76996B",
    });
    const makeCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
    const render = (effects: unknown[], moving = false, frame = 5) => {
      const canvas = makeCanvas();
      const scene = compilePreparedScene({
        ...original,
        width,
        height,
        background: "#314253",
        assets: [],
        nodes: [product, foreground],
        frameCount: 20,
        effects,
        metadata: {
          ...original.metadata,
          registration: { status: "experimental" },
        },
        events: moving
          ? [
              {
                node: "subject",
                property: "x",
                start: 0,
                end: 10,
                from: 10,
                to: 70,
                easing: "linear",
              },
            ]
          : [],
      });
      const preview = createIllustratedPreview(canvas, scene, new Map());
      preview.renderFrame(frame);
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, width, height).data;
      preview.dispose();
      return data;
    };
    const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let max = 0;
      for (let i = 0; i < a.length; i++)
        max = Math.max(max, Math.abs(a[i]! - b[i]!));
      return max;
    };
    const blur = { type: "motion-blur", shutterAngle: 360, samples: 8 };
    const still = render([]),
      blurredStill = render([blur]);
    const actual = render([blur], true);
    const reference = makeCanvas(),
      ctx = reference.getContext("2d")!;
    const sum = new Float64Array(width * height * 4);
    for (let i = 0; i < 8; i++) {
      const t = 5 + ((i + 0.5) / 8 - 0.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#314253";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#FF2008";
      ctx.fillRect(10 + 6 * t, 20, 60, 80);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#76996B";
      ctx.fillRect(60, 20, 25, 70);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      for (let p = 0; p < pixels.length; p++) sum[p] = sum[p]! + pixels[p]!;
    }
    const expected = new Uint8ClampedArray(sum.length);
    for (let i = 0; i < sum.length; i++) expected[i] = Math.round(sum[i]! / 8);
    const directional = render([
      {
        type: "directional-blur",
        target: "subject",
        length: 10,
        angle: 0,
        samples: 16,
      },
    ]);
    const interior = (40 * width + 30) * 4;
    const unlit = render(
      [
        {
          type: "light-sweep",
          target: "subject",
          start: 0,
          end: 19,
          cycles: 1,
          region: [0, 0, 1, 0.25],
          width: 0.5,
          strength: 0,
        },
      ],
      false,
      5,
    );
    const sweep = render(
      [
        {
          type: "light-sweep",
          target: "subject",
          start: 0,
          end: 19,
          cycles: 1,
          region: [0, 0, 1, 0.25],
          width: 0.5,
          strength: 1,
        },
      ],
      false,
      5,
    );
    let maskLeak = 0;
    for (let y = 45; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 4; c++) {
          const i = (y * width + x) * 4 + c;
          maskLeak = Math.max(maskLeak, Math.abs(sweep[i]! - unlit[i]!));
        }
    return {
      stationaryError: difference(still, blurredStill),
      exposureError: difference(actual, expected),
      directionalInteriorError: Math.max(
        ...Array.from({ length: 4 }, (_, c) =>
          Math.abs(still[interior + c]! - directional[interior + c]!),
        ),
      ),
      maskLeak,
      blurOutsideCurrentBounds: actual[(35 * width + 38) * 4] !== 49,
    };
  }, root);
  assert.equal(
    result.stationaryError,
    0,
    "stationary translucent color/opacity",
  );
  assert.ok(
    result.exposureError <= 1,
    "exposure must match independent full-frame reference: " +
      result.exposureError,
  );
  assert.ok(
    result.directionalInteriorError <= 1,
    "directional blur must preserve flat alpha/color",
  );
  assert.equal(
    result.maskLeak,
    0,
    "material highlight must not affect pixels outside its mask",
  );
  assert.equal(
    result.blurOutsideCurrentBounds,
    true,
    "blur must extend beyond the current object bounds",
  );
  console.log(
    "Pixel checks passed: stationary alpha/color, sampled exposure with foreground occlusion, directional alpha, highlight mask, blur bounds",
  );
  return result;
}
