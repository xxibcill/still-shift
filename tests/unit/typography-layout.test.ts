import { describe, expect, it } from "vitest";
import { textBreaks } from "../../packages/renderer-core/src/shaped-text.ts";
import { commonClusters } from "../../packages/renderer-core/src/typography-transition.ts";
import { resolveNarrationWord } from "../../packages/renderer-core/src/typography-events.ts";
import { parseNarrationTiming } from "../../packages/renderer-core/src/narration-timing.ts";
import {
  textOrder,
  selectorAmount,
} from "../../packages/renderer-core/src/typography-animation.ts";
import { readFontMetrics } from "../../packages/renderer-core/src/font-metrics.ts";
import { readFileSync } from "node:fs";

describe("shaped typography", () => {
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
