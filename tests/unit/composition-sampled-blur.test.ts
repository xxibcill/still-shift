import { expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  samplePremultiplied,
  blurSampleTransforms,
} from "../../packages/renderer-core/src/composition/render/sampled-blur.ts";
it("samples premultiplied bytes with transparent padding and independent bilinear values", () => {
  const pixels = new Uint8Array([100, 50, 25, 128, 200, 100, 50, 255]);
  expect(samplePremultiplied(pixels, 2, 1, 0.5, 0.5)).toEqual([
    100, 50, 25, 128,
  ]);
  expect(samplePremultiplied(pixels, 2, 1, 1, 0.5)).toEqual([150, 75, 38, 192]);
  expect(samplePremultiplied(pixels, 2, 1, -0.5, 0.5)).toEqual([0, 0, 0, 0]);
});
it("defines bounded lens/radial/zoom controls and exact neutral transforms", () => {
  for (const effect of ["blur.radial", "blur.zoom", "blur.lens"]) {
    const definition = compositionEffectDefinition(effect)!;
    expect(definition.params.safeParse({ samples: 65 }).success).toBe(false);
    const params = Object.fromEntries(
      Object.entries(definition.properties).map(([name, p]) => [
        name,
        p.default,
      ]),
    );
    expect(
      blurSampleTransforms(
        effect,
        params as Record<string, number | readonly number[]>,
        64,
        48,
      ),
    ).toEqual([[256, 0, 0, 0, 256, 0]]);
  }
});
it("keeps lens taps bounded and quantized and radial/zoom samples ordered", () => {
  const lens = blurSampleTransforms(
    "blur.lens",
    { radius: 10, samples: 8 },
    64,
    48,
  );
  expect(lens).toHaveLength(8);
  for (const tap of lens) {
    expect(Number.isInteger(tap[2])).toBe(true);
    expect(Math.hypot(tap[2]! / 512, tap[5]! / 512)).toBeLessThanOrEqual(10.05);
  }
  const zoom = blurSampleTransforms(
    "blur.zoom",
    { amount: 0.5, samples: 8, center: [0.5, 0.5] },
    64,
    48,
  );
  expect(zoom[0]![0]).toBeLessThan(zoom.at(-1)![0]!);
});

it("expands lens bounds by its padded sample support and preserves zero radius", () => {
  const bounds = { left: 10, top: 20, right: 30, bottom: 40 };
  const expand = compositionEffectDefinition("blur.lens")!.expandBounds!;
  expect(expand(bounds, { radius: 0 })).toEqual(bounds);
  expect(expand(bounds, { radius: 5 })).toEqual({
    left: 4,
    top: 14,
    right: 36,
    bottom: 46,
  });
  expect(
    compositionEffectDefinition("blur.radial")!.expandBounds!(bounds, {}),
  ).toBeNull();
});
