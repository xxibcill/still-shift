// ET3 text legibility: pure measurement, mask construction and findings
// (docs/editorial-typography-improvement-plan.md#et3--text-over-video-legibility-checks).
import { describe, expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { contrastRatio } from "../../packages/renderer-core/src/typography-quality.ts";
import {
  decodeWordCode,
  legibilityWords,
  measureTextContrastPixels,
  relativeLuminance,
  textLegibilityBackground,
  textLegibilityMask,
  wcagContrast,
  wordCode,
} from "../../packages/renderer-core/src/composition/text-legibility.ts";
import type { TextContrastLayerEvidence } from "../../packages/renderer-core/src/composition/quality-policy.ts";

const composition = (overrides: Partial<Composition> = {}): Composition =>
  ({
    schemaVersion: "composition-1",
    id: "legibility",
    width: 1080,
    height: 1920,
    fps: 24,
    frameCount: 10,
    background: "#808080",
    assets: [],
    layers: [
      {
        id: "title",
        type: "text",
        text: "three ways  to",
        fontSize: 40,
        color: "#111111",
        textRole: "label",
        transform: { position: [100, 300] },
      },
      {
        id: "plate",
        type: "solid",
        size: [1080, 1920],
        color: "#EEEEEE",
      },
    ],
    ...overrides,
  }) as Composition;

describe("contrast measure", () => {
  it("matches the story contrastRatio formula", () => {
    for (const [a, b] of [
      ["#1E2716", "#E8E8E8"],
      ["#FFFFFF", "#000000"],
      ["#4A5A23", "#C8B48C"],
    ] as const) {
      const lum = (hex: string) =>
        relativeLuminance(
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        );
      expect(wcagContrast(lum(a), lum(b))).toBe(contrastRatio(a, b));
    }
    expect(wcagContrast(relativeLuminance(255, 255, 255), 0)).toBe(21);
  });

  it("codes up to 1024 words and rejects antialiased pixels", () => {
    for (const index of [0, 1, 31, 32, 517, 1023]) {
      const hex = wordCode(index);
      const rgb = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
      expect(decodeWordCode(rgb[0]!, rgb[1]!, rgb[2]!)).toBe(index);
      expect(decodeWordCode(rgb[0]!, rgb[1]! + 2, rgb[2]! - 2)).toBe(index);
      // Half coverage over black halves every channel.
      expect(decodeWordCode(rgb[0]! >> 1, rgb[1]! >> 1, rgb[2]! >> 1)).toBe(-1);
    }
    expect(decodeWordCode(255, 8, 4)).toBe(-1);
    expect(decodeWordCode(251, 4, 4)).toBe(-1);
    expect(decodeWordCode(254, 4, 4)).toBe(0);
    expect(decodeWordCode(0, 0, 0)).toBe(-1);
  });

  it("takes a lower percentile of per-pixel contrast per word", () => {
    // 40 glyph pixels for word 0 (4 over a dark band), 10 for word 1.
    const pixels = 50;
    const front = new Uint8ClampedArray(pixels * 4),
      back = new Uint8ClampedArray(pixels * 4),
      mask = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      front.set([30, 30, 30, 255], i * 4);
      back.set(i < 4 ? [24, 24, 24, 255] : [232, 232, 232, 255], i * 4);
      const code = wordCode(i < 40 ? 0 : 1);
      mask.set(
        [1, 3, 5].map((at) => parseInt(code.slice(at, at + 2), 16)).concat(255),
        i * 4,
      );
    }
    const [word0, word1] = measureTextContrastPixels(
      front,
      back,
      mask,
      2,
      0.05,
    );
    // floor(40 × 0.05) = 2: the third-lowest ratio is still over the band.
    expect(word0![1]).toBe(40);
    expect(word0![0]).toBeCloseTo(contrastRatio("#1E1E1E", "#181818"), 10);
    // Fewer than 16 interior pixels: unmeasured.
    expect(word1).toBeNull();
    const [loose] = measureTextContrastPixels(front, back, mask, 2, 0.25);
    expect(loose![0]).toBeCloseTo(contrastRatio("#1E1E1E", "#E8E8E8"), 10);
  });
});

describe("legibility words and masks", () => {
  it("splits on whitespace, in grapheme indices", () => {
    expect(legibilityWords("COURTYARD EDIT · 03")).toEqual([
      { index: 0, word: "COURTYARD", start: 0, end: 9 },
      { index: 1, word: "EDIT", start: 10, end: 14 },
      { index: 2, word: "·", start: 15, end: 16 },
      { index: 3, word: "03", start: 17, end: 19 },
    ]);
    // Thai has no spaces between words: one segment; graphemes keep marks.
    expect(legibilityWords("3 ลุค", "th")).toEqual([
      { index: 0, word: "3", start: 0, end: 1 },
      { index: 1, word: "ลุค", start: 2, end: 4 },
    ]);
  });

  it("colours each word, keeps span styles and hides other layers", () => {
    const input = composition();
    const text = input.layers[0]! as Extract<
      Composition["layers"][number],
      { type: "text" }
    >;
    text.spans = [{ start: 6, end: 10, style: "bold", color: "#FF0000" }];
    text.decorations = [{ kind: "highlight", color: "#FFFF00" }];
    input.textAnimators = [
      {
        node: "title",
        unit: "glyph",
        start: 0,
        end: 5,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { opacity: 0, color: "#FF00FF" },
      },
    ] as Composition["textAnimators"];
    const { composition: mask, evidence } = textLegibilityMask(input, "title");
    expect(evidence).toEqual({
      attribution: "word",
      words: [
        { index: 0, word: "three" },
        { index: 1, word: "ways" },
        { index: 2, word: "to" },
      ],
    });
    expect(mask.background).toBe("#000000");
    const masked = mask.layers[0] as typeof text;
    expect(masked.spans).toEqual([
      { start: 0, end: 5, color: wordCode(0) },
      { start: 6, end: 10, color: wordCode(1), style: "bold" },
      { start: 12, end: 14, color: wordCode(2) },
    ]);
    expect(masked.decorations).toBeUndefined();
    // Other layers keep their geometry for constraints and paint nothing.
    expect(mask.layers[1]!.enabled).toBeUndefined();
    expect(mask.layers[1]!.transform?.opacity).toBe(0);
    expect(mask.textAnimators![0]!.from).toEqual({ opacity: 0 });
    // The source composition is untouched.
    expect(text.spans[0]!.color).toBe("#FF0000");

    const background = textLegibilityBackground(input, "title");
    const cleared = background.layers[0] as typeof text;
    expect(cleared.color).toBe("#00000000");
    expect(cleared.spans![0]!.color).toBe("#00000000");
    expect(cleared.decorations).toEqual([
      { kind: "highlight", color: "#FFFF00" },
    ]);
    expect(background.layers[1]).toEqual(input.layers[1]);
    expect(background.textAnimators![0]!.from).toEqual({ opacity: 0 });
  });

  it("falls back to whole-layer attribution when words cannot be coded", () => {
    const input = composition();
    (input.layers[0] as { states?: string[] }).states = ["one", "two words"];
    const { evidence } = textLegibilityMask(input, "title");
    expect(evidence.attribution).toBe("layer");
    expect(evidence.attributionReason).toBe(
      "the layer shows more than one text",
    );
    expect(evidence.words).toEqual([{ index: 0, word: "three ways  to" }]);
  });
});

describe("text legibility findings", () => {
  const evidence = (
    values: (number | null)[][],
  ): TextContrastLayerEvidence => ({
    attribution: "word",
    words: [
      { index: 0, word: "three" },
      { index: 1, word: "ways" },
      { index: 2, word: "to" },
    ],
    frames: values.map((words, frame) => ({
      frame,
      words: words.map((value) => (value === null ? null : [value, 200])),
    })),
  });
  const contrast = evidence([
    [9, 9, 9],
    [9, 2, 9],
    [9, 1.5, 3],
    [9, 9, 9],
    [null, null, null],
    [1.2, 9, 9],
    [9, 9, 9],
    [9, 9, 9],
    [9, 9, 9],
    [9, 9, 9],
  ]);

  it("is absent unless textLegibility is declared", () => {
    const report = analyzeCompositionQuality(composition(), {
      textLegibilityEvidence: { contrast: { title: contrast } },
    });
    expect("textLegibility" in report).toBe(false);
    expect(report.diagnostics.some((d) => d.code === "text-contrast")).toBe(
      false,
    );
  });

  it("reports below-target frame ranges, naming the words", () => {
    const report = analyzeCompositionQuality(composition(), {
      textLegibility: {},
      textLegibilityEvidence: {
        contrast: { title: contrast },
        fontXHeights: {},
      },
    });
    const found = report.diagnostics.filter((d) => d.code === "text-contrast");
    expect(found.map((d) => [d.frames, d.measured, d.severity])).toEqual([
      [[1, 2], 1.5, "warning"],
      [[5, 5], 1.2, "warning"],
    ]);
    expect(found[0]!.words).toEqual([
      { word: "ways", index: 1, contrast: 1.5, frame: 2 },
      { word: "to", index: 2, contrast: 3, frame: 2 },
    ]);
    expect(found[0]!.message).toContain('"ways" 1.50:1');
    const layer = report.textLegibility!.layers[0]!;
    expect(layer.measuredFrames).toBe(9);
    expect(layer.worst).toEqual({ contrast: 1.2, frame: 5, word: "three" });
    expect(report.textLegibility!.method.contrastMeasured).toBe(true);
  });

  it("gates with an error severity unless the layer is waived", () => {
    const strict = analyzeCompositionQuality(composition(), {
      textLegibility: {},
      severities: { "text-contrast": "error" },
      textLegibilityEvidence: { contrast: { title: contrast } },
    });
    // The static fixture fails other rules; compare the legibility errors.
    const errors = (report: typeof strict) =>
      report.diagnostics.filter(
        (d) => d.code === "text-contrast" && d.severity === "error",
      ).length;
    expect(errors(strict)).toBe(2);
    const waived = analyzeCompositionQuality(composition(), {
      textLegibility: {
        waivers: [
          { layer: "title", reason: "Decorative", codes: ["text-contrast"] },
        ],
      },
      severities: { "text-contrast": "error" },
      textLegibilityEvidence: { contrast: { title: contrast } },
    });
    expect(errors(waived)).toBe(0);
    const diagnostic = waived.diagnostics.find(
      (d) => d.code === "text-contrast",
    )!;
    expect(diagnostic).toMatchObject({
      severity: "warning",
      rawSeverity: "error",
      classification: "legibility-waiver",
      waiver: { reason: "Decorative" },
    });
    expect(waived.textLegibility!.waivers).toEqual([
      {
        layer: "title",
        reason: "Decorative",
        codes: ["text-contrast"],
        applied: ["text-contrast"],
      },
    ]);
    expect(waived.textLegibility!.layers[0]!.waiver).toEqual({
      reason: "Decorative",
      codes: ["text-contrast"],
    });
  });

  it("checks the x-height at the review width", () => {
    const run = (fontSize: number, reviewWidth?: number) =>
      analyzeCompositionQuality(
        composition({
          assets: [
            {
              id: "mono",
              type: "font",
              path: "mono.ttf",
              sha256: `sha256:${"0".repeat(64)}`,
              weight: "500",
            },
          ] as Composition["assets"],
          layers: [
            {
              ...composition().layers[0]!,
              fontAsset: "mono",
              fontSize,
            } as Composition["layers"][number],
          ],
        }),
        {
          textLegibility: reviewWidth ? { reviewWidth } : {},
          textLegibilityEvidence: { fontXHeights: { mono: 0.516 } },
        },
      );
    // 32 px × 0.516 = 16.5 px at 1080 → 5.5 px at 360: below the 6 px floor.
    const small = run(32);
    const finding = small.diagnostics.find((d) => d.code === "x-height-floor")!;
    expect(finding.measured).toBe(5.5);
    expect(finding.frames).toEqual([0, 9]);
    expect(small.textLegibility!.layers[0]!.xHeight).toEqual({
      reviewPixels: 5.5,
      outputPixels: 16.51,
      frame: 0,
      fonts: ["mono"],
    });
    expect(small.textLegibility!.limitations).toContain(
      "Text contrast needs rendered pixels; run pixel lint (--pixels true).",
    );
    expect(run(38).diagnostics.some((d) => d.code === "x-height-floor")).toBe(
      false,
    );
    expect(
      run(38, 300).diagnostics.some((d) => d.code === "x-height-floor"),
    ).toBe(true);
  });

  it("reports declared platform UI bands", () => {
    const report = analyzeCompositionQuality(composition(), {
      textLegibility: {
        safeZones: [
          { id: "caption-ui", edge: "bottom", fraction: 0.2 },
          { id: "status", edge: "top", fraction: 0.1 },
        ],
      },
      evaluation: {
        textBounds: { title: [{ left: 0, top: 0, right: 400, bottom: 60 }] },
      },
    });
    const zones = report.diagnostics.filter(
      (d) => d.code === "platform-safe-zone",
    );
    // The title's box spans y 300–360: inside neither band.
    expect(zones).toEqual([]);
    const top = analyzeCompositionQuality(composition(), {
      textLegibility: {
        safeZones: [{ id: "status", edge: "top", fraction: 0.17 }],
      },
      evaluation: {
        textBounds: { title: [{ left: 0, top: 0, right: 400, bottom: 60 }] },
      },
    });
    const found = top.diagnostics.find((d) => d.code === "platform-safe-zone")!;
    expect(found.frames).toEqual([0, 9]);
    expect(found.message).toContain('top UI band "status"');
    expect(found.measured).toBeGreaterThan(0);
  });
});
