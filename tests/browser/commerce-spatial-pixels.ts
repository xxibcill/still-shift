import assert from "node:assert/strict";
import type { Page } from "playwright";
export async function verifyCommerceSpatialPixels(page: Page, root: string) {
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
    const rect = PreparedNodeSchema.parse({
      id: "content",
      type: "rect",
      x: 20,
      y: 20,
      width: 100,
      height: 70,
      opacity: 0.5,
      fill: "#FF0000",
    });
    const mask = PreparedNodeSchema.parse({
      id: "mask",
      type: "rect",
      x: 60,
      y: 0,
      width: 80,
      height: 120,
      opacity: 0.5,
      fill: "#00FF00",
    });
    const render = (extra: Record<string, unknown>, frame = 0) => {
      const scene = compilePreparedScene({
        ...original,
        width: 160,
        height: 120,
        frameCount: 40,
        background: "#000000",
        assets: [],
        nodes: [rect, mask],
        events: [],
        metadata: {
          ...original.metadata,
          registration: { status: "experimental" },
        },
        ...extra,
      });
      const canvas = document.createElement("canvas");
      const renderer = createIllustratedPreview(canvas, scene, new Map());
      renderer.renderFrame(frame);
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, 160, 120).data;
      renderer.dispose();
      return pixels;
    };
    const color = (pixels: Uint8ClampedArray, x: number, y: number) =>
      Array.from(pixels.slice((y * 160 + x) * 4, (y * 160 + x) * 4 + 3));
    const matte = render({
      mattes: [{ target: "content", mask: "mask", invert: false }],
    });
    const inverted = render({
      mattes: [{ target: "content", mask: "mask", invert: true }],
    });
    const moving = render(
      {
        mattes: [{ target: "content", mask: "mask", invert: false }],
        events: [
          {
            node: "mask",
            property: "x",
            start: 0,
            end: 20,
            from: 60,
            to: 0,
            easing: "linear",
          },
        ],
      },
      20,
    );
    const frames = [9, 10, 19, 20].map((frame) =>
      color(
        render(
          {
            nodes: [rect],
            visibility: [{ target: "content", start: 10, end: 20 }],
            effects: [{ type: "motion-blur", samples: 8, shutterAngle: 360 }],
          },
          frame,
        ),
        80,
        50,
      ),
    );
    const scopeOff = render(
      {
        nodes: [rect],
        effects: [
          {
            type: "grain",
            amount: 0.15,
            seed: 3,
            active: { start: 10, end: 20 },
          },
        ],
      },
      5,
    );
    const plain = render({ nodes: [rect] }, 5);
    const blurred = render({
      nodes: [rect, mask],
      mattes: [{ target: "content", mask: "mask", invert: false }],
      effects: [
        {
          type: "focus-blur",
          target: "content",
          start: 0,
          end: 30,
          radius: 10,
          endRadius: 10,
        },
      ],
    });
    return {
      matte: color(matte, 80, 50),
      outside: color(matte, 40, 50),
      maskHidden: color(matte, 130, 10),
      inverse: color(inverted, 40, 50),
      moving: color(moving, 40, 50),
      cutFrames: frames,
      scopeExact: scopeOff.every((v, i) => v === plain[i]),
      postEffectClip: color(blurred, 40, 50),
    };
  }, root);
  assert.ok(Math.abs(result.matte[0]! - 64) <= 1);
  assert.deepEqual(result.outside, [0, 0, 0]);
  assert.deepEqual(result.maskHidden, [0, 0, 0]);
  assert.ok(Math.abs(result.inverse[0]! - 128) <= 1);
  assert.ok(Math.abs(result.moving[0]! - 64) <= 1);
  assert.deepEqual(result.cutFrames, [
    [0, 0, 0],
    [128, 0, 0],
    [128, 0, 0],
    [0, 0, 0],
  ]);
  assert.equal(result.scopeExact, true);
  assert.deepEqual(result.postEffectClip, [0, 0, 0]);
  return result;
}
