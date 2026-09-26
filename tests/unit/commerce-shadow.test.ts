import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { imageSize } from "image-size";
import { prepareCommerceShadow } from "../../packages/animation-engine/src/commerce-shadow.ts";
import {
  DEFAULT_SHADOW_TEXTURE,
  createShadowTexture,
} from "../../packages/renderer-core/src/shadow-texture.ts";
import { buildProductShadow } from "../../packages/renderer-core/src/product-shadow.ts";

describe("prepared static product shadow", () => {
  it("produces repeatable PNG bytes with transparent padded edges and a soft center", async () => {
    const first = await prepareCommerceShadow(DEFAULT_SHADOW_TEXTURE);
    const second = await prepareCommerceShadow(DEFAULT_SHADOW_TEXTURE);
    expect(first).toEqual(second);
    expect(imageSize(first.bytes)).toMatchObject({
      width: 256,
      height: 128,
      type: "png",
    });
    const view = new DataView(first.bytes.buffer);
    const length = view.getUint32(33);
    const scanlines = inflateSync(first.bytes.subarray(41, 41 + length));
    const alpha = (x: number, y: number) =>
      scanlines[y * (256 * 4 + 1) + 1 + x * 4 + 3]!;
    for (let x = 0; x < 256; x++) {
      expect(alpha(x, 0)).toBe(0);
      expect(alpha(x, 127)).toBe(0);
    }
    for (let y = 0; y < 128; y++) {
      expect(alpha(0, y)).toBe(0);
      expect(alpha(255, y)).toBe(0);
    }
    expect(alpha(128, 64)).toBeGreaterThan(alpha(190, 64));
    expect(alpha(190, 64)).toBeGreaterThan(0);
    const fragment = buildProductShadow({
      id: "shadow",
      texture: first.asset,
      center: [540, 900],
      width: 240,
      height: 60,
      opacity: 0.2,
    });
    expect(fragment.events).toEqual([]);
    expect(fragment.bounds).toEqual({
      x: 390,
      y: 862.5,
      width: 300,
      height: 75,
    });
    expect(fragment.nodes![0]!.opacity).toBe(0.2);
    const softer = await prepareCommerceShadow({
      ...DEFAULT_SHADOW_TEXTURE,
      softness: 1,
    });
    expect(softer.asset.sha256).not.toBe(first.asset.sha256);
  });
  it("rejects invalid texture geometry and softness", () => {
    for (const change of [
      { width: 0 },
      { width: 2048 },
      { softness: NaN },
      { softness: 0 },
      { color: "red" },
    ])
      expect(() =>
        createShadowTexture({ ...DEFAULT_SHADOW_TEXTURE, ...change }),
      ).toThrow();
  });
});
