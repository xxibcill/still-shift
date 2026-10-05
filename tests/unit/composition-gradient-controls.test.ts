import { expect, it } from "vitest";
import {
  gradientControls,
  gradientRank,
  gradientColorTable,
} from "../../packages/renderer-core/src/composition/render/gradient-controls.ts";
it("retains long gradients and exact aligned half ranks", () => {
  const c = gradientControls({ start: [0, 0], end: [16, 0] });
  expect(gradientRank(c, 0, 0)).toBe(0);
  expect(gradientRank(c, 8, 0)).toBe(32768);
  expect(gradientRank(c, 16, 0)).toBe(65535);
  const long = gradientControls({
    start: [-1000000, -1000000],
    end: [1000000, 1000000],
  });
  expect(gradientRank(long, 0, 0)).toBeGreaterThanOrEqual(32767);
  expect(gradientRank(long, 0, 0)).toBeLessThanOrEqual(32768);
});
it("preserves subpixel midpoint steps and coincident endpoint support", () => {
  const c = gradientControls({
    start: [4128.499, 4128.5],
    end: [4128.501, 4128.5],
  });
  expect(gradientRank(c, 4128.5, 4128.5)).toBe(32768);
  expect(gradientRank(c, 4128, 4128.5)).toBe(0);
  expect(gradientRank(c, 4129, 4128.5)).toBe(65535);
  expect(
    gradientRank(
      gradientControls({ start: [0, 0], end: [0, 0] }),
      8191.5,
      8191.5,
    ),
  ).toBe(0);
});
it("has independent byte color/alpha table endpoints and midpoint", () => {
  const table = gradientColorTable({
    startColor: [0, 0, 0, 0],
    endColor: [1, 1, 1, 1],
  });
  expect(Array.from(table.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(table.slice(32768 * 4, 32768 * 4 + 4))).toEqual([
    128, 128, 128, 128,
  ]);
  expect(Array.from(table.slice(-4))).toEqual([255, 255, 255, 255]);
});
