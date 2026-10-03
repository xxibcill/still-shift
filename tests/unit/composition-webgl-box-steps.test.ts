import { describe, expect, it } from "vitest";
import { boxSteps } from "../../packages/renderer-core/src/composition/render/webgl-box-blur.ts";
import { blurKernel } from "../../packages/renderer-core/src/composition/render/webgl-blur-kernel.ts";

const rebuild = (length: number) =>
  boxSteps(length).reduce(
    (count, { multiple, extra }) => count * multiple + extra,
    1,
  );

describe("GPU box-sum plans", () => {
  it("reconstruct every box length with bounded specialized programs", () => {
    for (let length = 2; length <= 1024; length++) {
      expect(rebuild(length)).toBe(length);
      for (const { multiple, extra } of boxSteps(length)) {
        expect(multiple).toBeGreaterThanOrEqual(2);
        expect(multiple).toBeLessThanOrEqual(8);
        expect(extra).toBeGreaterThanOrEqual(0);
        expect(extra).toBeLessThan(Math.min(multiple, 4));
      }
    }
  });

  it("uses fewer passes than binary doubling for the radius-16 glow", () => {
    const { lengths } = blurKernel(16);
    expect(lengths).toEqual([30, 30, 31]);
    const passes = lengths.reduce(
      (total, length) => total + boxSteps(length).length,
      0,
    );
    const binary = lengths.reduce(
      (total, length) => total + length.toString(2).length - 1,
      0,
    );
    expect(binary).toBe(12);
    expect(passes).toBe(6);
  });
});
