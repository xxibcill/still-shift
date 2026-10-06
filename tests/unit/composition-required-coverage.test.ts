import { expect, it } from "vitest";
import { uncoveredViewportPixel } from "../../packages/renderer-core/src/composition/render/required-coverage.ts";
it("uses the shared camera-cover alpha threshold and catches interior holes", () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  pixels[(2 * 4 + 2) * 4 + 3] = 254;
  expect(uncoveredViewportPixel(pixels, 4, 4)).toBeNull();
  pixels[(2 * 4 + 2) * 4 + 3] = 253;
  expect(uncoveredViewportPixel(pixels, 4, 4)).toEqual([2, 2]);
  expect(() => uncoveredViewportPixel(pixels, 5, 4)).toThrow("owning scope");
});
