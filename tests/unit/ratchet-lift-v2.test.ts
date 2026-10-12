import { describe, expect, it } from "vitest";
import { ratchetLiftV2 } from "../../packages/renderer-core/src/mechanism/ratchet-lift-v2.ts";
describe("deterministic single-tooth lift", () => {
  it("preserves closed endpoints, peak, symmetry, monotonic halves and sine accuracy", () => {
    expect(ratchetLiftV2(0)).toBe(0);
    expect(ratchetLiftV2(1)).toBe(0);
    expect(ratchetLiftV2(0.5)).toBe(1);
    let previous = 0,
      maximumError = 0;
    for (let index = 0; index <= 10000; index++) {
      const phase = index / 10000,
        lift = ratchetLiftV2(phase);
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(1);
      if (index <= 5000) expect(lift).toBeGreaterThanOrEqual(previous);
      else expect(lift).toBeLessThanOrEqual(previous);
      expect(Math.abs(lift - ratchetLiftV2(1 - phase))).toBeLessThanOrEqual(
        1e-15,
      );
      maximumError = Math.max(
        maximumError,
        Math.abs(lift - Math.sin(Math.PI * phase)),
      );
      previous = lift;
    }
    expect(maximumError).toBeLessThanOrEqual(1e-15);
  });
  it.each([NaN, Infinity, -0.01, 1.01])(
    "rejects a phase outside one tooth: %s",
    (phase) => {
      expect(() => ratchetLiftV2(phase)).toThrow(RangeError);
    },
  );
});
