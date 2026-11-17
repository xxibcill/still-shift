import { describe, expect, it } from "vitest";
import {
  compositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  gradeBytes,
  gradeControls,
  linearToSrgb,
  srgbToLinear,
  vibranceSkinWeight,
  whiteBalanceGains,
  type GradeEffectId,
} from "../../packages/renderer-core/src/composition/render/grade-effects.ts";

const defaults = (id: string) =>
  Object.fromEntries(
    Object.entries(compositionEffectDefinition(id)!.properties).map(
      ([key, property]) => [key, property.default as number],
    ),
  );
const apply = (
  id: GradeEffectId,
  params: Record<string, number>,
  rgb: [number, number, number],
) => {
  const out = [0, 0, 0];
  gradeBytes(gradeControls(id, { ...defaults(id), ...params }), ...rgb, out, 0);
  return out;
};
/** A deterministic spread of colors, including neutrals and extremes. */
const samples = (() => {
  const list: [number, number, number][] = [];
  for (let r = 0; r < 256; r += 15)
    for (let g = 0; g < 256; g += 17)
      for (let b = 0; b < 256; b += 15) list.push([r, g, b]);
  for (let v = 0; v < 256; v++) list.push([v, v, v]);
  return list;
})();
const ids = ["color.matrix", "color.white-balance", "color.vibrance"] as const;

describe("CGA grade effects", () => {
  it.each(ids)("validates %s with defaults and animated controls", (id) => {
    const base: Composition = {
      schemaVersion: "composition-1",
      id: "grade",
      width: 32,
      height: 32,
      fps: 24,
      frameCount: 12,
      assets: [],
      layers: [{ id: "box", type: "solid", color: "#ffffff", size: [8, 8] }],
    };
    const definition = compositionEffectDefinition(id)!;
    const animatedKey = Object.keys(definition.properties)[0]!;
    expect(
      validateComposition({
        ...base,
        layers: [
          {
            ...base.layers[0]!,
            effects: [
              {
                id: "grade",
                effect: id,
                params: {
                  [animatedKey]: {
                    keys: [
                      { frame: 0, value: 0 },
                      { frame: 11, value: 0.5 },
                    ],
                  },
                },
              },
            ],
          },
        ],
      }).ok,
    ).toBe(true);
    expect(definition.params.safeParse({ unknown: 1 }).success).toBe(false);
  });

  it.each(ids)("%s neutral controls are an exact byte identity", (id) => {
    for (const rgb of samples) expect(apply(id, {}, rgb)).toEqual(rgb);
    if (id === "color.matrix")
      for (const rgb of samples)
        expect(
          apply(id, { rr: 1.4, gb: -0.3, bo: 0.2, strength: 0 }, rgb),
        ).toEqual(rgb);
  });

  it("color.matrix matches the float64 affine map within half a code value", () => {
    const m = {
      rr: 1.21,
      rg: -0.12,
      rb: -0.04,
      gr: -0.08,
      gg: 1.13,
      gb: -0.07,
      br: -0.05,
      bg: -0.15,
      bb: 1.31,
      ro: 0.004,
      go: -0.002,
      bo: 0.01,
    };
    for (const strength of [1, 0.5]) {
      for (const rgb of samples) {
        const out = apply("color.matrix", { ...m, strength }, rgb);
        const rows = [
          [m.rr, m.rg, m.rb, m.ro],
          [m.gr, m.gg, m.gb, m.go],
          [m.br, m.bg, m.bb, m.bo],
        ];
        rows.forEach((row, c) => {
          const effective = row.map((value, i) =>
            i === 3
              ? strength * value * 255
              : (i === c ? 1 : 0) + strength * (value - (i === c ? 1 : 0)),
          );
          const exact =
            effective[0]! * rgb[0] +
            effective[1]! * rgb[1] +
            effective[2]! * rgb[2] +
            effective[3]!;
          const expected = Math.min(255, Math.max(0, exact));
          // 1/4096 coefficient quantization: |error| ≤ 0.5 + 3·255/8192.
          expect(Math.abs(out[c]! - expected)).toBeLessThanOrEqual(0.6);
        });
      }
    }
  });

  it("color.white-balance gains keep neutral luminance and move the right channels", () => {
    for (const [temperature, tint] of [
      [40, 0],
      [-60, 25],
      [0, -80],
    ]) {
      const gains = whiteBalanceGains(temperature!, tint!);
      expect(
        gains[0] * 0.2126 + gains[1] * 0.7152 + gains[2] * 0.0722,
      ).toBeCloseTo(1, 12);
    }
    const warm = apply(
      "color.white-balance",
      { temperature: 50 },
      [128, 128, 128],
    );
    expect(warm[0]).toBeGreaterThan(128);
    expect(warm[2]).toBeLessThan(128);
    const cool = apply(
      "color.white-balance",
      { temperature: -50 },
      [128, 128, 128],
    );
    expect(cool[0]).toBeLessThan(128);
    expect(cool[2]).toBeGreaterThan(128);
    const magenta = apply("color.white-balance", { tint: 50 }, [128, 128, 128]);
    expect(magenta[1]).toBeLessThan(128);
    expect(magenta[0]).toBeGreaterThan(128);
    // Linear-light gains: a neutral at 0.5 encoded gets exactly gain·linear.
    const gains = whiteBalanceGains(30, -10);
    const out = apply(
      "color.white-balance",
      { temperature: 30, tint: -10 },
      [100, 100, 100],
    );
    out.forEach((value, c) =>
      expect(value).toBe(
        Math.round(
          linearToSrgb(Math.min(1, srgbToLinear(100 / 255) * gains[c]!)) * 255,
        ),
      ),
    );
  });

  it("color.vibrance boosts weak colors more than strong ones and protects skin", () => {
    const chroma = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb);
    const gain = (rgb: [number, number, number], params = {}) =>
      chroma(apply("color.vibrance", { vibrance: 60, ...params }, rgb)) /
      chroma(rgb);
    const weak = gain([110, 120, 140]); // bluish, low saturation
    const strong = gain([20, 60, 230]); // saturated blue
    expect(weak).toBeGreaterThan(1.4);
    expect(strong).toBeLessThan(1.15);
    // Skin hue (≈25°) at the same saturation as a non-skin hue.
    const skin: [number, number, number] = [200, 160, 140];
    const other: [number, number, number] = [140, 160, 200];
    expect(gain(skin)).toBeLessThan(gain(other) - 0.2);
    expect(gain(skin, { protectSkin: 0 })).toBeCloseTo(gain(other), 1);
    expect(vibranceSkinWeight(25)).toBe(1);
    expect(vibranceSkinWeight(0)).toBe(0);
    expect(vibranceSkinWeight(55)).toBe(0);
    // Uniform saturation keeps byte luma within rounding and scales chroma.
    for (const rgb of samples) {
      const out = apply("color.vibrance", { saturation: 40 }, rgb);
      const luma = (v: number[]) =>
        (54 * v[0]! + 183 * v[1]! + 19 * v[2]!) / 256;
      if (out.every((v, c) => v > 0 && v < 255 && v !== rgb[c]))
        expect(Math.abs(luma(out) - luma(rgb))).toBeLessThanOrEqual(1);
    }
    expect(
      apply("color.vibrance", { saturation: -100 }, [200, 100, 50]),
    ).toEqual(
      Array(3).fill(Math.floor((54 * 200 + 183 * 100 + 19 * 50) / 256 + 0.5)),
    );
  });

  it("color.vibrance matches its float64 design formula within one code value", () => {
    const params = { vibrance: 45, saturation: 12, protectSkin: 0.7 };
    for (const rgb of samples) {
      const out = apply("color.vibrance", params, rgb);
      const [r, g, b] = rgb;
      const max = Math.max(r, g, b),
        c = max - Math.min(r, g, b);
      const sat = max ? c / max : 0;
      const hue = c > 0 && r >= g && g >= b ? (60 * (g - b)) / c : -1;
      const skin = hue < 0 ? 0 : vibranceSkinWeight(hue);
      const factor =
        (1 + params.saturation / 100) *
        (1 +
          (params.vibrance / 100) *
            (1 - sat) *
            (1 - params.protectSkin * skin));
      const luma = (54 * r + 183 * g + 19 * b) / 256;
      rgb.forEach((value, i) => {
        const expected = Math.min(
          255,
          Math.max(0, luma + (value - luma) * factor),
        );
        expect(Math.abs(out[i]! - expected)).toBeLessThanOrEqual(1);
      });
    }
  });
});
