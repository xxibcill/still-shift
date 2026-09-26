import { describe, expect, it } from "vitest";
import {
  measureFrameEnergy,
  summarizeMotionEnergy,
} from "../../scripts/story-motion/motion-energy.ts";

describe("encoded motion energy", () => {
  it("requires a strict pixel threshold and 200 changed pixels", () => {
    const before = new Uint8Array(300).fill(100);
    const after = before.slice();
    after.fill(104, 0, 50);
    after.fill(105, 50, 250);
    expect(measureFrameEnergy(before, after, 4)).toBe(200);
    const report = summarizeMotionEnergy([0, 199, 200, 201], {
      width: 300,
      height: 1,
      fps: 24,
    });
    expect(report.movingShare).toBeCloseTo(2 / 3);
    expect(report.longestFrozenRun).toBe(1);
  });
  it("excludes frame zero and measures frozen intervals and peak contrast", () => {
    const report = summarizeMotionEnergy([0, 0, 0, 200, 200, 800, 0], {
      width: 1920,
      height: 1080,
      fps: 24,
    });
    expect(report.longestFrozenRun).toBe(2);
    expect(report.peakToMedian).toBe(8);
    expect(report.gates.movingShare.pass).toBe(false);
    expect(report.sparkline).toContain("<svg");
  });
  it("does not pass a motionless or truncated video", () => {
    expect(
      summarizeMotionEnergy([0, 0, 0], { width: 1, height: 1, fps: 24 }).gates
        .peakContrast.pass,
    ).toBe(false);
    expect(() =>
      summarizeMotionEnergy([0], { width: 1, height: 1, fps: 24 }),
    ).toThrow();
  });
});
