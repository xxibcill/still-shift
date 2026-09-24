import { describe, expect, it } from "vitest";

import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";

const gradient = () => {
  const pixels = new Uint8Array(8 * 4 * 3);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const pixel = (y * 8 + x) * 3;
      pixels.set([x * 30, y * 60, (x + y) * 20], pixel);
    }
  }
  return pixels;
};

describe("preview/export parity samples", () => {
  it("accepts matching frames and small codec differences", () => {
    const preview = gradient();
    const encoded = preview.map((value) => Math.min(255, value + 2));
    expect(compareFrameSamples(preview, preview, 8, 4).warning).toBeNull();
    expect(compareFrameSamples(preview, encoded, 8, 4).warning).toBeNull();
  });

  it("reports color and camera-direction regressions", () => {
    const preview = gradient();
    const colorShift = preview.map((value) => 255 - value);
    expect(compareFrameSamples(preview, colorShift, 8, 4).warning?.code).toBe(
      "PREVIEW_EXPORT_VARIANCE",
    );
    const reversed = new Uint8Array(preview.length);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const source = (y * 8 + x) * 3;
        reversed.set(
          preview.subarray(source, source + 3),
          (y * 8 + (7 - x)) * 3,
        );
      }
    }
    expect(compareFrameSamples(preview, reversed, 8, 4).warning?.code).toBe(
      "PREVIEW_EXPORT_VARIANCE",
    );
  });

  it("rejects grids with mismatched dimensions", () => {
    expect(() =>
      compareFrameSamples(new Uint8Array(5), new Uint8Array(5), 8, 4),
    ).toThrow("matching RGB grids");
  });
});
