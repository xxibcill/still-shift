import { describe, expect, it } from "vitest";
import { textRevealLayout } from "../../packages/renderer-core/src/story-text.ts";

describe("text reveal", () => {
  it("wipes from the visual left edge for every alignment", () => {
    const measure = (text: string) => text.length * 10;
    expect(textRevealLayout("abc def", "left", "wipe", 0.5, measure).left).toBe(
      0,
    );
    expect(
      textRevealLayout("abc def", "center", "wipe", 0.5, measure).left,
    ).toBe(-35);
    expect(
      textRevealLayout("abc def", "right", "wipe", 0.5, measure).left,
    ).toBe(-70);
  });
  it("stages words deterministically at their measured prefixes", () => {
    const measure = (text: string) => text.length * 10;
    const half = textRevealLayout(
      "one two three",
      "center",
      "words",
      0.5,
      measure,
    );
    expect(half.words[0]!.progress).toBeCloseTo(2.5 / 3);
    expect(half.words[1]!.x).toBe(-65 + 40);
    expect(half.words[2]!.progress).toBeCloseTo(0.5 / 3);
    expect(
      textRevealLayout(
        "one two three",
        "left",
        "words",
        1,
        measure,
      ).words.every((w) => w.progress === 1),
    ).toBe(true);
  });
});
