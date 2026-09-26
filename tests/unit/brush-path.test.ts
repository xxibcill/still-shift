import { describe, expect, it } from "vitest";
import { brushStroke } from "../../packages/renderer-core/src/brush-path.ts";

const route = {
  id: "route",
  points: [
    [0, 0],
    [1000, 0],
  ] as [number, number][],
  lineWidth: 22,
};
const vertices = (mark: ReturnType<typeof brushStroke>) => [
  ...mark.wash,
  ...mark.body,
  ...mark.cuts.flat(),
];

describe("split-nib brush paths", () => {
  it("contains the entire mark, including wash and texture, inside the clearance envelope", () => {
    for (const id of [
      "land-link",
      "access-link",
      "route-a",
      "route-b",
      "outgoing",
    ]) {
      for (const end of [0.03, 0.3, 0.7, 1]) {
        const mark = brushStroke({ ...route, id }, 0, end);
        expect(
          vertices(mark).every(
            ([x, y]) =>
              Number.isFinite(x) &&
              x >= 0 &&
              x <= end * 1000 &&
              Math.abs(y) <= 11,
          ),
        ).toBe(true);
      }
    }
  });

  it("clips all pigment and dry streaks at fracture boundaries", () => {
    const before = brushStroke(route, 0, 0.4);
    const after = brushStroke(route, 0.6, 1);
    expect(before.cuts.length).toBeGreaterThan(0);
    expect(after.cuts.length).toBeGreaterThan(0);
    expect(Math.max(...vertices(before).map(([x]) => x))).toBeLessThanOrEqual(
      400,
    );
    expect(Math.min(...vertices(after).map(([x]) => x))).toBeGreaterThanOrEqual(
      600,
    );
  });

  it("keeps deposited edges fixed while the drawing tip advances and after a backward seek", () => {
    const first = brushStroke(route, 0, 0.4);
    const later = brushStroke(route, 0, 0.9);
    const deposited = (points: [number, number][]) =>
      points.filter(([x]) => x < 300);
    expect(deposited(first.wash)).toEqual(deposited(later.wash));
    expect(deposited(first.body)).toEqual(deposited(later.body));
    expect(brushStroke(route, 0, 0.4)).toEqual(first);
  });

  it("handles empty and degenerate intervals without marks", () => {
    for (const [start, end] of [
      [0, 0],
      [0.8, 0.2],
      [1, 2],
    ]) {
      expect(vertices(brushStroke(route, start!, end!))).toEqual([]);
    }
    expect(
      vertices(
        brushStroke(
          {
            ...route,
            points: [
              [5, 5],
              [5, 5],
            ],
          },
          0,
          1,
        ),
      ),
    ).toEqual([]);
  });
});
