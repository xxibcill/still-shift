// Phase 1 (editorial titles): a span style resolves variable-font axes
// against its own font. In ET7a a span style naming a static script font
// inherited the base style's wght and failed validation (a02 r01).
import { describe, expect, it } from "vitest";
import {
  declaredFontAxes,
  resolvedTextStyle,
  validateComposition,
  type Composition,
  type TextNode,
} from "@still-shift/scene-contract";

const font = (id: string, variable?: Record<string, [number, number]>) => ({
  id,
  type: "font" as const,
  path: `${id}.ttf`,
  sha256: `sha256:${"0".repeat(64)}`,
  weight: "400",
  ...(variable
    ? {
        variable: Object.fromEntries(
          Object.entries(variable).map(([tag, [min, max]]) => [
            tag,
            { min, default: min, max },
          ]),
        ),
      }
    : {}),
});

const doc = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 400,
  height: 200,
  fps: 24,
  frameCount: 24,
  assets: [
    font("serif", { wght: [400, 900], opsz: [6, 96] }),
    font("script"),
    font("narrow", { wght: [200, 700] }),
  ],
  textStyles: {
    base: { fontAsset: "serif", size: 80, axes: { wght: 900, opsz: 96 } },
    amp: { fontAsset: "script", size: 90 },
  },
  layers: [
    {
      id: "title",
      type: "text",
      text: "lace & lace",
      fontSize: 80,
      color: "#ffffff",
      style: "base",
      spans: [{ id: "amp", start: 5, end: 6, style: "amp" }],
    },
  ],
});
const errors = (input: Composition) => {
  const result = validateComposition(input);
  return result.ok ? [] : result.diagnostics.map((d) => `${d.code} ${d.path}`);
};

describe("span style axes", () => {
  it("drops inherited axes the span's own font lacks", () => {
    expect(errors(doc())).toEqual([]);
  });

  it("keeps inherited axes the span's font has, still range-checked", () => {
    const input = doc();
    input.textStyles!.amp = { fontAsset: "narrow", size: 90 };
    // narrow has wght 200–700; the inherited wght 900 is outside it.
    expect(errors(input)).toEqual([
      "comp-text-font-axis layers[0].spans[0].style",
    ]);
    input.textStyles!.base!.axes = { wght: 600, opsz: 96 };
    expect(errors(input)).toEqual([]);
  });

  it("still rejects explicit span axes the span's font lacks", () => {
    const input = doc();
    input.textStyles!.amp = {
      fontAsset: "script",
      size: 90,
      axes: { wght: 900 },
    };
    expect(errors(input)).toEqual([
      "comp-text-font-axis textStyles.amp.axes",
      "comp-text-font-axis layers[0].spans[0].style",
    ]);
  });

  it("resolves a span's inherited axes against its font when fonts are known", () => {
    const input = doc();
    const node = input.layers[0] as unknown as TextNode;
    const styles = input.textStyles!;
    const axes = (id: string) =>
      ({ serif: { wght: {}, opsz: {} }, script: {}, narrow: { wght: {} } })[id];
    expect(resolvedTextStyle(node, styles, "amp", axes).axes).toBeUndefined();
    styles.amp = { fontAsset: "narrow", size: 90 };
    expect(resolvedTextStyle(node, styles, "amp", axes).axes).toEqual({
      wght: 900,
    });
    // Without font knowledge the old merge is unchanged.
    expect(resolvedTextStyle(node, styles, "amp").axes).toEqual({
      wght: 900,
      opsz: 96,
    });
    // The base style itself is never filtered.
    expect(resolvedTextStyle(node, styles, undefined, axes).axes).toEqual({
      wght: 900,
      opsz: 96,
    });
  });
});

describe("declaredFontAxes (Phase 1)", () => {
  const lookup = declaredFontAxes([
    font("serif", { wght: [400, 900] }),
    font("script"),
  ]);
  it("reports a variable font's axes, a static font's none, and unknown fonts as undefined", () => {
    expect(Object.keys(lookup!("serif")!)).toEqual(["wght"]);
    expect(lookup!("script")).toEqual({});
    expect(lookup!("missing")).toBeUndefined();
  });
  it("is undefined without fonts", () => {
    expect(declaredFontAxes(undefined)).toBeUndefined();
  });
  it("skips a composition's non-font assets", () => {
    const assets = declaredFontAxes([
      { id: "clip", type: "video" },
      { id: "serif", type: "font", variable: { wght: [400, 900] } },
    ]);
    expect(assets!("clip")).toBeUndefined();
    expect(Object.keys(assets!("serif")!)).toEqual(["wght"]);
  });
});
