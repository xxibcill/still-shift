import { describe, expect, it } from "vitest";
import { vectorRegions } from "../../packages/renderer-core/src/composition/render/webgl-vector-regions.ts";
const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});
describe("GPU vector coverage partitions", () => {
  it("separates distant artwork while retaining overlap order", () => {
    expect(
      vectorRegions([
        box(0, 0, 10, 10),
        box(100, 100, 110, 110),
        box(5, 5, 15, 15),
      ]),
    ).toEqual([
      { bounds: box(100, 100, 110, 110), indices: [1] },
      { bounds: box(0, 0, 15, 15), indices: [0, 2] },
    ]);
  });
  it("merges regions reached by an expanded bounding rectangle", () => {
    const regions = vectorRegions([
      box(30, 30, 40, 40),
      box(0, 0, 10, 50),
      box(5, 45, 50, 55),
      box(300, 300, 310, 310),
    ]);
    expect(regions).toEqual([
      { bounds: box(0, 0, 50, 55), indices: [0, 1, 2] },
      { bounds: box(300, 300, 310, 310), indices: [3] },
    ]);
  });
  it("keeps dense batches together and accepts an empty batch", () => {
    expect(vectorRegions([box(0, 0, 10, 10), box(11, 0, 21, 10)])).toEqual([
      { bounds: box(0, 0, 21, 10), indices: [0, 1] },
    ]);
    expect(vectorRegions([])).toEqual([]);
  });
});
