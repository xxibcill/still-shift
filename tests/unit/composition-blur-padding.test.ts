import { expect, it } from "vitest";
import { blurPadding } from "../../packages/renderer-core/src/composition/render/webgl-blur-padding.ts";
it("preserves only offscreen pixels within finite blur support", () => {
  expect(
    blurPadding(96, 72, { left: 18, top: 15, right: 114, bottom: 87 }, 7, 8192),
  ).toEqual({ left: 0, top: 0, right: 7, bottom: 7, width: 103, height: 79 });
  expect(
    blurPadding(
      96,
      72,
      { left: -2, top: -100000, right: 90, bottom: 70 },
      7,
      8192,
    ),
  ).toEqual({ left: 2, top: 7, right: 0, bottom: 0, width: 98, height: 79 });
  expect(
    blurPadding(96, 72, { left: 0, top: 0, right: 96, bottom: 72 }, 7, 8192),
  ).toEqual({ left: 0, top: 0, right: 0, bottom: 0, width: 96, height: 72 });
});
it("rejects texture and memory budget overflow before allocation", () => {
  expect(() =>
    blurPadding(
      8192,
      72,
      { left: 0, top: 0, right: 8193, bottom: 72 },
      7,
      8192,
    ),
  ).toThrow(/comp-effect-budget/);
  expect(() =>
    blurPadding(
      1920,
      1080,
      { left: -100000, top: -100000, right: 100000, bottom: 100000 },
      3000,
      16384,
    ),
  ).toThrow(/comp-effect-budget/);
});
