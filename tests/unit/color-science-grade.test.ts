/**
 * CG2: float64 references for the grade.* operators in @still-shift/color-science.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyGradePrimary,
  applyLinearMatrixEncoded,
  applyRgbMixer,
  gradePrimaryControls,
  hueRotationMatrix,
  NEUTRAL_GRADE_PRIMARY,
  planckianXy,
  rgbMixer,
  rgbToXyzMatrix,
  temperatureTintWhite,
  transferFunction,
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
  it("tint 0 adaptation matches the Bradford vectors within 1e-12", () => {
    for (const item of vectors.bradfordToReference) {
      const m = whiteBalanceMatrix(item.cct, 0);
      if (item.cct === 6500) expect(m).toBeNull();
      else
        expect(
          close(m!, item.linearBt709.flat(), 1e-12),
          String(item.cct),
        ).toBe(true);
    }
  });
  it("6500 K and tint 0 is an exact identity; other settings are not", () => {
    expect(whiteBalanceMatrix(6500, 0)).toBeNull();
    expect(whiteBalanceMatrix(6500, 10)).not.toBeNull();
  });
  it("tint moves the white perpendicular to the locus by Duv = tint / 5000 in CIE 1960 uv", () => {
    const uv = ([x, y]: readonly number[]) => {
      const d = -2 * x! + 12 * y! + 3;
      return [(4 * x!) / d, (6 * y!) / d];
    };
    for (const t of [2500, 5000, 9000]) {
      const base = uv(planckianXy(t)),
        moved = uv(temperatureTintWhite(t, 50));
      const step = [moved[0]! - base[0]!, moved[1]! - base[1]!];
      expect(Math.hypot(step[0]!, step[1]!)).toBeCloseTo(0.01, 12);
      expect(step[1]).toBeGreaterThan(0); // positive tint: greener illuminant
      const along = [
        uv(planckianXy(t + 1))[0]! - uv(planckianXy(t - 1))[0]!,
        uv(planckianXy(t + 1))[1]! - uv(planckianXy(t - 1))[1]!,
      ];
      expect(
        Math.abs(step[0]! * along[0]! + step[1]! * along[1]!) /
          Math.hypot(along[0]!, along[1]!),
      ).toBeLessThan(1e-9);
    }
  });
  it("neutralizes the stated illuminant: its white becomes neutral", () => {
    const srgb = transferFunction("srgb");
    for (const [t, tint] of [
      [3200, 0],
      [5000, 30],
      [9000, -40],
    ] as const) {
      // The illuminant's white as encoded sRGB, scaled into range.
      const m = whiteBalanceMatrix(t, tint)!;
      const xy = temperatureTintWhite(t, tint);
      const xyz = [xy[0] / xy[1], 1, (1 - xy[0] - xy[1]) / xy[1]];
      const toRgb = rgbToXyzMatrix("bt709", "inverse");
      const lin = [0, 1, 2].map(
        (r) =>
          0.4 *
          (toRgb[r * 3]! * xyz[0]! +
            toRgb[r * 3 + 1]! * xyz[1]! +
            toRgb[r * 3 + 2]! * xyz[2]!),
      );
      const out = applyLinearMatrixEncoded(
        lin.map((v) => srgb.encode(v)) as unknown as Rgb,
        m,
      ).map((v) => srgb.decode(v));
      const ref = planckianXy(6500);
      const refXyz = [ref[0] / ref[1], 1, (1 - ref[0] - ref[1]) / ref[1]];
      const refRgb = [0, 1, 2].map(
        (r) =>
          toRgb[r * 3]! * refXyz[0]! +
          toRgb[r * 3 + 1]! * refXyz[1]! +
          toRgb[r * 3 + 2]! * refXyz[2]!,
      );
      // Output is proportional to the reference white's RGB.
      const ratio = out.map((v, i) => v / refRgb[i]!);
      expect(Math.max(...ratio) - Math.min(...ratio)).toBeLessThan(1e-12);
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
