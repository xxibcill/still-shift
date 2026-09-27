import { describe, expect, it } from "vitest";
import { sampleCurve } from "../../packages/renderer-core/src/curve.ts";
import { easeMotion } from "../../packages/renderer-core/src/motion-easing.ts";
import {
  MotionEasingSchema,
  CurveEasingSchema,
} from "../../packages/scene-contract/src/motion-easing.ts";

describe("motion craft curves", () => {
  it("passes through smooth keys with nonzero C1 velocity and no monotone overshoot", () => {
    const keys = [
      { time: 0, value: 0 },
      { time: 20, value: 40, smooth: true },
      { time: 60, value: 90 },
    ];
    const dt = 1e-7;
    const left = (sampleCurve(keys, 20) - sampleCurve(keys, 20 - dt)) / dt;
    const right = (sampleCurve(keys, 20 + dt) - sampleCurve(keys, 20)) / dt;
    expect(left).toBeGreaterThan(1);
    expect(Math.abs(left - right)).toBeLessThan(1e-6);
    for (let f = 0; f <= 60; f += 0.1) {
      const value = sampleCurve(keys, f);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(90);
      if (f > 0)
        expect(value).toBeGreaterThanOrEqual(sampleCurve(keys, f - 0.1));
    }
  });
  it("preserves every legacy easing without handles", () => {
    for (const easing of MotionEasingSchema.options)
      for (let f = 0; f <= 40; f++) {
        expect(
          sampleCurve(
            [
              { time: 0, value: 12 },
              { time: 40, value: 30, easing },
            ],
            f,
          ),
        ).toBe(12 + 18 * easeMotion(f / 40, easing));
      }
  });
  it("has exact spring endpoints in all three damping regimes and is seek independent", () => {
    for (const damping of [5, 20, 40]) {
      const easing = { spring: { stiffness: 100, damping, mass: 1 } };
      expect(easeMotion(0, easing)).toBe(0);
      expect(easeMotion(1, easing)).toBe(1);
      const samples = Array.from({ length: 100 }, (_, i) =>
        easeMotion(i / 100, easing),
      );
      for (let i = 99; i >= 0; i--)
        expect(easeMotion(i / 100, easing)).toBe(samples[i]);
      expect(samples.every(Number.isFinite)).toBe(true);
    }
  });
  it("inverts time handles, enforces handle bounds and honors authored speed", () => {
    expect(easeMotion(0.5, { bezier: [0.42, 0, 0.58, 1] })).toBeCloseTo(
      0.5,
      12,
    );
    expect(CurveEasingSchema.safeParse({ bezier: [-1, 0, 1, 1] }).success).toBe(
      false,
    );
    expect(
      CurveEasingSchema.safeParse({
        spring: { stiffness: 0, damping: 2, mass: 1 },
      }).success,
    ).toBe(false);
    const keys = [
      { time: 0, value: 0, out: { ease: 0.4, speed: 2 } },
      { time: 20, value: 30, in: { ease: 0.6, speed: 1 } },
    ];
    expect(sampleCurve(keys, 1e-5) / 1e-5).toBeCloseTo(2, 5);
    expect((30 - sampleCurve(keys, 20 - 1e-5)) / 1e-5).toBeCloseTo(1, 5);
  });
});
