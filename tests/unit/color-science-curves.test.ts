/**
 * CG4: monotone curve splines, baked curve tables and the grade.curves,
 * grade.hue-curves and grade.tonal float64 references.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import {
  applyGradeCurves,
  applyGradeHueCurves,
  applyGradeTonal,
  bakeCurve,
  chroma709,
  CURVE_TABLE_SIZE,
  encodedLuma,
  forEachPixel,
  gradeCurvesControls,
  gradeHueCurvesControls,
  NEUTRAL_GRADE_TONAL,
  pchip,
  sampleCurveTable,
  vectorscopeAngle,
  type Rgb,
} from "@still-shift/color-science";

const root = join(import.meta.dirname, "../../benchmarks/fixtures/color/cg0");
const spline = JSON.parse(
  readFileSync(join(root, "vectors/spline.json"), "utf8"),
) as {
  cases: {
    id: string;
    periodic: boolean;
    points: [number, number][];
    x: number[];
    y: number[];
  }[];
};
const still = (id: string) =>
  decodeCompositionRgbaPng(readFileSync(join(root, `stills/${id}.png`)));
const IDENTITY: [number, number][] = [
  [0, 0],
  [1, 1],
];
const FLAT: [number, number][] = [
  [0, 0.5],
  [1, 0.5],
];

describe("PCHIP splines (CG0 spline.json)", () => {
  for (const c of spline.cases)
    it(`${c.id}: within 1e-12 of scipy`, () => {
      const f = pchip(c.points, { periodic: c.periodic });
      const worst = Math.max(...c.x.map((x, i) => Math.abs(f(x) - c.y[i]!)));
      expect(worst).toBeLessThanOrEqual(1e-12);
    });
  it("never overshoots the control hull for monotone inputs (500 seeded curves)", () => {
    let seed = 20261121;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const numeric = (a: number, b: number) => a - b;
    const violations: string[] = [];
    for (let n = 0; n < 500; n++) {
      const count = 2 + Math.floor(random() * 15);
      const xs = [
        0,
        ...Array.from({ length: count - 2 }, random).sort(numeric),
        1,
      ];
      const ys = Array.from({ length: count }, random).sort(numeric);
      const points = xs.map((x, i) => [x, ys[i]!] as [number, number]);
      const f = pchip(points);
      let previous = -Infinity;
      for (let k = 0; k <= 2000; k++) {
        const x = k / 2000,
          y = f(x);
        // The segment containing x (x = 1 belongs to the last one).
        const next = xs.findIndex((v) => v > x);
        const segment = next < 0 ? count - 2 : Math.max(0, next - 1);
        const a = ys[segment]!,
          b = ys[Math.min(count - 1, segment + 1)]!;
        if (
          y < Math.min(a, b) - 1e-12 ||
          y > Math.max(a, b) + 1e-12 ||
          y < previous - 1e-12
        )
          violations.push(
            `curve ${n} at x=${x}: ${y} outside [${a}, ${b}] or below ${previous}`,
          );
        previous = y;
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
  });
  it("periodic curves are continuous across the 0/1 wrap", () => {
    const f = pchip(
      [
        [0, 0.65],
        [0.08, 0.6],
        [0.5, 0.5],
        [0.92, 0.6],
        [1, 0.65],
      ],
      { periodic: true },
    );
    expect(Math.abs(f(1 - 1e-9) - f(0))).toBeLessThan(1e-8);
    expect(Math.abs(f(1e-9) - f(0))).toBeLessThan(1e-8);
    expect(f(1.25)).toBeCloseTo(f(0.25), 12);
    expect(f(-0.25)).toBeCloseTo(f(0.75), 12);
  });
});

describe("baked curve tables", () => {
  // Bound set from the measurement (1.01e-6 worst: float32 entries and linear
  // interpolation on a curved segment), 1/400 of an 8-bit code value.
  it("track the spline within 1e-5 and extrapolate linearly outside 0–1", () => {
    const points: [number, number][] = [
      [0, 0.05],
      [0.3, 0.2],
      [0.7, 0.85],
      [1, 0.95],
    ];
    const f = pchip(points);
    const table = bakeCurve(points);
    expect(table.length).toBe(CURVE_TABLE_SIZE);
    for (let k = 0; k <= 1000; k++)
      expect(
        Math.abs(sampleCurveTable(table, k / 1000) - f(k / 1000)),
      ).toBeLessThan(1e-5);
    const lowSlope = (table[1]! - table[0]!) * (CURVE_TABLE_SIZE - 1);
    expect(sampleCurveTable(table, -0.2)).toBeCloseTo(
      table[0]! - 0.2 * lowSlope,
      9,
    );
    const highSlope =
      (table[CURVE_TABLE_SIZE - 1]! - table[CURVE_TABLE_SIZE - 2]!) *
      (CURVE_TABLE_SIZE - 1);
    expect(sampleCurveTable(table, 1.5)).toBeCloseTo(
      table[CURVE_TABLE_SIZE - 1]! + 0.5 * highSlope,
      9,
    );
  });
  it("periodic tables wrap", () => {
    const table = bakeCurve(
      [
        [0, 0.5],
        [0.1, 0.7],
        [0.25, 0.5],
        [1, 0.5],
      ],
      { periodic: true },
    );
    expect(sampleCurveTable(table, 1.1, true)).toBeCloseTo(
      sampleCurveTable(table, 0.1, true),
      9,
    );
    expect(
      Math.abs(
        sampleCurveTable(table, 0.99999, true) -
          sampleCurveTable(table, 0, true),
      ),
    ).toBeLessThan(1e-4);
  });
});

describe("grade.curves reference", () => {
  const samples: Rgb[] = [
    [0, 0, 0],
    [1, 1, 1],
    [0.2, 0.5, 0.9],
    [-0.2, 1.4, 0.3],
  ];
  it("identity curves are an exact identity", () => {
    const k = gradeCurvesControls({
      master: IDENTITY,
      red: IDENTITY,
      green: IDENTITY,
      blue: IDENTITY,
      lumaMix: 0,
    });
    expect(k).toBeNull();
  });
  it("a red curve changes only red; the master curve applies to every channel", () => {
    const red = gradeCurvesControls({
      master: IDENTITY,
      red: [
        [0, 0],
        [0.5, 0.7],
        [1, 1],
      ],
      green: IDENTITY,
      blue: IDENTITY,
      lumaMix: 0,
    })!;
    for (const v of samples.slice(0, 3)) {
      const out = applyGradeCurves(v, red);
      expect(out[1]).toBe(v[1]);
      expect(out[2]).toBe(v[2]);
    }
    const master = gradeCurvesControls({
      master: [
        [0, 0],
        [0.5, 0.7],
        [1, 1],
      ],
      red: IDENTITY,
      green: IDENTITY,
      blue: IDENTITY,
      lumaMix: 0,
    })!;
    const out = applyGradeCurves([0.5, 0.5, 0.5], master);
    expect(out[0]).toBeCloseTo(0.7, 5);
    expect(out[1]).toBe(out[0]);
  });
  it("luma mix 1 applies the master curve to luma and keeps channel differences", () => {
    const k = gradeCurvesControls({
      master: [
        [0, 0],
        [0.5, 0.75],
        [1, 1],
      ],
      red: IDENTITY,
      green: IDENTITY,
      blue: IDENTITY,
      lumaMix: 1,
    })!;
    const v: Rgb = [0.6, 0.4, 0.3];
    const out = applyGradeCurves(v, k);
    expect(out[0] - out[1]).toBeCloseTo(v[0] - v[1], 12);
    expect(out[1] - out[2]).toBeCloseTo(v[1] - v[2], 12);
  });
});

describe("grade.hue-curves reference: each curve changes only its own dimension (CG3 measures)", () => {
  const flat = {
    hueVsHue: FLAT,
    hueVsSat: FLAT,
    hueVsLum: FLAT,
    lumVsSat: FLAT,
    satVsSat: FLAT,
    satVsLum: FLAT,
  };
  const radius = (v: Rgb) => {
    const b = v.map((c) => c * 255) as unknown as [number, number, number];
    const [cb, cr] = chroma709(b[0], b[1], b[2]);
    return Math.hypot(cb, cr);
  };
  const dims = (v: Rgb) => {
    const b = v.map((c) => c * 255) as unknown as [number, number, number];
    return {
      angle: vectorscopeAngle(b[0], b[1], b[2]),
      radius: radius(v),
      luma: encodedLuma(b[0], b[1], b[2]),
    };
  };
  const pixels = (id: string) => {
    const out: Rgb[] = [];
    forEachPixel(still(id), (r, g, b) => out.push([r / 255, g / 255, b / 255]));
    return out.filter((_, i) => i % 7 === 0);
  };
  const bump: [number, number][] = [
    [0, 0.5],
    [0.3, 0.75],
    [0.6, 0.5],
    [1, 0.5],
  ];
  const angleDiff = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);
  it("flat curves are neutral", () =>
    expect(gradeHueCurvesControls(flat)).toBeNull());
  it("hue vs hue moves only the hue (hue sweep)", () => {
    const k = gradeHueCurvesControls({ ...flat, hueVsHue: bump })!;
    let moved = 0;
    for (const v of pixels("hue-sweep")) {
      const a = dims(v),
        b = dims(applyGradeHueCurves(v, k));
      expect(Math.abs(a.luma - b.luma)).toBeLessThan(1e-9);
      expect(Math.abs(a.radius - b.radius)).toBeLessThan(1e-9);
      moved = Math.max(moved, angleDiff(a.angle, b.angle));
    }
    expect(moved).toBeGreaterThan(30);
  });
  it("hue vs sat, lum vs sat and sat vs sat move only the chroma radius", () => {
    for (const key of ["hueVsSat", "lumVsSat", "satVsSat"] as const) {
      const k = gradeHueCurvesControls({ ...flat, [key]: bump })!;
      let changed = 0;
      for (const v of pixels(
        key === "lumVsSat"
          ? "skin-tones"
          : key === "satVsSat"
            ? "saturation-sweep"
            : "hue-sweep",
      )) {
        const a = dims(v),
          b = dims(applyGradeHueCurves(v, k));
        expect(Math.abs(a.luma - b.luma)).toBeLessThan(1e-9);
        if (a.radius > 1e-6)
          expect(angleDiff(a.angle, b.angle)).toBeLessThan(1e-6);
        changed = Math.max(changed, Math.abs(b.radius - a.radius));
      }
      expect(changed, key).toBeGreaterThan(0.01);
    }
  });
  it("hue vs lum and sat vs lum move only luma", () => {
    for (const key of ["hueVsLum", "satVsLum"] as const) {
      const k = gradeHueCurvesControls({ ...flat, [key]: bump })!;
      let changed = 0;
      for (const v of pixels(
        key === "hueVsLum" ? "hue-sweep" : "saturation-sweep",
      )) {
        const a = dims(v),
          b = dims(applyGradeHueCurves(v, k));
        expect(Math.abs(a.radius - b.radius)).toBeLessThan(1e-9);
        if (a.radius > 1e-6)
          expect(angleDiff(a.angle, b.angle)).toBeLessThan(1e-6);
        changed = Math.max(changed, Math.abs(b.luma - a.luma));
      }
      expect(changed, key).toBeGreaterThan(0.01);
    }
  });
  it("is continuous across the 0°/360° hue wrap", () => {
    const k = gradeHueCurvesControls({
      ...flat,
      hueVsSat: [
        [0, 0.8],
        [0.5, 0.5],
        [1, 0.8],
      ],
    })!;
    // Two colours either side of +Cb (0°): angles ±0.01°.
    const at = (deg: number): Rgb => {
      const cb = 0.1 * Math.cos((deg * Math.PI) / 180),
        cr = 0.1 * Math.sin((deg * Math.PI) / 180),
        y = 0.5;
      const r = y + 1.5748 * cr,
        b = y + 1.8556 * cb;
      return [r, (y - 0.2126 * r - 0.0722 * b) / 0.7152, b];
    };
    const a = applyGradeHueCurves(at(0.01), k),
      b = applyGradeHueCurves(at(359.99), k);
    expect(Math.abs(radius(a) - radius(b))).toBeLessThan(1e-5);
  });
});

describe("grade.tonal reference", () => {
  it("neutral is an exact identity", () => {
    for (const v of [
      [0, 0.5, 1],
      [-0.3, 2, 0.1],
    ] as Rgb[])
      expect(applyGradeTonal(v, NEUTRAL_GRADE_TONAL)).toEqual(v);
  });
  it("shadow exposure lifts darks and leaves highlights; boundaries move the ranges", () => {
    const t = { ...NEUTRAL_GRADE_TONAL, shadowExposure: 1 };
    expect(applyGradeTonal([0.05, 0.05, 0.05], t)[0]).toBeCloseTo(0.1, 6);
    expect(applyGradeTonal([0.9, 0.9, 0.9], t)[0]).toBe(0.9);
    const wide = { ...t, shadowEnd: 0.8 };
    expect(applyGradeTonal([0.5, 0.5, 0.5], wide)[0]).toBeGreaterThan(0.9);
  });
  it("highlight colour offsets only bright pixels", () => {
    const t = { ...NEUTRAL_GRADE_TONAL, highlightOffset: [0, 0, 0.1] as Rgb };
    expect(applyGradeTonal([0.95, 0.95, 0.95], t)[2]).toBeCloseTo(1.05, 6);
    expect(applyGradeTonal([0.1, 0.1, 0.1], t)[2]).toBe(0.1);
  });
  it("soft clip compresses above the knee into (knee, 1), continuously and monotonically", () => {
    const t = { ...NEUTRAL_GRADE_TONAL, softClipHigh: 0.8, softClipLow: 0.1 };
    let previous = -Infinity;
    for (let x = -1; x <= 4; x += 0.001) {
      const y = applyGradeTonal([x, x, x], t)[0];
      expect(y).toBeGreaterThan(previous);
      expect(y).toBeLessThan(1);
      expect(y).toBeGreaterThan(0);
      previous = y;
    }
    expect(applyGradeTonal([0.5, 0.5, 0.5], t)[0]).toBe(0.5);
    const below = applyGradeTonal([0.8 - 1e-7, 0, 0], t)[0],
      above = applyGradeTonal([0.8 + 1e-7, 0, 0], t)[0];
    expect(above - below).toBeCloseTo(2e-7, 10);
  });
});
