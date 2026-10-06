import { describe, expect, it } from "vitest";
import { measurePairedRenderTimings } from "../helpers/paired-render-timing.ts";

function renderers(legacyCost: number, compositionCost: number) {
  let time = 0;
  const legacyFrames: number[] = [],
    compositionFrames: number[] = [];
  const renderer = (cost: number, frames: number[]) => ({
    renderFrame(frame: number) {
      frames.push(frame);
      time += cost / 2;
    },
    readPixels() {
      time += cost / 2;
    },
  });
  return {
    legacy: renderer(legacyCost, legacyFrames),
    composition: renderer(compositionCost, compositionFrames),
    now: () => time,
    legacyFrames,
    compositionFrames,
  };
}

describe("paired render timing observations", () => {
  it("measures equal complete timelines until both observations are long enough", () => {
    const inputs = renderers(2, 3);
    const result = measurePairedRenderTimings(
      10,
      inputs.legacy,
      inputs.composition,
      inputs.now,
    );
    expect(inputs.legacyFrames).toEqual(inputs.compositionFrames);
    expect(inputs.legacyFrames.every((frame, i) => frame === i % 10)).toBe(
      true,
    );
    expect(
      result.timings.every(
        (sample) => sample.legacyMs >= 500 && sample.compositionMs >= 500,
      ),
    ).toBe(true);
    expect(result.ratio).toBeCloseTo(1.5);
  });

  it("keeps a sustained slowdown above the existing 1.25 acceptance limit", () => {
    const inputs = renderers(2, 2.6);
    expect(
      measurePairedRenderTimings(
        10,
        inputs.legacy,
        inputs.composition,
        inputs.now,
      ).ratio,
    ).toBeGreaterThan(1.25);
  });

  it("includes render and readback costs in both measurements", () => {
    let time = 0;
    const renderer = (readCost: number) => ({
      renderFrame() {
        time += 1;
      },
      readPixels() {
        time += readCost;
      },
    });
    const result = measurePairedRenderTimings(
      10,
      renderer(1),
      renderer(3),
      () => time,
    );
    expect(result.ratio).toBe(2);
  });

  it("refuses unmeasurable clocks rather than reporting a passing ratio", () => {
    const renderer = { renderFrame() {}, readPixels() {} };
    expect(() =>
      measurePairedRenderTimings(10, renderer, renderer, () => 0),
    ).toThrow(/observation/);
  });

  it("rejects empty or fractional timelines", () => {
    const inputs = renderers(1, 1);
    for (const frames of [0, -1, 1.5, Infinity]) {
      expect(() =>
        measurePairedRenderTimings(
          frames,
          inputs.legacy,
          inputs.composition,
          inputs.now,
        ),
      ).toThrow(/frame count/);
    }
  });
});
