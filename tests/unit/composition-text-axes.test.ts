import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";

const doc = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [
    {
      id: "variable",
      type: "font",
      path: "font.ttf",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "400",
      variable: { wght: { min: 100, default: 400, max: 900 } },
    },
  ],
  textStyles: { base: { fontAsset: "variable", axes: { wght: 400 } } },
  layers: [
    {
      id: "title",
      type: "text",
      text: "Hello",
      fontSize: 36,
      color: "#ffffff",
      style: "base",
    },
  ],
  textAnimators: [
    {
      node: "title",
      unit: "glyph",
      start: 0,
      end: 12,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { axes: { wght: 0 } },
    },
  ],
});
const axisError = (input: Composition, path: string) =>
  expect(validateComposition(input)).toMatchObject({
    ok: false,
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: "comp-text-font-axis", path }),
    ]),
  });

describe("composition text animator axes", () => {
  it.each(["from", "to"] as const)("rejects unsupported %s axes", (side) => {
    const input = doc();
    input.textAnimators![0]![side] = { axes: { XXXX: 1 } };
    axisError(input, `textAnimators[0].${side}.axes.XXXX`);
  });
  it.each(["from", "to"] as const)(
    "rejects %s deltas outside the pinned range",
    (side) => {
      const input = doc();
      input.textAnimators![0]![side] = { axes: { wght: 1_000 } };
      axisError(input, `textAnimators[0].${side}.axes.wght`);
    },
  );
  it("uses the font default when the style omits an axis", () => {
    const input = doc();
    delete input.textStyles!.base!.axes;
    input.textAnimators![0]!.from.axes = { wght: -301 };
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it.each([-300, 500])(
    "accepts an exact effective axis boundary (%s)",
    (delta) => {
      const input = doc();
      input.textAnimators![0]!.from.axes = { wght: delta };
      expect(validateComposition(input).ok).toBe(true);
    },
  );
  it("uses a font assigned directly to a text layer", () => {
    const input = doc();
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    delete layer.style;
    layer.fontAsset = "variable";
    input.textAnimators![0]!.from.axes = { wght: 501 };
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("rejects axes without a pinned variable font", () => {
    const input = doc();
    delete input.textStyles!.base!.fontAsset;
    axisError(input, "textAnimators[0].from.axes.wght");
    input.textStyles!.base!.fontAsset = "variable";
    const asset = input.assets[0]!;
    if (asset.type !== "font") throw new Error("font fixture");
    delete asset.variable;
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("validates effective span styles for a global animator", () => {
    const input = doc();
    input.textStyles!.span = { axes: { wght: 800 } };
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.spans = [{ id: "word", start: 0, end: 2, style: "span" }];
    input.textAnimators![0]!.from.axes = { wght: 200 };
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("validates only the selected span's font and base value", () => {
    const input = doc();
    input.textStyles!.span = { fontAsset: "variable", axes: { wght: 400 } };
    input.textStyles!.base = {};
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.spans = [{ id: "word", start: 0, end: 2, style: "span" }];
    input.textAnimators![0]!.span = "word";
    input.textAnimators![0]!.from.axes = { wght: 500 };
    expect(validateComposition(input).ok).toBe(true);
    input.textStyles!.span.axes = { wght: 800 };
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("does not require the base font when styled spans cover all text", () => {
    const input = doc();
    input.textStyles!.base = {};
    input.textStyles!.span = { fontAsset: "variable" };
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.spans = [{ start: 0, end: 5, style: "span" }];
    expect(validateComposition(input).ok).toBe(true);
  });
  it("checks span fonts rather than only the layer font", () => {
    const input = doc();
    input.assets.push({
      id: "static",
      type: "font",
      path: "static.ttf",
      sha256: `sha256:${"1".repeat(64)}`,
      weight: "400",
    });
    input.textStyles!.span = { fontAsset: "static" };
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.spans = [{ start: 0, end: 2, style: "span" }];
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("checks axes inside precomp scopes", () => {
    const input = doc();
    input.precomps = [
      {
        id: "scene",
        width: 100,
        height: 100,
        frameCount: 24,
        layers: input.layers,
        textAnimators: input.textAnimators,
      },
    ];
    input.layers = [{ id: "inset", type: "precomp", comp: "scene" }];
    delete input.textAnimators;
    input.precomps[0]!.textAnimators![0]!.from.axes = { wght: 501 };
    axisError(input, "precomps[0].textAnimators[0].from.axes.wght");
  });
  it("rejects accumulated additive deltas", () => {
    const input = doc();
    const animator = input.textAnimators![0]!;
    animator.from.axes = { wght: 300 };
    animator.blend = "add";
    input.textAnimators!.push({ ...animator });
    axisError(input, "textAnimators[1].from.axes.wght");
  });
  it("allows replacement deltas without adding them", () => {
    const input = doc();
    const animator = input.textAnimators![0]!;
    animator.from.axes = { wght: 300 };
    animator.blend = "replace";
    input.textAnimators!.push({ ...animator });
    expect(validateComposition(input).ok).toBe(true);
  });
  it("validates multiplicative deltas in motion layer order", () => {
    const input = doc();
    const animator = input.textAnimators![0]!;
    animator.from.axes = { wght: 300 };
    input.textAnimators!.unshift({
      ...animator,
      layer: "carrier",
      blend: "multiply",
      from: { axes: { wght: 2 } },
    });
    axisError(input, "textAnimators[0].from.axes.wght");
  });
  it("does not combine animators that target different spans", () => {
    const input = doc();
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("text fixture");
    layer.spans = [
      { id: "first", start: 0, end: 2 },
      { id: "last", start: 2, end: 5 },
    ];
    const animator = input.textAnimators![0]!;
    animator.span = "first";
    animator.blend = "add";
    animator.from.axes = { wght: 300 };
    input.textAnimators!.push({ ...animator, span: "last" });
    expect(validateComposition(input).ok).toBe(true);
  });
  it("bounds easing overshoot, including custom bezier progress", () => {
    for (const easing of ["out-back", { bezier: [0.25, 2, 0.75, 2] }]) {
      const input = doc();
      const animator = input.textAnimators![0]!;
      animator.from.axes = { wght: 0 };
      animator.to = { axes: { wght: 500 } };
      animator.selector.easing = easing as typeof animator.selector.easing;
      axisError(input, "textAnimators[0].to.axes.wght");
    }
  });
  it("accounts for bounded animator weights", () => {
    const input = doc();
    const animator = input.textAnimators![0]!;
    animator.from.axes = { wght: 1_000 };
    animator.weight = [
      { frame: 0, value: 0.25 },
      { frame: 12, value: 0.25 },
    ];
    expect(validateComposition(input).ok).toBe(true);
  });
  it("includes temporal speed overshoot in animator weights", () => {
    const input = doc();
    const animator = input.textAnimators![0]!;
    animator.from.axes = { wght: 100 };
    animator.weight = [
      { frame: 0, value: 0, out: { ease: 0.5, speed: 10 } },
      { frame: 12, value: 0, in: { ease: 0.5 } },
    ];
    axisError(input, "textAnimators[0].from.axes.wght");
  });
});
