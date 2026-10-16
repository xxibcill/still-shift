import { describe, expect, it } from "vitest";
import { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";
import type { TextNode } from "../../packages/renderer-core/src/typography-style.ts";
import type { ShapedLayout } from "../../packages/renderer-core/src/shaped-text.ts";
import type {
  PreparedTypography,
  TextRaster,
} from "../../packages/renderer-core/src/typography-renderer.ts";
import { nativeTypographyContentBounds } from "../../packages/renderer-core/src/composition/render/native-text-bounds.ts";

function word(extra: Record<string, unknown> = {}): TextNode {
  const node = PreparedNodeSchema.parse({
    id: "word",
    type: "text",
    text: "A",
    fontSize: 20,
    color: "#ffffff",
    ...extra,
  });
  if (node.type !== "text") throw Error("Expected text");
  return node;
}
function raster(text: string, x: number, width: number): TextRaster {
  const layout: ShapedLayout = {
    text,
    lines: [
      { text, x, width, baseline: 16, ascent: 16, descent: 4, clusters: [0] },
    ],
    clusters: [
      {
        text,
        sourceIndex: 0,
        spanIndex: 0,
        wordIndex: 0,
        lineIndex: 0,
        x,
        advance: width,
        baseline: 16,
        ascent: 16,
        descent: 4,
        runIndex: 0,
        ink: { x, y: 1, width, height: 18 },
      },
    ],
    runs: [
      {
        text,
        x,
        baseline: 16,
        width,
        style: {},
        color: "#ffffff",
        clusters: [0],
      },
    ],
    width,
    height: 20,
    left: x,
    top: 0,
    lineHeight: 20,
    ascent: 16,
    descent: 4,
    capHeight: 15,
    xHeight: 10,
    tracking: 0,
    leading: 1,
    underlinePosition: 2,
    underlineThickness: 1,
    overflow: false,
  };
  return {
    layout,
    canvas: { width, height: 20 } as HTMLCanvasElement,
    left: x,
    top: 0,
    colors: new Map(),
    strokes: new Map(),
    fonts: new Map(),
    variants: new Map(),
  };
}
function prepared(node: TextNode, entries: TextRaster[]): PreparedTypography {
  // The geometry helper never touches a canvas or font API; fail if it starts doing so.
  const unused = new Proxy({} as HTMLCanvasElement, {
    get() {
      throw Error("Unexpected canvas access");
    },
  });
  return {
    nodes: new Map([
      [node.id, new Map(entries.map((value) => [value.layout.text, value]))],
    ]),
    corrections: new Map(),
    pairs: new Map(),
    slideLimits: new Map(),
    scene: { nodes: [node], fps: 30, frameCount: 60 },
    layer: unused,
    maskLayer: unused,
    transitionLayer: unused,
  };
}
describe("native current text artwork crop", () => {
  it("retains negative ink coordinates and uses only the selected current state", () => {
    const node = word({ states: ["A", "Wide"] }),
      value = prepared(node, [raster("A", -9, 12), raster("Wide", -300, 800)]);
    expect(nativeTypographyContentBounds(node, value, 0, 1, 4.25)).toEqual({
      left: -11,
      top: -1,
      right: 5,
      bottom: 21,
    });
    expect(nativeTypographyContentBounds(node, value, 1, 1, 4.25).right).toBe(
      502,
    );
  });
  it("includes both positively painted transition copies and drops settled old ink", () => {
    const node = word({
      states: ["A", "B"],
      transition: { kind: "crossfade", window: { start: 0, end: 10 } },
    });
    const value = prepared(node, [raster("A", -40, 10), raster("B", 80, 10)]);
    expect(nativeTypographyContentBounds(node, value, 0, 1, 5)).toMatchObject({
      left: -42,
      right: 92,
    });
    expect(nativeTypographyContentBounds(node, value, 0, 1, 10)).toMatchObject({
      left: 78,
      right: 92,
    });
  });
  it("uses the actual intermediate count raster instead of its widest reserved state", () => {
    const node = word({
      text: "10",
      states: ["10", "20"],
      transition: {
        kind: "count",
        window: { start: 0, end: 10 },
        easing: "linear",
      },
    });
    const value = prepared(node, [
      raster("10", -200, 500),
      raster("15", -4, 18),
      raster("20", -300, 800),
    ]);
    expect(nativeTypographyContentBounds(node, value, 0, 1, 5)).toEqual({
      left: -6,
      top: -1,
      right: 16,
      bottom: 21,
    });
  });
  it("includes entered replacement ink at its translated current position, then clips it", () => {
    const node = word(),
      value = prepared(node, [raster("A", 0, 10)]);
    value.corrections.set(node.id, [
      {
        node: word({ text: "B" }),
        raster: raster("B", 0, 20),
        start: 10,
        end: 20,
        x: -25,
        y: 7,
      },
    ]);
    expect(nativeTypographyContentBounds(node, value, 0, 1, 10).left).toBe(-2);
    const entered = nativeTypographyContentBounds(node, value, 0, 1, 15);
    expect(entered.left).toBe(-27);
    expect(entered.bottom).toBeGreaterThan(28);
    const clipped = word({
      textLayout: { width: 8, height: 12, lineHeight: 1, overflow: "clip" },
    });
    expect(nativeTypographyContentBounds(clipped, value, 0, 1, 15)).toEqual({
      left: 0,
      top: 0,
      right: 8,
      bottom: 12,
    });
  });
  it("keeps current word-rise displacement and removes fully transparent word copies", () => {
    const node = word({ revealMode: "words" }),
      value = prepared(node, [raster("A", 0, 10)]);
    expect(nativeTypographyContentBounds(node, value, 0, 0, 4)).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    });
    expect(
      nativeTypographyContentBounds(node, value, 0, 0.2, 4).bottom,
    ).toBeCloseTo(23.8);
  });
});
