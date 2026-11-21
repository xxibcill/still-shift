/**
 * CG6: the float64 key reference in @still-shift/color-science — qualifiers
 * against analytic masks on the CG0 hue and saturation sweeps, the sampled
 * 3D key against published OKLab values, matte finesse, windows, mixing and
 * the matte-stability metric.
 */
import { describe, expect, it } from "vitest";
import {
  combineKey,
  encodedToOklab,
  gradientWindow,
  hslQualifier,
  keyView,
  lumaQualifier,
  matteFlicker,
  matteRange,
  mixKeyed,
  NEUTRAL_KEY_QUALIFIER,
  NEUTRAL_MATTE_FINESSE,
  qualify,
  refineMatte,
  rgbQualifier,
  sampledQualifier,
  type HslRanges,
  type Rgb,
} from "../../packages/color-science/src/index.ts";

// The CG0 fixture generator's HSV → encoded bytes (scripts/color/cg0-fixtures.ts).
function hsv(h: number, s: number, v: number): Rgb {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
const encoded = (rgb: Rgb): Rgb => rgb.map((v) => byte(v) / 255) as Rgb;

// Analytic masks from the design values, written from the definition (not
// from the port): hue distance on the circle, HSL saturation in closed form
// from HSV, BT.709 luma, outward Hermite softness.
const hermite = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
function analyticRange(x: number, lo: number, hi: number, soft: number) {
  if (soft <= 0) return x >= lo && x <= hi ? 1 : 0;
  return Math.min(
    hermite((x - (lo - soft)) / soft),
    1 - hermite((x - hi) / soft),
  );
}
function analyticHue(
  h: number | null,
  center: number,
  width: number,
  soft: number,
) {
  if (width >= 360) return 1;
  if (h === null) return 0;
  const d = Math.min(
    Math.abs(h - center) % 360,
    360 - (Math.abs(h - center) % 360),
  );
  if (soft <= 0) return d <= width / 2 ? 1 : 0;
  return 1 - hermite((d - width / 2) / soft);
}
function analyticHsl(h: number, s: number, v: number, q: HslRanges) {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  const [r, g, b] = hsv(h, s, v);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (
    analyticHue(s === 0 ? null : h, q.hueCenter, q.hueWidth, q.hueSoftness) *
    analyticRange(sl, q.saturationMin, q.saturationMax, q.saturationSoftness) *
    analyticRange(y, q.luminanceMin, q.luminanceMax, q.luminanceSoftness)
  );
}
const ranges = (over: Partial<HslRanges>): HslRanges => ({
  ...NEUTRAL_KEY_QUALIFIER,
  ...over,
});

describe("CG6 qualifiers", () => {
  it("HSL keys on the hue sweep match analytic masks", () => {
    const cases = [
      ranges({ hueCenter: 30, hueWidth: 40, hueSoftness: 20 }),
      ranges({ hueCenter: 350, hueWidth: 30, hueSoftness: 15 }), // wraps 0°
      ranges({ hueCenter: 200, hueWidth: 60, hueSoftness: 0 }),
      ranges({
        hueCenter: 120,
        hueWidth: 90,
        hueSoftness: 30,
        saturationMin: 0.7,
        saturationSoftness: 0.1,
      }),
      ranges({
        hueCenter: 0,
        hueWidth: 360,
        luminanceMin: 0.5,
        luminanceMax: 0.8,
        luminanceSoftness: 0.05,
      }),
    ];
    for (const q of cases)
      for (const [s, v] of [
        [1, 1],
        [0.5, 0.8],
      ] as const) {
        let max = 0;
        for (let x = 0; x < 360; x++) {
          const want = analyticHsl(x, s, v, q);
          // The port on the exact (unrounded) sweep color is the analytic mask.
          expect(Math.abs(hslQualifier(hsv(x, s, v), q) - want)).toBeLessThan(
            1e-12,
          );
          const got = hslQualifier(encoded(hsv(x, s, v)), q);
          // A hard edge may flip only the column next to the boundary,
          // where 8-bit rounding moves the hue by under one degree.
          if (q.hueSoftness === 0) {
            const d = Math.min(
              Math.abs(x - q.hueCenter),
              360 - Math.abs(x - q.hueCenter),
            );
            if (Math.abs(d - q.hueWidth / 2) <= 1) continue;
          }
          max = Math.max(max, Math.abs(got - want));
        }
        // On the 8-bit fixture bytes: hue error ≤ 0.24°, luma ≤ 0.002, times
        // the softness slope (≤ 1.5/softness): ≤ 0.06 for softness 0.05.
        expect(max, JSON.stringify({ q, s, v })).toBeLessThan(0.07);
      }
  });

  it("HSL keys on the saturation sweep match analytic masks", () => {
    const hues = [0, 60, 120, 180, 240, 300];
    const cases = [
      ranges({
        saturationMin: 0.3,
        saturationMax: 0.6,
        saturationSoftness: 0.1,
      }),
      ranges({
        hueCenter: 0,
        hueWidth: 60,
        hueSoftness: 20,
        saturationMin: 0.2,
        saturationSoftness: 0.1,
      }),
      ranges({ hueCenter: 180, hueWidth: 20, hueSoftness: 10 }),
    ];
    for (const q of cases)
      for (const h of hues) {
        let max = 0;
        for (let x = 0; x < 256; x++) {
          const s = x / 255;
          const want = analyticHsl(h, s, 0.8, q);
          expect(Math.abs(hslQualifier(hsv(h, s, 0.8), q) - want)).toBeLessThan(
            1e-12,
          );
          const got = hslQualifier(encoded(hsv(h, s, 0.8)), q);
          max = Math.max(max, Math.abs(got - want));
        }
        expect(max, JSON.stringify({ q, h })).toBeLessThan(0.07);
      }
  });

  it("a neutral pixel has no hue: a hue range selects it only at full width", () => {
    // chroma-node read neutral pixels as hue 0° (red), so every gray entered a
    // red key unless saturation excluded it; the port does not.
    const red = ranges({ hueCenter: 0, hueWidth: 40 });
    expect(hslQualifier([0.5, 0.5, 0.5], red)).toBe(0);
    expect(hslQualifier([0.5, 0.5, 0.5], ranges({ hueWidth: 360 }))).toBe(1);
    expect(hslQualifier([0.9, 0.1, 0.1], red)).toBe(1);
  });

  it("the default ranges select everything (exact 1)", () => {
    for (const v of [
      [0, 0, 0],
      [1, 1, 1],
      [0.3, 0.7, 0.1],
    ] as Rgb[])
      expect(hslQualifier(v, NEUTRAL_KEY_QUALIFIER)).toBe(1);
  });

  it("RGB and luma qualifiers are ranges with outward softness", () => {
    const q = {
      ...NEUTRAL_KEY_QUALIFIER,
      redMin: 0.5,
      redMax: 1,
      greenMax: 0.4,
      rgbSoftness: 0.1,
    };
    expect(rgbQualifier([0.7, 0.2, 0.9], q)).toBe(1);
    expect(rgbQualifier([0.45, 0.2, 0.9], q)).toBeCloseTo(hermite(0.5), 12);
    expect(rgbQualifier([0.3, 0.2, 0.9], q)).toBe(0);
    const l = {
      ...NEUTRAL_KEY_QUALIFIER,
      luminanceMin: 0.4,
      luminanceMax: 0.6,
    };
    expect(lumaQualifier([0.5, 0.5, 0.5], l)).toBe(1);
    expect(lumaQualifier([0.9, 0.9, 0.9], l)).toBe(0);
  });

  it("the sampled 3D key measures OKLab distance (published values)", () => {
    // Ottosson (2020) reference: sRGB red → OKLab (0.627955, 0.224863, 0.125846).
    const red = encodedToOklab([1, 0, 0]);
    expect(red[0]).toBeCloseTo(0.627955, 5);
    expect(red[1]).toBeCloseTo(0.224863, 5);
    expect(red[2]).toBeCloseTo(0.125846, 5);
    const white = encodedToOklab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(1, 6);
    expect(Math.abs(white[1]) + Math.abs(white[2])).toBeLessThan(1e-6);
    const sample: Rgb = [0.86, 0.33, 0.12];
    const range = {
      samplesOklab: [encodedToOklab(sample)],
      sampleRadius: 0.05,
      sampleSoftness: 0.05,
    };
    expect(sampledQualifier(sample, range)).toBe(1);
    expect(sampledQualifier([0.2, 0.5, 0.8], range)).toBe(0);
    // Halfway through the softness band.
    const lab = encodedToOklab(sample);
    const probe: Rgb = [0.86, 0.33, 0.2];
    const d = Math.hypot(...encodedToOklab(probe).map((v, i) => v - lab[i]!));
    expect(sampledQualifier(probe, range)).toBeCloseTo(
      d <= 0.05 ? 1 : 1 - hermite((d - 0.05) / 0.05),
      12,
    );
  });

  it("qualify clamps its input to 0–1 and dispatches by mode", () => {
    const q = { ...NEUTRAL_KEY_QUALIFIER, qualifier: 3, luminanceMin: 0.9 };
    expect(qualify([2, 2, 2], q)).toBe(1);
    expect(
      qualify([-1, -1, -1], { ...q, luminanceMin: 0, luminanceMax: 0 }),
    ).toBe(1);
    expect(
      qualify([0.3, 0.3, 0.3], { ...NEUTRAL_KEY_QUALIFIER, qualifier: 0 }),
    ).toBe(1);
  });
});

describe("CG6 matte finesse", () => {
  const W = 9,
    H = 9;
  const image = (f: (x: number, y: number) => number) =>
    Float64Array.from({ length: W * H }, (_, i) => f(i % W, Math.floor(i / W)));
  const at = (m: Float64Array, x: number, y: number) => m[y * W + x]!;

  it("neutral finesse returns the matte unchanged", () => {
    const m = image((x, y) => ((x * 7 + y * 3) % 10) / 9);
    expect([...refineMatte(m, W, H, NEUTRAL_MATTE_FINESSE)]).toEqual([...m]);
  });

  it("clips black and white as levels", () => {
    const m = image((x) => x / 8);
    const out = refineMatte(m, W, H, {
      ...NEUTRAL_MATTE_FINESSE,
      clipBlack: 0.25,
      clipWhite: 0.75,
    });
    expect(at(out, 0, 0)).toBe(0);
    expect(at(out, 4, 0)).toBeCloseTo(0.5, 12);
    expect(at(out, 8, 0)).toBe(1);
  });

  it("denoise removes isolated specks (3×3 median)", () => {
    const m = image((x, y) => (x === 4 && y === 4 ? 1 : 0));
    const out = refineMatte(m, W, H, { ...NEUTRAL_MATTE_FINESSE, denoise: 1 });
    expect(Math.max(...out)).toBe(0);
  });

  it("clean black removes white specks, clean white fills black holes", () => {
    const specks = image((x, y) => (x === 2 && y === 2 ? 1 : x >= 5 ? 1 : 0));
    const open = refineMatte(specks, W, H, {
      ...NEUTRAL_MATTE_FINESSE,
      cleanBlack: 1,
    });
    expect(at(open, 2, 2)).toBe(0);
    expect(at(open, 7, 4)).toBe(1); // the large region survives
    const holes = image((x, y) => (x === 6 && y === 4 ? 0 : x >= 4 ? 1 : 0));
    const close = refineMatte(holes, W, H, {
      ...NEUTRAL_MATTE_FINESSE,
      cleanWhite: 1,
    });
    expect(at(close, 6, 4)).toBe(1);
    expect(at(close, 1, 4)).toBe(0);
  });

  it("shrinks and grows by a square of the given radius", () => {
    const m = image((x, y) =>
      Math.abs(x - 4) <= 2 && Math.abs(y - 4) <= 2 ? 1 : 0,
    );
    const grown = refineMatte(m, W, H, {
      ...NEUTRAL_MATTE_FINESSE,
      shrinkGrow: 1,
    });
    const shrunk = refineMatte(m, W, H, {
      ...NEUTRAL_MATTE_FINESSE,
      shrinkGrow: -1,
    });
    expect([...grown].reduce((a, b) => a + b)).toBe(49);
    expect([...shrunk].reduce((a, b) => a + b)).toBe(9);
  });

  it("blurs with the given kernel; the in/out ratio keeps softness inside or outside", () => {
    const kernel = { weights: [1, 2, 1], divisor: 4 };
    const m = image((x) => (x >= 4 ? 1 : 0));
    const both = refineMatte(
      m,
      W,
      H,
      { ...NEUTRAL_MATTE_FINESSE, blur: 1 },
      kernel,
    );
    expect(at(both, 3, 4)).toBeCloseTo(0.25, 12);
    expect(at(both, 4, 4)).toBeCloseTo(0.75, 12);
    const inside = refineMatte(
      m,
      W,
      H,
      { ...NEUTRAL_MATTE_FINESSE, blur: 1, inOutRatio: -1 },
      kernel,
    );
    expect(at(inside, 3, 4)).toBe(0);
    expect(at(inside, 4, 4)).toBeCloseTo(0.75, 12);
    const outside = refineMatte(
      m,
      W,
      H,
      { ...NEUTRAL_MATTE_FINESSE, blur: 1, inOutRatio: 1 },
      kernel,
    );
    expect(at(outside, 3, 4)).toBeCloseTo(0.25, 12);
    expect(at(outside, 4, 4)).toBe(1);
    expect(() =>
      refineMatte(m, W, H, { ...NEUTRAL_MATTE_FINESSE, blur: 1 }),
    ).toThrow(/kernel/);
  });

  it("inverts after finesse", () => {
    const m = image((x) => x / 8);
    const out = refineMatte(m, W, H, { ...NEUTRAL_MATTE_FINESSE, invert: 1 });
    expect(at(out, 2, 0)).toBeCloseTo(1 - 2 / 8, 15);
  });
});

describe("CG6 windows, mattes, mixing and views", () => {
  it("the linear gradient runs 0 at start to 1 at end", () => {
    expect(gradientWindow(0, 0, [0, 0], [0, 100])).toBe(0);
    expect(gradientWindow(37, 50, [0, 0], [0, 100])).toBe(0.5);
    expect(gradientWindow(0, 150, [0, 0], [0, 100])).toBe(1);
    expect(gradientWindow(0, -5, [0, 0], [0, 100])).toBe(0);
  });

  it("an external matte is remapped by levels (reversed when low > high) and inverts", () => {
    expect(matteRange(0.5, 0, 1, 0)).toBe(0.5);
    expect(matteRange(0.5, 0.2, 0.4, 0)).toBe(1);
    expect(matteRange(0.3, 0.2, 0.4, 0)).toBeCloseTo(0.5, 15);
    expect(matteRange(0.1, 0.2, 0.4, 1)).toBe(1);
    expect(matteRange(0.1, 0.4, 0.2, 0)).toBe(1);
    expect(matteRange(0.5, 0.4, 0.2, 0)).toBe(0);
  });

  it("combines the key and mixes exactly at 0 and 1", () => {
    expect(combineKey(0.5, 1, 1, 1, 1, 0)).toBe(0.5);
    expect(combineKey(0.5, 0.5, 1, 1, 2, 0.1)).toBeCloseTo(0.6, 15);
    expect(combineKey(1, 1, 1, 1, 1, 0.5)).toBe(1);
    const a: Rgb = [0.1, 0.2, 0.3],
      b: Rgb = [0.7, 0.1 + 1e-17, 0.9];
    expect(mixKeyed(a, b, 0)).toBe(a);
    expect(mixKeyed(a, b, 1)).toBe(b);
    expect(mixKeyed(a, b, 0.5)[0]).toBeCloseTo(0.4, 15);
  });

  it("views: gray key, highlight over mid gray, high contrast", () => {
    expect(keyView(1, 0.25, [1, 0, 0])).toEqual([0.25, 0.25, 0.25]);
    expect(keyView(2, 1, [1, 0, 0])).toEqual([1, 0, 0]);
    expect(keyView(2, 0, [1, 0, 0])).toEqual([0.5, 0.5, 0.5]);
    expect(keyView(3, 1e-9, [1, 0, 0])).toEqual([1, 1, 1]);
    expect(keyView(3, 0, [1, 0, 0])).toEqual([0, 0, 0]);
  });

  it("the matte-stability metric measures frame-to-frame change", () => {
    const a = Uint8Array.from([0, 255, 128, 0]),
      b = Uint8Array.from([0, 0, 128, 51]);
    const all = matteFlicker(a, b);
    expect(all.meanChange).toBeCloseTo((1 + 0.2) / 4, 12);
    expect(all.changedFraction).toBe(0.5);
    expect(all.maxChange).toBe(1);
    const some = matteFlicker(a, b, (i) => i !== 1);
    expect(some.meanChange).toBeCloseTo(0.2 / 3, 12);
  });
});
