import { describe, expect, it } from "vitest";
import {
  shapeText,
  textBreaks,
} from "../../packages/renderer-core/src/shaped-text.ts";
import { commonClusters } from "../../packages/renderer-core/src/typography-transition.ts";
import { resolveNarrationWord } from "../../packages/renderer-core/src/typography-events.ts";
import { parseNarrationTiming } from "../../packages/renderer-core/src/narration-timing.ts";
import {
  textOrder,
  selectorAmount,
} from "../../packages/renderer-core/src/typography-animation.ts";
import { readFontMetrics } from "../../packages/renderer-core/src/font-metrics.ts";
import { prepareTextFits } from "../../packages/renderer-core/src/component-text-fit.ts";
import { readFileSync } from "node:fs";
import type { LoadedFont } from "../../packages/renderer-core/src/prepared-fonts.ts";
import type { TextNode } from "../../packages/renderer-core/src/typography-style.ts";

const measuredContext = () => {
  const context = {
    font: "",
    measureText(text: string) {
      const size = Number(context.font.match(/([\d.]+)px/u)?.[1] ?? 48);
      const width = text.length * size * 0.5;
      return {
        width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
      };
    },
  };
  return context as unknown as CanvasRenderingContext2D;
};
const measuredFonts = new Map<string, LoadedFont>([
  [
    "test-font",
    {
      family: "Test",
      weight: "400",
      metrics: {
        unitsPerEm: 1000,
        ascent: 800,
        descent: 200,
        capHeight: 700,
        xHeight: 500,
        underlinePosition: 100,
        underlineThickness: 50,
        axes: {},
        features: [],
      },
    },
  ],
]);
const mixedSizeNode = {
  id: "mixed-size",
  type: "text",
  text: "a\nB",
  fontAsset: "test-font",
  fontSize: 48,
  color: "#ffffff",
  align: "left",
  spans: [{ start: 2, end: 3, style: "large" }],
} as TextNode;

describe("shaped typography", () => {
  it("tries smaller fitted sizes after a shared layout overflow", () => {
    const scene = {
      typography: "type-1" as const,
      nodes: [
        {
          ...mixedSizeNode,
          id: "fitted",
          text: "abcdefghij",
          spans: undefined,
          fontSize: 40,
          textLayout: {
            width: 80,
            height: 50,
            lineHeight: 1.5,
            overflow: "error",
          },
        } as TextNode,
      ],
    };
    const fitted = prepareTextFits(
      scene,
      [{ target: "fitted", minSize: 16, maxSize: 40 }],
      measuredContext(),
      measuredFonts,
    );
    expect(fitted.nodes[0]!.fontSize).toBe(16);
  });
  it("spaces lines using their actual span metrics", () => {
    const layout = shapeText(
      measuredContext(),
      mixedSizeNode,
      mixedSizeNode.text,
      measuredFonts,
      { large: { size: 160 } },
    );
    expect(
      layout.lines[1]!.baseline - layout.lines[0]!.baseline,
    ).toBeGreaterThanOrEqual(
      layout.lines[0]!.descent + layout.lines[1]!.ascent,
    );
    expect(layout.runs[1]!.baseline).toBe(layout.lines[1]!.baseline);
  });
  it("measures a large final span for overflow without adding phantom space", () => {
    const node = {
      ...mixedSizeNode,
      textLayout: {
        width: 1000,
        height: 220,
        lineHeight: 1.5,
        overflow: "error" as const,
      },
    };
    const layout = shapeText(
      measuredContext(),
      node,
      node.text,
      measuredFonts,
      {
        large: { size: 160 },
      },
    );
    expect(layout.top).toBeCloseTo(0);
    expect(layout.height).toBeCloseTo(208);
    expect(() =>
      shapeText(
        measuredContext(),
        { ...node, textLayout: { ...node.textLayout, height: 200 } },
        node.text,
        measuredFonts,
        { large: { size: 160 } },
      ),
    ).toThrow("Text exceeds its layout box");
  });
  it("prevents the recovered pantry orphan without changing text", () => {
    const text = "Not a recovered pantry";
    const greedy = textBreaks(text, 16, (s) => s.length, { wrap: "greedy" });
    const pretty = textBreaks(text, 16, (s) => s.length, { wrap: "pretty" });
    expect(greedy.map((r) => text.slice(r.start, r.end))).toEqual([
      "Not a recovered",
      "pantry",
    ]);
    expect(pretty.map((r) => text.slice(r.start, r.end))).toEqual([
      "Not a",
      "recovered pantry",
    ]);
  });
  it("balances rag and preserves paragraph breaks", () => {
    const text = "one two three four five six";
    const ranges = textBreaks(text, 17, (s) => s.length, { wrap: "balance" });
    const lengths = ranges.map((r) => r.end - r.start);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(5);
    expect(textBreaks("hello\n\nworld", 100, (s) => s.length)).toHaveLength(3);
  });
  it("matches repeated graphemes deterministically", () => {
    expect(commonClusters(["a", "b", "a"], ["b", "a", "c"])).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(commonClusters(["ก้", "🙂"], ["🙂", "ก้"])).toHaveLength(1);
  });
  it("retains imported word provenance and rejects ambiguous anchors", () => {
    const timing = parseNarrationTiming(
      JSON.stringify({
        segments: [
          { words: [{ word: "room", start: 1, end: 1.2 }] },
          { words: [{ word: "room", start: 2, end: 2.2 }] },
        ],
      }),
      "json",
    );
    expect(
      resolveNarrationWord(
        { narrationWord: { segment: 1, index: 0 }, offset: -2 },
        timing,
        30,
      ),
    ).toBe(58);
    expect(
      resolveNarrationWord(
        { narrationWord: "room", occurrence: 2 },
        timing,
        30,
      ),
    ).toBe(60);
    expect(() =>
      resolveNarrationWord({ narrationWord: "room" }, timing, 30),
    ).toThrow("ambiguous");
    expect(() =>
      resolveNarrationWord({ narrationWord: "missing" }, timing, 30),
    ).toThrow("missing");
  });
  it("uses seeded order and continuous selector shapes", () => {
    const selector = { start: 0, end: 1, order: "seeded" as const, seed: 8 };
    expect(textOrder(12, selector)).toEqual(textOrder(12, selector));
    expect(textOrder(12, selector)).not.toEqual(
      textOrder(12, { ...selector, seed: 9 }),
    );
    expect(textOrder(5, { ...selector, order: "center-out" })).toEqual([
      2, 1, 3, 0, 4,
    ]);
    expect(
      selectorAmount({ start: 0, end: 1, shape: "round" }, 2, 5, 0, {
        fps: 30,
      }),
    ).toBe(1);
    expect(
      selectorAmount({ start: 0, end: 1, shape: "smooth" }, 0, 5, 0, {
        fps: 30,
      }),
    ).toBe(0);
  });
  it("reads pinned metrics and rejects malformed fonts", () => {
    const bytes = readFileSync(
      "assets/story-motion/fonts/plex-sans-semibold.ttf",
    );
    const metrics = readFontMetrics(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(metrics.unitsPerEm).toBeGreaterThan(0);
    expect(metrics.xHeight).toBeLessThan(metrics.capHeight);
    expect(metrics.features).toContain("liga");
    expect(() => readFontMetrics(new ArrayBuffer(15))).toThrow("font-metadata");
  });
});
