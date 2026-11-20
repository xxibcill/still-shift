// Phase 1 review: while glyphs reveal, a `growWithText` mark follows the
// baseline of its line's most-revealed glyph (the first one on ties), not
// whichever glyph happens to be first in line order and still entering.
import { describe, expect, it } from "vitest";
import type { ShapedLayout } from "../../packages/renderer-core/src/shaped-text.ts";
import type { TextPose } from "../../packages/renderer-core/src/typography-animation.ts";
import { decorationSegments } from "../../packages/renderer-core/src/typography-decorations.ts";
import type { TextNode } from "../../packages/renderer-core/src/typography-style.ts";

const node = { id: "label", type: "text", text: "ABC" } as TextNode;
const layout = {
  lines: [{ baseline: 100, clusters: [0, 1, 2] }],
  clusters: ["A", "B", "C"].map((text, i) => ({
    text,
    x: i * 10,
    advance: 10,
    spanIndex: -1,
  })),
} as unknown as ShapedLayout;
const pose = (opacity: number, y: number) =>
  ({ x: 0, y, scale: 1, opacity }) as TextPose;
const grown = (poses: TextPose[]) =>
  decorationSegments(node, layout, undefined, poses, true)[0]!;

describe("decorationSegments with growWithText", () => {
  it("follows the settled glyph during a reverse drop build", () => {
    // C has settled, B is entering 12 px low, A is still hidden.
    const segment = grown([pose(0, 30), pose(0.5, 12), pose(1, 0)]);
    expect(segment).toMatchObject({ x: 10, width: 20, baseline: 100 });
  });

  it("follows the settled glyph during a forward drop build", () => {
    const segment = grown([pose(1, 0), pose(0.5, 12), pose(0, 30)]);
    expect(segment).toMatchObject({ x: 0, width: 20, baseline: 100 });
  });

  it("matches the ungrown baseline once every glyph is revealed", () => {
    const poses = [pose(1, 4), pose(1, 8), pose(1, 0)];
    expect(grown(poses).baseline).toBe(104);
    expect(
      decorationSegments(node, layout, undefined, poses, false)[0]!.baseline,
    ).toBe(104);
  });
});
