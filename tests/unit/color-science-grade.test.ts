/**
 * CG2: float64 references for the grade.* operators in @still-shift/color-science.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCdl,
  applyGradePrimary,
  applyLinearMatrixEncoded,
  applyRgbMixer,
  chromaticAdaptationMatrix,
  colorSpace,
  GRADE_LIMIT,
  gradePow,
  gradePrimaryControls,
  hueRotationMatrix,
  limitGrade,
  NEUTRAL_GRADE_PRIMARY,
  planckianXy,
  rgbMixer,
  rgbToXyzMatrix,
  srgbDecodeMirrored,
  srgbEncodeMirrored,
  temperatureTintWhite,
  TINT_DUV_PER_UNIT,
  TINT_ZERO_OFFSET,
  transferFunction,
  WHITE_BALANCE_TARGET,
  whiteBalanceMatrix,
  type Rgb,
} from "@still-shift/color-science";

const vectors = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../benchmarks/fixtures/color/cg0/vectors/temperature.json",
    ),
    "utf8",
  ),
);
const SAMPLES: Rgb[] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.18, 0.18, 0.18],
  [0.8, 0.3, 0.1],
  [0.05, 0.6, 0.9],
  [-0.2, 1.7, 0.4],
  [12, -3, 0.001],
];
const close = (a: readonly number[], b: readonly number[], tol: number) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tol * Math.max(1, Math.abs(b[i]!)));
const luma = (v: Rgb) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const srgb = transferFunction("srgb");
const uv = ([x, y]: readonly number[]): [number, number] => {
  const d = -2 * x! + 12 * y! + 3;
  return [(4 * x!) / d, (6 * y!) / d];
};
const sub = (a: readonly number[], b: readonly number[]): [number, number] => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
];
const multiplyMat = (a: readonly number[], b: readonly number[]) =>
  [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) =>
      [0, 1, 2].reduce((sum, k) => sum + a[r * 3 + k]! * b[k * 3 + c]!, 0),
    ),
  );
/** Linear BT.709 RGB of a 40% grey lit by the white `xy` (Y = 0.4). */
const lit = ([x, y]: readonly number[]): Rgb => {
  const xyz = [x! / y!, 1, (1 - x! - y!) / y!];
  const toRgb = rgbToXyzMatrix("bt709", "inverse");
  return [0, 1, 2].map(
    (r) =>
      0.4 *
      (toRgb[r * 3]! * xyz[0]! +
        toRgb[r * 3 + 1]! * xyz[1]! +
        toRgb[r * 3 + 2]! * xyz[2]!),
  ) as unknown as Rgb;
};
/** `linear` through grade.white-balance (encoded sRGB in and out), as linear. */
const whiteBalanced = (linear: Rgb, t: number, tint: number) =>
  applyLinearMatrixEncoded(
    linear.map((v) => srgbEncodeMirrored(v)) as unknown as Rgb,
    whiteBalanceMatrix(t, tint)!,
  ).map((v) => srgbDecodeMirrored(v));

describe("grade.primary reference", () => {
  const neutral = gradePrimaryControls(NEUTRAL_GRADE_PRIMARY);
  it("neutral is an exact identity, in and out of range", () => {
    for (const v of SAMPLES) expect(applyGradePrimary(v, neutral)).toEqual(v);
  });
  it("lift raises black and keeps white; gamma bends midtones; gain scales; offset adds", () => {
    const at = (p: Partial<typeof NEUTRAL_GRADE_PRIMARY>, v: Rgb) =>
      applyGradePrimary(
        v,
        gradePrimaryControls({ ...NEUTRAL_GRADE_PRIMARY, ...p }),
      );
    expect(at({ lift: [0.1, 0.1, 0.1] }, [0, 0, 0])).toEqual([0.1, 0.1, 0.1]);
    expect(at({ lift: [0.1, 0.1, 0.1] }, [1, 1, 1])).toEqual([1, 1, 1]);
    expect(at({ gamma: [2, 2, 2] }, [0.25, 0.25, 0.25])[0]).toBeCloseTo(
      0.5,
      15,
    );
    expect(at({ gain: [2, 1, 1] }, [0.4, 0.4, 0.4])).toEqual([0.8, 0.4, 0.4]);
    expect(at({ offset: [0, 0, -0.1] }, [0.4, 0.4, 0.4])[2]).toBeCloseTo(
      0.3,
      15,
    );
    // Negative values pass gamma unchanged.
    expect(at({ gamma: [2, 2, 2] }, [-0.25, 0.25, 0.25])[0]).toBe(-0.25);
  });
  it("contrast pivots, saturation keeps Rec.709 luma, hue rotation keeps luma", () => {
    const at = (p: Partial<typeof NEUTRAL_GRADE_PRIMARY>, v: Rgb) =>
      applyGradePrimary(
        v,
        gradePrimaryControls({ ...NEUTRAL_GRADE_PRIMARY, ...p }),
      );
    expect(at({ contrast: 1.5, pivot: 0.4 }, [0.4, 0.4, 0.4])[0]).toBeCloseTo(
      0.4,
      15,
    );
    expect(at({ contrast: 1.5, pivot: 0.4 }, [0.6, 0.6, 0.6])[0]).toBeCloseTo(
      0.7,
      15,
    );
    for (const v of SAMPLES) {
      expect(luma(at({ saturation: 1.7 }, v))).toBeCloseTo(luma(v), 12);
      expect(luma(at({ hue: 77 }, v))).toBeCloseTo(luma(v), 12);
    }
    expect(at({ saturation: 0 }, [0.8, 0.3, 0.1])[0]).toBeCloseTo(
      luma([0.8, 0.3, 0.1]),
      15,
    );
    // Hue 360 is the identity rotation (within rounding), 120 moves red toward green.
    expect(
      close(at({ hue: 360 }, [0.8, 0.3, 0.1]), [0.8, 0.3, 0.1], 1e-12),
    ).toBe(true);
    const turned = at({ hue: 120 }, [0.8, 0.3, 0.1]);
    expect(turned[1]).toBeGreaterThan(turned[0]);
  });
  it("hue rotation matrices compose", () => {
    const a = hueRotationMatrix(40),
      b = hueRotationMatrix(80),
      c = hueRotationMatrix(120);
    const ab = [0, 1, 2].flatMap((r) =>
      [0, 1, 2].map(
        (k) =>
          a[r * 3]! * b[k]! +
          a[r * 3 + 1]! * b[3 + k]! +
          a[r * 3 + 2]! * b[6 + k]!,
      ),
    );
    expect(close(ab, c, 1e-12)).toBe(true);
  });
  it("color boost lifts low-saturation colors more than saturated ones", () => {
    const boost = gradePrimaryControls({
      ...NEUTRAL_GRADE_PRIMARY,
      colorBoost: 0.6,
    });
    const chroma = (v: Rgb) => Math.max(...v) - Math.min(...v);
    const soft: Rgb = [0.55, 0.5, 0.45],
      strong: Rgb = [0.9, 0.2, 0.1];
    const softGain = chroma(applyGradePrimary(soft, boost)) / chroma(soft);
    const strongGain =
      chroma(applyGradePrimary(strong, boost)) / chroma(strong);
    expect(softGain).toBeGreaterThan(strongGain);
    expect(strongGain).toBeGreaterThanOrEqual(1);
    expect(luma(applyGradePrimary(soft, boost))).toBeCloseTo(luma(soft), 12);
  });
  it("shadows act on dark pixels and highlights on bright ones", () => {
    const at = (p: Partial<typeof NEUTRAL_GRADE_PRIMARY>, v: Rgb) =>
      applyGradePrimary(
        v,
        gradePrimaryControls({ ...NEUTRAL_GRADE_PRIMARY, ...p }),
      );
    expect(at({ shadows: 0.5 }, [0.05, 0.05, 0.05])[0]).toBeGreaterThan(0.1);
    expect(at({ shadows: 0.5 }, [0.9, 0.9, 0.9])[0]).toBe(0.9);
    expect(at({ highlights: -0.5 }, [0.95, 0.95, 0.95])[0]).toBeLessThan(0.9);
    expect(at({ highlights: -0.5 }, [0.1, 0.1, 0.1])[0]).toBe(0.1);
  });
  it("a value pushed above 1 is recovered by the next correction", () => {
    const up = applyGradePrimary(
      [0.6, 0.7, 0.9],
      gradePrimaryControls({ ...NEUTRAL_GRADE_PRIMARY, gain: [2, 2, 2] }),
    );
    expect(Math.max(...up)).toBeGreaterThan(1);
    const back = applyGradePrimary(
      up,
      gradePrimaryControls({ ...NEUTRAL_GRADE_PRIMARY, gain: [0.5, 0.5, 0.5] }),
    );
    expect(back).toEqual([0.6, 0.7, 0.9]);
  });
});

describe("grade.white-balance reference", () => {
  it("Planckian locus matches Kang et al. (2002) vectors within 1e-12", () => {
    vectors.locus.cct.forEach((t: number, i: number) =>
      expect(close(planckianXy(t), vectors.locus.xy[i], 1e-12), String(t)).toBe(
        true,
      ),
    );
    expect(() => planckianXy(1000)).toThrow(/1667/);
  });
  it("Bradford adaptation from a locus white to D65 matches the vectors within 1e-12", () => {
    const npm = rgbToXyzMatrix("bt709");
    const toRgb = rgbToXyzMatrix("bt709", "inverse");
    for (const item of vectors.bradfordToD65) {
      const cat = chromaticAdaptationMatrix(
        planckianXy(item.cct),
        WHITE_BALANCE_TARGET,
        "bradford",
      );
      const m = multiplyMat(toRgb, multiplyMat(cat, npm));
      expect(close(m, item.linearBt709.flat(), 1e-12), String(item.cct)).toBe(
        true,
      );
    }
  });
  it("adapts to D65, BT.709's white", () => {
    expect(WHITE_BALANCE_TARGET).toEqual(colorSpace("bt709").white);
    expect(temperatureTintWhite(6500, 0)).toEqual([0.3127, 0.329]);
  });
  it("6500 K and tint 0 is an exact identity; other settings are not", () => {
    expect(whiteBalanceMatrix(6500, 0)).toBeNull();
    expect(whiteBalanceMatrix(6500, 10)).not.toBeNull();
  });
  it("the tint-0 line keeps D65's offset from the locus at every temperature", () => {
    // D65 is about +0.0032 Duv above the 6500 K locus point, almost all of it
    // along the normal (published: Duv ≈ 0.0032 at CCT ≈ 6504 K).
    expect(TINT_ZERO_OFFSET.normal).toBeCloseTo(0.00317, 5);
    expect(Math.abs(TINT_ZERO_OFFSET.tangent)).toBeLessThan(2e-5);
    // The offset of the computed 6500 K white is D65 to float precision.
    const at6500 = temperatureTintWhite(6500, 1e-12);
    expect(close(at6500, [0.3127, 0.329], 1e-12)).toBe(true);
    for (const t of [2000, 3200, 5000, 9000]) {
      const step = sub(uv(temperatureTintWhite(t, 0)), uv(planckianXy(t)));
      expect(Math.hypot(...step), String(t)).toBeCloseTo(
        Math.hypot(TINT_ZERO_OFFSET.normal, TINT_ZERO_OFFSET.tangent),
        12,
      );
      expect(step[1]).toBeGreaterThan(0); // above the locus: greener
    }
  });
  it("tint moves the white perpendicular to the locus by Duv = tint / 5000 in CIE 1960 uv", () => {
    for (const t of [2500, 5000, 9000]) {
      const step = sub(
        uv(temperatureTintWhite(t, 50)),
        uv(temperatureTintWhite(t, 0)),
      );
      expect(Math.hypot(...step)).toBeCloseTo(0.01, 12);
      expect(step[1]).toBeGreaterThan(0); // positive tint: greener illuminant
      const along = sub(uv(planckianXy(t + 1)), uv(planckianXy(t - 1)));
      expect(
        Math.abs(step[0] * along[0] + step[1] * along[1]) /
          Math.hypot(...along),
      ).toBeLessThan(1e-9);
    }
  });
  it("neutralizes the stated illuminant: a grey lit by it becomes R = G = B", () => {
    for (const [t, tint] of [
      [2000, 0],
      [3200, 0],
      [5000, 30],
      [9000, -40],
      [1667, -100],
      [25000, 100],
    ] as const) {
      const out = whiteBalanced(lit(temperatureTintWhite(t, tint)), t, tint);
      expect(Math.max(...out) - Math.min(...out), `${t} ${tint}`).toBeLessThan(
        1e-12,
      );
    }
  });
  it("a light on the black-body locus is neutralized by tint ≈ −16 at its temperature", () => {
    const tint = -TINT_ZERO_OFFSET.normal / TINT_DUV_PER_UNIT;
    expect(tint).toBeCloseTo(-15.87, 2);
    for (const t of [2000, 3200, 5000]) {
      const out = whiteBalanced(lit(planckianXy(t)), t, tint);
      // Only D65's small along-locus offset remains: well under 0.1 of an
      // 8-bit code at 40% linear grey.
      const encoded = out.map((v) => srgb.encode(v) * 255);
      expect(
        Math.max(...encoded) - Math.min(...encoded),
        String(t),
      ).toBeLessThan(0.1);
    }
  });
  it("warm illuminant settings cool a grey; cool settings warm it", () => {
    const grey: Rgb = [0.5, 0.5, 0.5];
    const warmScene = applyLinearMatrixEncoded(
      grey,
      whiteBalanceMatrix(3200, 0)!,
    );
    expect(warmScene[2]).toBeGreaterThan(warmScene[0]);
    const coolScene = applyLinearMatrixEncoded(
      grey,
      whiteBalanceMatrix(9000, 0)!,
    );
    expect(coolScene[0]).toBeGreaterThan(coolScene[2]);
  });
});

describe("grade.rgb-mixer reference", () => {
  it("equals color.matrix's design formula: (I + s(M − I))·rgb + s·offset", () => {
    const m = [1.31, -0.27, -0.08, -0.12, 1.24, -0.14, -0.15, -0.3, 1.52];
    const o = [-0.004, 0.003, 0.008] as const;
    const mixer = rgbMixer(m, o, 0.6);
    for (const v of SAMPLES) {
      const want = [0, 1, 2].map((r) => {
        const row = [0, 1, 2].map(
          (c) => (r === c ? 1 : 0) + 0.6 * (m[r * 3 + c]! - (r === c ? 1 : 0)),
        );
        return row[0]! * v[0] + row[1]! * v[1] + row[2]! * v[2] + 0.6 * o[r]!;
      });
      expect(close(applyRgbMixer(v, mixer), want, 1e-14)).toBe(true);
    }
  });
  it("identity and zero strength are exact identities", () => {
    const identity = rgbMixer([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 1);
    const off = rgbMixer([2, 1, 0, 0, 3, 0, 1, 0, 1], [0.1, 0.2, 0.3], 0);
    for (const v of SAMPLES) {
      expect(applyRgbMixer(v, identity)).toEqual(v);
      expect(applyRgbMixer(v, off)).toEqual(v);
    }
  });
});

describe("grade limit (PR #77 second review, Spec-1)", () => {
  const extremePrimary = gradePrimaryControls({
    ...NEUTRAL_GRADE_PRIMARY,
    // Contract maxima, master combined: lift 1 + 1, gamma 0.1 × 0.1, gain 16 × 16.
    lift: [2, 1, 1],
    gamma: [0.01, 0.1, 0.1],
    gain: [256, 16, 16],
    contrast: 4,
    saturation: 4,
    colorBoost: 1,
  });
  const extremeCdl = {
    slope: [8, 8, 8] as Rgb,
    offset: [1, 1, 1] as Rgb,
    power: [8, 8, 8] as Rgb,
    saturation: 4,
  };
  const finiteWithin = (v: readonly number[]) =>
    v.every((x) => Number.isFinite(x) && Math.abs(x) <= GRADE_LIMIT);

  it("gradePow passes negatives and p = 1 through and saturates before overflow", () => {
    expect(gradePow(-3, 8)).toBe(-3);
    expect(gradePow(12345, 1)).toBe(12345);
    expect(gradePow(0.25, 2)).toBe(0.0625);
    expect(gradePow(2, 100)).toBe(GRADE_LIMIT);
    expect(gradePow(1e300, 100)).toBe(GRADE_LIMIT);
    expect(gradePow(9999, 1.0000001)).toBeLessThan(GRADE_LIMIT);
  });
  it("values inside the limit are not clamped", () => {
    expect(limitGrade(9999.5)).toBe(9999.5);
    expect(limitGrade(-12)).toBe(-12);
    expect(limitGrade(1e12)).toBe(GRADE_LIMIT);
    expect(limitGrade(-Infinity)).toBe(-GRADE_LIMIT);
  });
  it("no operator chain at the contract bounds leaves ±GRADE_LIMIT or becomes NaN", () => {
    // The review's case: a black pixel through an extreme primary, then CDL.
    let v: Rgb = [0, 0, 0];
    v = applyGradePrimary(v, extremePrimary);
    expect(v[0]).toBe(GRADE_LIMIT);
    v = applyCdl(v, extremeCdl, "no-clamp");
    expect(finiteWithin(v)).toBe(true);
    // Stacked extremes, including a negative swing through lift.
    for (const start of [
      [0, 0, 0],
      [1, 1, 1],
      [0.5, 0.2, 0.9],
    ] as Rgb[]) {
      let x = start;
      for (let i = 0; i < 4; i++) {
        x = applyGradePrimary(x, extremePrimary);
        x = applyCdl(x, extremeCdl, "no-clamp");
        x = applyLinearMatrixEncoded(x, whiteBalanceMatrix(1667, -100)!);
        x = applyRgbMixer(x, rgbMixer([4, -4, 4, -4, 4, -4, 4, 4, 4], x, 1));
        expect(finiteWithin(x)).toBe(true);
      }
    }
  });
});
