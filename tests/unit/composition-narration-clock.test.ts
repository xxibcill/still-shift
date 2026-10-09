import { describe, expect, it } from "vitest";
import {
  CompositionPcmClock,
  CompositionSchema,
  compositionPcmBoundary,
  compositionProtectedNarration,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";

const narration = (fps: number, frameCount = 5): Composition => ({
  schemaVersion: "composition-1",
  id: "voiceClock",
  width: 160,
  height: 80,
  fps,
  frameCount,
  assets: [
    {
      id: "pcm",
      type: "audio",
      path: "voice.wav",
      sha256: `sha256:${"0".repeat(64)}`,
      sampleRate: 48000,
      sampleCount: compositionPcmBoundary(frameCount, fps),
      channels: 1,
    },
  ],
  layers: [{ id: "voice", type: "audio", asset: "pcm", role: "narration" }],
});
const codes = (doc: Composition) =>
  validateComposition(doc).diagnostics.map((diagnostic) => diagnostic.code);

const source = (doc: Composition) => {
  const asset = doc.assets[0]!;
  if (asset.type !== "audio") throw Error("Expected the PCM fixture");
  return asset;
};

describe("absolute PCM placement", () => {
  it("rounds combined frame offsets once and preserves signed boundaries", () => {
    const origin = new CompositionPcmClock();
    const placed = origin.place(1, 29);
    expect(origin.sample).toBe(0);
    expect(placed.sample).toBe(1656);
    expect(placed.place(1, 59).sample).toBe(2469);
    expect(origin.place(-1, 29).sample).toBe(-1655);
    expect(origin.place(-1, 29).place(1, 29).sample).toBe(0);
    expect(origin.place(7, 7).sample).toBe(48000);
  });

  it("retains rational fractions smaller than Q16 and floating-point precision", () => {
    // These authored offsets sum to 48000 / 6685349671 PCM samples.
    const offsets = [
      [2, 7],
      [7, 11],
      [1, 13],
      [11, 17],
      [13, 19],
      [1, 23],
      [6, 29],
      [13, 31],
      [-3, 1],
    ] as const;
    const positive = offsets.reduce(
      (clock, [frame, fps]) => clock.place(frame, fps),
      new CompositionPcmClock(),
    );
    const negative = offsets.reduce(
      (clock, [frame, fps]) => clock.place(-frame, fps),
      new CompositionPcmClock(),
    );
    expect(positive.sample).toBe(1);
    expect(negative.sample).toBe(0);
    expect(positive.place(2_000_000, 1).sample).toBe(96_000_000_001);
  });

  it.each([
    [0.5, 29],
    [1, 0],
    [1, 29.5],
    [Number.POSITIVE_INFINITY, 29],
  ])("rejects an invalid placement %s / %s", (frame, fps) => {
    expect(() => new CompositionPcmClock().place(frame, fps)).toThrow(
      "PCM placement requires",
    );
  });
});

describe("protected narration PCM windows", () => {
  it.each([1, 7, 24, 25, 29, 30, 50, 59, 60])(
    "accepts the complete sample interval at %i fps and rejects one extra sample",
    (fps) => {
      const doc = narration(fps);
      expect(CompositionSchema.safeParse(doc).success).toBe(true);
      expect(compositionProtectedNarration(doc)[0]).toMatchObject({
        startSample: 0,
        sourceStartSample: 0,
        sourceEndSample: compositionPcmBoundary(5, fps),
      });
      source(doc).sampleCount++;
      expect(codes(doc)).toContain("comp-media-narration-range");
      const layer = doc.layers[0]!;
      if (layer.type !== "audio") throw Error("Expected the voice fixture");
      layer.sourceEndSample = source(doc).sampleCount - 1;
      expect(validateComposition(doc).ok).toBe(true);
    },
  );

  it("uses the same discrete layer and inherited group windows without a crop bypass", () => {
    const doc = narration(29);
    source(doc).sampleCount = 3310;
    doc.layers = [
      { id: "window", type: "group", size: [160, 80], inPoint: 1, outPoint: 3 },
      {
        id: "voice",
        type: "audio",
        asset: "pcm",
        role: "narration",
        parent: "window",
        startFrame: 1,
        inPoint: 1,
        outPoint: 3,
      },
    ];
    expect(validateComposition(doc).ok).toBe(true);
    expect(compositionProtectedNarration(doc)[0]!.startSample).toBe(1656);
    doc.layers[0]!.outPoint = 2;
    doc.layers[1]!.enabled = false;
    expect(codes(doc)).toContain("comp-media-narration-range");
    doc.layers[0]!.outPoint = 3;
    doc.layers[1]!.outPoint = 2;
    expect(codes(doc)).toContain("comp-media-narration-range");
    doc.layers[1]!.outPoint = 3;
    doc.layers[0]!.inPoint = 2;
    expect(codes(doc)).toContain("comp-media-narration-range");
  });

  it("accumulates exact origins across different scope rates before rounding their windows", () => {
    const doc = narration(29, 30);
    source(doc).sampleCount = 6858;
    doc.layers = [
      { id: "host", type: "precomp", comp: "outer", startFrame: 1 },
    ];
    doc.precomps = [
      {
        id: "outer",
        width: 160,
        height: 80,
        fps: 59,
        frameCount: 40,
        layers: [
          { id: "innerHost", type: "precomp", comp: "inner", startFrame: 1 },
        ],
      },
      {
        id: "inner",
        width: 160,
        height: 80,
        fps: 7,
        frameCount: 4,
        layers: [
          {
            id: "window",
            type: "group",
            size: [160, 80],
            inPoint: 1,
            outPoint: 2,
          },
          {
            id: "voice",
            type: "audio",
            asset: "pcm",
            role: "narration",
            parent: "window",
            startFrame: 1,
          },
        ],
      },
    ];
    expect(validateComposition(doc).ok).toBe(true);
    expect(compositionProtectedNarration(doc)[0]).toMatchObject({
      key: "host/innerHost/voice",
      startSample: 9326,
      sourceEndSample: 6858,
    });
    source(doc).sampleCount++;
    expect(codes(doc)).toContain("comp-media-narration-range");
    source(doc).sampleCount--;
    doc.precomps[0]!.layers[0]!.stretch = 2;
    expect(codes(doc)).toContain("comp-media-narration-clock");
    delete doc.precomps[0]!.layers[0]!.stretch;
    doc.layers[0]!.outPoint = 3;
    expect(codes(doc)).toContain("comp-media-narration-range");
  });

  it("rejects narration placed before the root even when its source is explicitly trimmed", () => {
    const doc = narration(29);
    source(doc).sampleCount = 32;
    const layer = doc.layers[0]!;
    if (layer.type !== "audio") throw Error("Expected the voice fixture");
    layer.startFrame = -1;
    layer.sourceStartSample = 16;
    expect(codes(doc)).toContain("comp-media-narration-range");
  });
});
