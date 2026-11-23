/**
 * CGA2: CGA's corrections translated to the grade engine (solver 2) match
 * their 8-bit counterparts, and their predictions equal the float64 run.
 */
import { describe, expect, it } from "vitest";
import {
  temperatureTintForWhite,
  temperatureTintWhite,
} from "@still-shift/color-science";
import {
  applyColorEffects,
  colorDifference,
  engineEffects,
  gainCurve,
  gradeEngineEffects,
  gradeRunOps,
  skinProtectionKey,
  type ColorCorrectionEffect,
} from "@still-shift/animation-engine";
import { effectCurveIssue } from "@still-shift/scene-contract";
import { whiteBalanceGains } from "../../packages/renderer-core/src/composition/render/grade-effects.ts";
import { floatGradeBytes } from "../../packages/renderer-core/src/composition/render/float-grade.ts";

/** Every 8-bit color on a coarse cube plus the full neutral ramp, opaque. */
const CUBE = (() => {
  const values: number[] = [];
  for (let r = 0; r < 256; r += 15)
    for (let g = 0; g < 256; g += 15)
      for (let b = 0; b < 256; b += 15) values.push(r, g, b, 255);
  for (let v = 0; v < 256; v++) values.push(v, v, v, 255);
  return new Uint8Array(values);
})();
const WIDTH = CUBE.length / 4;
const both = (effect: ColorCorrectionEffect) => {
  const legacy = applyColorEffects([effect], CUBE);
  const grade = applyColorEffects(
    engineEffects("grade", [effect]) as ColorCorrectionEffect[],
    CUBE,
  );
  return colorDifference([legacy], [grade], WIDTH);
};

describe("temperatureTintForWhite", () => {
  it("inverts temperatureTintWhite and flags whites outside the bounds", () => {
    for (const [k, tint] of [
      [6500, 0],
      [3200, -16],
      [2000, 40],
      [9000, 20],
      [24000, 90],
    ] as const) {
      const solved = temperatureTintForWhite(temperatureTintWhite(k, tint));
      expect(solved.reached).toBe(true);
      expect(solved.temperature).toBeCloseTo(k, 6);
      expect(solved.tint).toBeCloseTo(tint, 6);
    }
    const outside = temperatureTintForWhite([0.2, 0.2]);
    expect(outside.reached).toBe(false);
    expect(outside.residualUv).toBeGreaterThan(0.01);
  });
});

describe("CGA2 grade-engine mappings", () => {
  it("white balance gains: per-channel curves within one code of color.white-balance", () => {
    for (const temperature of [-100, -35, -10, 10, 35, 100])
      for (const tint of [-30, 0, 30]) {
        const d = both({
          id: "wb",
          effect: "color.white-balance",
          params: { temperature, tint },
        });
        expect(d.max).toBeLessThanOrEqual(1);
      }
    for (const gain of whiteBalanceGains(60, -20)) {
      const points = gainCurve(gain);
      expect(points.length).toBeLessThanOrEqual(16);
      expect(points.at(-1)).toEqual([1, gain > 1 ? 1 : points.at(-1)![1]]);
    }
  });
  it("white balance gains: a gain just above 1 never repeats the end point", () => {
    // Green's gain here is 1 + 6e-7: its clip knee rounds to x = 1.
    const [mapped] = gradeEngineEffects({
      id: "wb",
      effect: "color.white-balance",
      params: { temperature: -34.99, tint: 15.58 },
    });
    for (const channel of ["red", "green", "blue"])
      expect(
        effectCurveIssue(mapped!.params[channel] as number[][]),
      ).toBeUndefined();
    for (const gain of [1 + 1e-9, 1 + 6e-7, 1 + 1e-6, 1.0001])
      expect(effectCurveIssue(gainCurve(gain))).toBeUndefined();
  });
  it("white balance adaptation: Bradford keeps neutrals within one code", () => {
    const effect: ColorCorrectionEffect = {
      id: "wb",
      effect: "color.white-balance",
      params: { temperature: -30, tint: 10 },
    };
    const [mapped] = gradeEngineEffects(effect, { whiteBalance: "adaptation" });
    expect(mapped!.effect).toBe("grade.white-balance");
    const ramp = CUBE.subarray(CUBE.length - 256 * 4);
    const legacy = applyColorEffects([effect], ramp);
    const grade = applyColorEffects([mapped as ColorCorrectionEffect], ramp);
    expect(colorDifference([legacy], [grade], 256).max).toBeLessThanOrEqual(1);
  });
  it("levels: an unclamped CDL within one code inside 0–1", () => {
    for (const params of [
      { inputBlack: 0.09, inputWhite: 0.89 },
      { inputBlack: 0, inputWhite: 1, gamma: 0.86 },
      { inputBlack: 0.04, inputWhite: 0.84, gamma: 1.2 },
    ])
      expect(
        both({ id: "levels", effect: "color.levels", params }).max,
      ).toBeLessThanOrEqual(1);
  });
  it("S-curve: the guarded master curve follows the straight segments within one code", () => {
    const d = both({
      id: "curve",
      effect: "color.curves",
      params: {
        curve: [
          [0, 0],
          [0.24, 0.2088],
          [0.48, 0.48],
          [0.74, 0.7738],
          [1, 1],
        ],
      },
    });
    expect(d.max).toBeLessThanOrEqual(1);
  });
  it("look: grade.rgb-mixer within one code of color.matrix", () => {
    const params = {
      rr: 1.12,
      rg: -0.035,
      rb: -0.147,
      gr: -0.194,
      gg: 1.113,
      gb: 0.028,
      br: -0.119,
      bg: -0.554,
      bb: 1.694,
      ro: 0.008,
      go: 0.007,
      bo: 0.007,
      strength: 0.6,
    };
    expect(
      both({ id: "look", effect: "color.matrix", params }).max,
    ).toBeLessThanOrEqual(1);
  });
  it("vibrance: colorBoost behind a pointwise skin key matches color.vibrance", () => {
    const vibrance = (protectSkin: number): ColorCorrectionEffect => ({
      id: "vivid",
      effect: "color.vibrance",
      params: { vibrance: 60, saturation: 0, protectSkin },
    });
    expect(gradeEngineEffects(vibrance(0.7)).map((e) => e.effect)).toEqual([
      "grade.key",
      "grade.primary",
    ]);
    expect(gradeEngineEffects(vibrance(0)).map((e) => e.effect)).toEqual([
      "grade.primary",
    ]);
    // Vibrance's integer tables against the float formula: within 3 codes.
    for (const protect of [0, 0.7, 1]) {
      const d = both(vibrance(protect));
      expect(d.max).toBeLessThanOrEqual(3);
      expect(d.p99).toBeLessThanOrEqual(1);
    }
    // A fully saturated orange (skin hue, no room to boost) is left alone,
    // and a skin tone is boosted less than with no protection.
    const orange = new Uint8Array([255, 120, 0, 255]);
    const grade = (protect: number, rgba: Uint8Array) =>
      applyColorEffects(
        engineEffects("grade", [vibrance(protect)]) as ColorCorrectionEffect[],
        rgba,
      );
    expect([...grade(0.7, orange)]).toEqual([...orange]);
    const skin = new Uint8Array([217, 172, 141, 255]);
    const sat = (rgba: Uint8Array) =>
      (Math.max(rgba[0]!, rgba[1]!, rgba[2]!) -
        Math.min(rgba[0]!, rgba[1]!, rgba[2]!)) /
      Math.max(rgba[0]!, rgba[1]!, rgba[2]!);
    expect(sat(grade(0.7, skin))).toBeLessThan(sat(grade(0, skin)));
    expect(skinProtectionKey(0)).toBeNull();
  });
  it("vibrance: a negative boost keeps its skin protection", () => {
    for (const amount of [-40, -80]) {
      const effect: ColorCorrectionEffect = {
        id: "vivid",
        effect: "color.vibrance",
        params: { vibrance: amount, saturation: 0, protectSkin: 0.7 },
      };
      expect(gradeEngineEffects(effect).map((e) => e.effect)).toEqual([
        "grade.key",
        "grade.primary",
      ]);
      const d = both(effect);
      expect(d.max).toBeLessThanOrEqual(3);
      expect(d.p99).toBeLessThanOrEqual(1);
    }
  });
  it("mapped curves stay within the curve contract (≤ 16 points, 0–1, increasing x)", () => {
    const effects = engineEffects("grade", [
      {
        id: "wb",
        effect: "color.white-balance",
        params: { temperature: 40, tint: -12 },
      },
      {
        id: "levels",
        effect: "color.levels",
        params: { inputBlack: 0.05, inputWhite: 0.9, gamma: 1.1 },
      },
      {
        id: "vivid",
        effect: "color.vibrance",
        params: { vibrance: 80, saturation: 0, protectSkin: 0.7 },
      },
    ]);
    const curves = effects.flatMap((effect) =>
      Object.values(effect.params).filter((value) => Array.isArray(value)),
    ) as number[][][];
    expect(curves.length).toBe(3);
    for (const points of curves) {
      expect(points.length).toBeLessThanOrEqual(16);
      points.forEach(([x, y], i) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
        if (i) expect(x).toBeGreaterThan(points[i - 1]![0]!);
      });
    }
  });
});

describe("CGA2 prediction", () => {
  it("evaluates a run of grade.* effects in float64 with one quantization", () => {
    const effects = engineEffects("grade", [
      {
        id: "wb",
        effect: "color.white-balance",
        params: { temperature: -20, tint: 5 },
      },
      {
        id: "levels",
        effect: "color.levels",
        params: { inputBlack: 0.1, inputWhite: 0.85 },
      },
      {
        id: "vivid",
        effect: "color.vibrance",
        params: { vibrance: 50, saturation: 0, protectSkin: 0 },
      },
    ]) as ColorCorrectionEffect[];
    const ops = gradeRunOps(effects);
    const out = applyColorEffects(effects, CUBE);
    for (let i = 0; i < CUBE.length; i += 4 * 97) {
      const expected = floatGradeBytes(ops, [
        CUBE[i]! / 255,
        CUBE[i + 1]! / 255,
        CUBE[i + 2]! / 255,
      ]);
      expect([out[i], out[i + 1], out[i + 2]]).toEqual([...expected]);
    }
  });
  it("leaves legacy effects untouched", () => {
    const effect: ColorCorrectionEffect = {
      id: "levels",
      effect: "color.levels",
      params: { inputBlack: 0.1 },
    };
    expect(engineEffects("legacy", [effect])).toEqual([effect]);
  });
});
