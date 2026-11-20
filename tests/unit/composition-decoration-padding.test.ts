// Phase 1 (editorial titles): `padding` on highlight and box decorations.
// The ET7a pilot found highlights had no horizontal padding (engine mapping,
// docs/editorial-typography-et7a-results.json).
import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  decorationPadding,
  type DrawnTextDecoration,
} from "../../packages/renderer-core/src/typography-decorations.ts";

const doc = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 400,
  height: 200,
  fps: 24,
  frameCount: 24,
  assets: [
    {
      id: "label",
      type: "font",
      path: "label.ttf",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "400",
    },
  ],
  layers: [
    {
      id: "title",
      type: "text",
      text: "ONE PANT",
      fontSize: 48,
      color: "#111111",
      fontAsset: "label",
    },
  ],
});
const errors = (input: Composition) => {
  const result = validateComposition(input);
  return result.ok ? [] : result.diagnostics.map((d) => `${d.code} ${d.path}`);
};

describe("decoration padding (Phase 1)", () => {
  const withPadding = (kind: string, padding: unknown) => {
    const input = doc();
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.decorations = [
      { kind, color: "#ffe14d", padding } as NonNullable<
        typeof layer.decorations
      >[number],
    ];
    return errors(input);
  };
  it.each([
    ["highlight", 12],
    ["highlight", [6, 18]],
    ["box", [4, 20, 8, 20]],
  ])("accepts %s padding %j", (kind, padding) => {
    expect(withPadding(kind, padding)).toEqual([]);
  });
  it("rejects padding on underline and strike", () => {
    expect(withPadding("underline", 8)).toEqual([
      "comp-text-decoration-padding layers[0].decorations[0].padding",
    ]);
  });
  it("rejects negative or three-value padding", () => {
    expect(withPadding("highlight", -2)).not.toEqual([]);
    expect(withPadding("highlight", [1, 2, 3])).not.toEqual([]);
  });
  it.each([
    [undefined, [0, 0, 0, 0]],
    [12, [12, 12, 12, 12]],
    [
      [6, 18],
      [6, 18, 6, 18],
    ],
    [
      [4, 20, 8, 16],
      [4, 20, 8, 16],
    ],
  ] as const)("resolves padding %j in CSS order", (padding, sides) => {
    const mark = { kind: "highlight", color: "#ffe14d", padding };
    const { top, right, bottom, left } = decorationPadding(
      mark as DrawnTextDecoration,
    );
    expect([top, right, bottom, left]).toEqual(sides);
  });
});
