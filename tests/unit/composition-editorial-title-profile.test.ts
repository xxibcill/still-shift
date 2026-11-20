// ET6b: the opt-in `editorial-title` lint profile
// (docs/editorial-typography-improvement-plan.md#et6b--editorial-title-lint-profile).
// Pure parts: policy resolution, the D-read reading-motion rule, the
// treated-edge contrast measure and the size-split targets. The rendered
// fixtures are in tests/browser/editorial-titles-phase2.ts.
import { describe, expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import {
  CompositionQualityPolicySchema,
  declaresTextLegibility,
  EDITORIAL_TITLE_PROFILE,
  resolveCompositionQualityPolicy,
  type TextGlyphMotion,
} from "../../packages/renderer-core/src/composition/quality-policy.ts";
import {
  advanceReadingMotion,
  readingMotionFrame,
  type ReadingMotionRun,
} from "../../packages/renderer-core/src/composition/reading-motion.ts";
import {
  measureTreatedTextContrastPixels,
  OCCLUDER_CODE,
  RING_CODE,
  textLegibilityMask,
  treatedEdgeRadius,
  wordCode,
} from "../../packages/renderer-core/src/composition/text-legibility.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { fonts } from "../../benchmarks/fixtures/editorial-titles/shared.ts";

const identity = [1, 0, 0, 1, 0, 0] as const;

function title(extra: Partial<Composition> = {}): Composition {
  return {
    schemaVersion: "composition-1",
    id: "et6b-unit",
    width: 360,
    height: 640,
    fps: 24,
    frameCount: 96,
    assets: [fonts.serif],
    layers: [
      {
        id: "title",
        type: "text",
        text: "Olive",
        fontAsset: "serif",
        fontSize: 80,
        color: "#ffffff",
        textRole: "heading",
        transform: { position: [60, 300] },
      },
    ],
    ...extra,
  } as Composition;
}

describe("policy", () => {
  it("is opt-in: without the profile nothing new resolves", () => {
    const resolved = resolveCompositionQualityPolicy(title(), {});
    expect(resolved.readingMotion).toBeUndefined();
    expect(resolved.textLegibility).toBeUndefined();
    expect(resolved.profile).toBeUndefined();
  });
  it("turns on legibility with the treated-edge measure and size split", () => {
    const resolved = resolveCompositionQualityPolicy(title(), {
      profile: "editorial-title",
    });
    expect(resolved.readingMotion).toEqual(
      EDITORIAL_TITLE_PROFILE.readingMotion,
    );
    expect(resolved.textLegibility).toEqual({
      contrastMethod: "treated-edge",
      display: EDITORIAL_TITLE_PROFILE.textLegibility.display,
    });
    // ET3-D2: the phone floor stays at its default (6 px at 360 px).
    expect(resolved.textLegibility?.minimumXHeight).toBeUndefined();
    expect(resolved.textLegibility?.reviewWidth).toBeUndefined();
  });
  it("keeps declared values over the profile's", () => {
    const resolved = resolveCompositionQualityPolicy(title(), {
      profile: "editorial-title",
      readingMotion: { velocity: 0.5 },
      textLegibility: { display: { contrast: 2.5 }, contrastPercentile: 0.1 },
    });
    expect(resolved.readingMotion).toEqual({
      velocity: 0.5,
      displacement: EDITORIAL_TITLE_PROFILE.readingMotion.displacement,
    });
    expect(resolved.textLegibility?.display).toEqual({
      ...EDITORIAL_TITLE_PROFILE.textLegibility.display,
      contrast: 2.5,
    });
    expect(resolved.textLegibility?.contrastPercentile).toBe(0.1);
  });
  it("lets `none` override a profile saved in the composition (PR #76 review, finding 4)", () => {
    const saved = title({
      metadata: { readingPolicy: { profile: "editorial-title" } },
    } as Partial<Composition>);
    expect(declaresTextLegibility({}, saved.metadata?.readingPolicy)).toBe(
      true,
    );
    expect(resolveCompositionQualityPolicy(saved, {})).toMatchObject({
      profile: "editorial-title",
      readingMotion: EDITORIAL_TITLE_PROFILE.readingMotion,
    });
    expect(
      declaresTextLegibility(
        { profile: "none" },
        saved.metadata?.readingPolicy,
      ),
    ).toBe(false);
    const off = resolveCompositionQualityPolicy(saved, { profile: "none" });
    expect(off.readingMotion).toBeUndefined();
    expect(off.textLegibility).toBeUndefined();
    const report = analyzeCompositionQuality(saved, { profile: "none" });
    expect(report).not.toHaveProperty("profile");
    expect(report).not.toHaveProperty("readingMotion");
  });
  it("rejects unknown profiles", () => {
    expect(
      CompositionQualityPolicySchema.safeParse({ profile: "poster" }).success,
    ).toBe(false);
  });
});

/** Five glyphs of a 40 px cap-height line, as the renderer reports them. */
function glyphs(
  shift: (glyph: number) => [number, number],
  rotation = 0,
): TextGlyphMotion {
  const points: number[] = [];
  for (let glyph = 0; glyph < 5; glyph++) {
    const [dx, dy] = shift(glyph);
    const x = 30 + glyph * 50 + dx,
      y = -20 + dy,
      angle = (rotation * Math.PI) / 180;
    points.push(
      x,
      y,
      x - Math.cos(angle) * 20,
      y - Math.sin(angle) * 20,
      x + Math.cos(angle) * 20,
      y + Math.sin(angle) * 20,
    );
  }
  return { capHeight: 40, points, opacity: 1, blur: 0 };
}
/** Longest run of consecutive readable frames over `frames` frames at 24 fps. */
function longestRun(
  motion: (frame: number) => TextGlyphMotion,
  frames = 48,
  settings: {
    velocity: number;
    displacement: number;
  } = EDITORIAL_TITLE_PROFILE.readingMotion,
) {
  const run: ReadingMotionRun = { reference: [] };
  let current = 0,
    longest = 0;
  for (let frame = 0; frame < frames; frame++) {
    const step = advanceReadingMotion(
      run,
      readingMotionFrame([...identity], 1, motion(frame), 80),
      24,
      settings,
    );
    current = step.readable ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

describe("reading motion (D-read)", () => {
  it("counts a still hold and a gentle one-way drift as reading", () => {
    expect(longestRun(() => glyphs(() => [0, 0]))).toBe(48);
    // T1-like tracking: the outer glyphs open 0.15 letter-heights per second.
    expect(
      longestRun((frame) => glyphs((g) => [((g - 2) * frame) / 16, 0])),
    ).toBe(48);
    // A push of 0.9 letter-heights per second, eased in.
    expect(
      longestRun((frame) =>
        glyphs(() => [0, (-36 * Math.min(frame, 24) ** 2) / 24 ** 2 / 2]),
      ),
    ).toBe(48);
    // A scale-up: every point moves outward from the centre.
    expect(
      longestRun((frame) => glyphs((g) => [(g - 2) * frame * 0.4, 0])),
    ).toBe(48);
  });
  it("does not count fast motion, jitter, back-and-forth or spinning", () => {
    // 2.5 letter-heights per second.
    expect(longestRun((frame) => glyphs(() => [0, -frame * (100 / 24)]))).toBe(
      1,
    );
    // ±3 px on alternate frames: slow on average, but it shakes.
    expect(
      longestRun((frame) => glyphs(() => [0, frame % 2 ? 3 : -3])),
    ).toBeLessThanOrEqual(1);
    // A slow float that turns back every half second.
    expect(
      longestRun((frame) =>
        glyphs(() => [0, 4 * Math.sin((frame / 24) * Math.PI * 2)]),
      ),
    ).toBeLessThan(24);
    // A quarter turn per second about the centre glyph.
    expect(
      longestRun((frame) => {
        const angle = (frame * 90) / 24;
        const a = (angle * Math.PI) / 180;
        return glyphs(
          (g) => [(g - 2) * 50 * (Math.cos(a) - 1), (g - 2) * 50 * Math.sin(a)],
          angle,
        );
      }),
    ).toBeLessThan(24);
  });
  it("limits travel within one run to the displacement budget", () => {
    // 0.9 letter-heights per second for two seconds: 1.8 letter-heights.
    const drift = (frame: number) => glyphs(() => [0, -frame * 1.5]);
    expect(longestRun(drift, 48)).toBe(48);
    expect(
      longestRun(drift, 48, { velocity: 1, displacement: 1 }),
    ).toBeLessThan(28);
  });
  it("ends a run while glyphs blur", () => {
    const run: ReadingMotionRun = { reference: [] };
    const blurred = { ...glyphs(() => [0, 0]), blur: 2 };
    expect(
      advanceReadingMotion(
        run,
        readingMotionFrame([...identity], 1, blurred, 80),
        24,
        EDITORIAL_TITLE_PROFILE.readingMotion,
      ),
    ).toMatchObject({ readable: false, ended: "blur" });
  });
});

describe("reading time under the profile", () => {
  /** A held title whose text animator changes through the hold (O7). */
  const held = title({
    textAnimators: [
      {
        node: "title",
        unit: "glyph",
        start: 0,
        end: 18,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { opacity: 0 },
        layer: "action",
      },
      {
        node: "title",
        unit: "glyph",
        start: 18,
        end: 96,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { tracking: 0 },
        to: { tracking: 25 },
        layer: "current",
      },
    ],
  });
  const readingTime = (
    policy: Parameters<typeof analyzeCompositionQuality>[1],
  ) =>
    analyzeCompositionQuality(held, policy).diagnostics.filter(
      (d) => d.code === "reading-time",
    );
  const evidence = (motion: (time: number) => TextGlyphMotion) => ({
    textFramingEvidence: {
      glyphMotion: ({ time }: { time: number }) => motion(time),
    },
  });
  it("fails gentle hold drift by default and passes it under the profile", () => {
    const gentle = evidence((time) =>
      glyphs((g) => [((g - 2) * Math.max(0, time - 18)) / 20, 0]),
    );
    expect(readingTime(gentle)).toHaveLength(1);
    expect(readingTime({ ...gentle, profile: "editorial-title" })).toEqual([]);
  });
  it("still fails a fast or shaking hold under the profile", () => {
    for (const motion of [
      (time: number) => glyphs(() => [0, -Math.max(0, time - 18) * 5]),
      (time: number) => glyphs(() => [0, time % 2 ? 3 : -3]),
    ])
      expect(
        readingTime({ ...evidence(motion), profile: "editorial-title" }),
      ).toHaveLength(1);
  });
  it("keeps the text-clock rule when glyph motion is not measured", () => {
    const report = analyzeCompositionQuality(held, {
      profile: "editorial-title",
    });
    const finding = report.diagnostics.find((d) => d.code === "reading-time");
    expect(finding?.message).toMatch(/Glyph motion was not measured/);
    expect(report).toMatchObject({
      profile: "editorial-title",
      readingMotion: {
        velocity: EDITORIAL_TITLE_PROFILE.readingMotion.velocity,
        windows: [expect.objectContaining({ layer: "title", glyphs: false })],
      },
    });
  });
  it("leaves the default report without profile sections", () => {
    const report = analyzeCompositionQuality(held, {});
    expect(report).not.toHaveProperty("profile");
    expect(report).not.toHaveProperty("readingMotion");
  });
});

/** RGBA buffer helpers for the treated-edge measure. */
function canvas(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}
function paint(
  data: Uint8ClampedArray,
  width: number,
  inside: (x: number, y: number) => boolean,
  rgb: [number, number, number],
) {
  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4,
      x = pixel % width,
      y = (pixel - x) / width;
    if (!inside(x, y)) continue;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
}
const hex = (code: string): [number, number, number] => [
  parseInt(code.slice(1, 3), 16),
  parseInt(code.slice(3, 5), 16),
  parseInt(code.slice(5, 7), 16),
];
/** A 40×40 "letter" (square) at (30, 30) on a 100×100 frame. */
const letter = (x: number, y: number) => x >= 30 && x < 70 && y >= 30 && y < 70;
const ring = (width: number) => (x: number, y: number) =>
  !letter(x, y) &&
  x >= 30 - width &&
  x < 70 + width &&
  y >= 30 - width &&
  y < 70 + width;

function treated(options: {
  footage: [number, number, number];
  fill: [number, number, number] | "footage";
  ring?: { width: number; rgb: [number, number, number] };
  halo?: [number, number, number];
}) {
  const size = 100;
  const front = canvas(size, size, options.footage);
  const mask = canvas(size, size, [0, 0, 0]);
  if (options.halo) paint(front, size, (x, y) => ring(6)(x, y), options.halo);
  if (options.ring) {
    paint(front, size, ring(options.ring.width), options.ring.rgb);
    paint(mask, size, ring(options.ring.width), hex(RING_CODE));
  }
  if (options.fill !== "footage") paint(front, size, letter, options.fill);
  paint(mask, size, letter, hex(wordCode(0)));
  const [value] = measureTreatedTextContrastPixels(
    front,
    mask,
    size,
    size,
    1,
    0.05,
    treatedEdgeRadius(1080, 360),
  );
  return value!;
}

describe("treated-edge contrast", () => {
  const white: [number, number, number] = [255, 255, 255],
    black: [number, number, number] = [17, 17, 17],
    bright: [number, number, number] = [232, 232, 232];
  it("fails untreated text over similar footage", () => {
    const [combined, , fill, outer] = treated({ footage: bright, fill: white });
    expect(combined).toBeLessThan(1.3);
    expect(fill).toBe(combined);
    expect(outer).toBeNull();
  });
  it("credits an outline ring against the fill", () => {
    const [combined, , fill] = treated({
      footage: bright,
      fill: white,
      ring: { width: 7, rgb: black },
    });
    expect(fill).toBeGreaterThan(15);
    expect(combined).toBe(fill);
  });
  it("gives a ring thinner than a phone pixel little credit", () => {
    const thin = treated({
      footage: bright,
      fill: white,
      ring: { width: 1, rgb: black },
    })[0];
    const thick = treated({
      footage: bright,
      fill: white,
      ring: { width: 7, rgb: black },
    })[0];
    expect(thin).toBeLessThan(thick / 3);
  });
  it("credits a dark halo around the letter", () => {
    const [combined] = treated({
      footage: bright,
      fill: white,
      halo: [60, 20, 30],
    });
    expect(combined).toBeGreaterThan(5);
  });
  it("credits an outlined (hollow) letter by its outer edge", () => {
    const [combined, , fill, outer] = treated({
      footage: bright,
      fill: "footage",
      ring: { width: 7, rgb: black },
    });
    expect(outer).toBeGreaterThan(5);
    expect(combined).toBe(outer);
    expect(fill).toBeGreaterThan(5);
  });
  it("does not credit a ring that matches the footage", () => {
    const [combined] = treated({
      footage: black,
      fill: [40, 40, 40],
      ring: { width: 7, rgb: black },
    });
    expect(combined).toBeLessThan(1.5);
  });
  it("leaves out the parts a text layer stacked above covers", () => {
    const size = 100;
    // White letter over bright footage, no treatment: about 1.2:1 at its
    // edges. Another layer covers its top half with a dark word.
    const front = canvas(size, size, [232, 232, 232]);
    const mask = canvas(size, size, [0, 0, 0]);
    paint(front, size, letter, [255, 255, 255]);
    paint(mask, size, letter, hex(wordCode(0)));
    const covered = (x: number, y: number) =>
      x >= 20 && x < 80 && y >= 20 && y < 50;
    paint(front, size, covered, [20, 20, 20]);
    const radius = treatedEdgeRadius(1080, 360);
    // Without occluders the dark word reads as a treatment of the letter.
    const [hidden] = measureTreatedTextContrastPixels(
      front,
      mask,
      size,
      size,
      1,
      0.05,
      radius,
    );
    paint(mask, size, covered, hex(OCCLUDER_CODE));
    const [shown] = measureTreatedTextContrastPixels(
      front,
      mask,
      size,
      size,
      1,
      0.05,
      radius,
    );
    expect(shown![0]).toBeLessThan(1.3);
    expect(shown![1]).toBeLessThan(hidden![1]);
  });
  it("draws text layers stacked above as occluders in the ring mask", () => {
    const comp = title({
      layers: [
        {
          id: "over",
          type: "text",
          text: "layer",
          fontAsset: "serif",
          fontSize: 80,
          color: "#B3123A",
          effects: [
            {
              id: "halo",
              effect: "light.drop-shadow",
              params: { blur: 8 },
            },
          ],
        },
        ...title().layers,
      ] as Composition["layers"],
    });
    const ringed = textLegibilityMask(comp, "title", {
      ring: true,
    }).composition;
    const over = ringed.layers.find((layer) => layer.id === "over")!;
    expect(over).toMatchObject({ color: OCCLUDER_CODE });
    expect(over).not.toHaveProperty("effects");
    const plain = textLegibilityMask(comp, "title").composition;
    expect(plain.layers[0]!.transform?.opacity).toBe(0);
  });
  it("keeps strokes as the ring colour in the ring mask only", () => {
    const comp = title({
      textAnimators: [
        {
          node: "title",
          unit: "line",
          start: 0,
          end: 1,
          stagger: 0,
          selector: { start: 0, end: 1 },
          from: { stroke: "#111111", strokeWidth: 14 },
          to: { stroke: "#111111", strokeWidth: 14 },
        },
      ],
    });
    const plain = textLegibilityMask(comp, "title").composition;
    const ringed = textLegibilityMask(comp, "title", {
      ring: true,
    }).composition;
    expect(plain.textAnimators![0]!.from).toEqual({ strokeWidth: 14 });
    expect(ringed.textAnimators![0]!.from).toEqual({
      strokeWidth: 14,
      stroke: RING_CODE,
    });
  });
});

describe("size-split contrast (ET3-D1)", () => {
  const evidence = (contrast: number) => ({
    attribution: "word" as const,
    words: [{ index: 0, word: "Olive" }],
    frames: Array.from({ length: 96 }, (_, frame) => ({
      frame,
      words: [
        [contrast, 400, contrast, null] as [number, number, number, null],
      ],
    })),
  });
  const lint = (fontSize: number, contrast: number) =>
    analyzeCompositionQuality(
      title({
        layers: [
          {
            id: "title",
            type: "text",
            text: "Olive",
            fontAsset: "serif",
            fontSize,
            color: "#ffffff",
            textRole: "label",
            transform: { position: [60, 300] },
          },
        ] as Composition["layers"],
      }),
      {
        profile: "editorial-title",
        textLegibilityEvidence: { contrast: { title: evidence(contrast) } },
      },
    );
  it("holds small text to 4.5:1 and display text to the display level", () => {
    const display = EDITORIAL_TITLE_PROFILE.textLegibility.display;
    // 360 px wide, reviewed at 360: font size in review pixels is the size.
    const small = lint(display.minimumSize - 4, 4);
    expect(small.textLegibility?.layers[0]).toMatchObject({
      sizeClass: "small",
      contrastTarget: 4.5,
    });
    expect(small.diagnostics.map((d) => d.code)).toContain("text-contrast");
    const large = lint(display.minimumSize + 40, display.contrast + 0.1);
    expect(large.textLegibility?.layers[0]).toMatchObject({
      sizeClass: "display",
      contrastTarget: display.contrast,
    });
    expect(large.diagnostics.map((d) => d.code)).not.toContain("text-contrast");
    expect(
      lint(display.minimumSize + 40, display.contrast - 0.1).diagnostics.map(
        (d) => d.code,
      ),
    ).toContain("text-contrast");
  });
});

describe("outline-only text reading (PR #76 review, finding 1)", () => {
  const bounds = { title: [{ left: 0, top: -40, right: 300, bottom: 10 }] };
  /** A transparent-fill title whose only stroke animator is `animator`. */
  const hollow = (
    animator: Partial<NonNullable<Composition["textAnimators"]>[number]>,
  ) =>
    title({
      layers: [
        {
          id: "title",
          type: "text",
          text: "Olive grove at dusk",
          fontAsset: "serif",
          fontSize: 40,
          color: "#FFFFFF00",
          textRole: "heading",
          transform: { position: [20, 300] },
        },
      ] as Composition["layers"],
      textAnimators: [
        {
          node: "title",
          unit: "glyph",
          start: 0,
          end: 1,
          stagger: 0,
          selector: { start: 0, end: 1 },
          from: { stroke: "#000000", strokeWidth: 6 },
          to: { stroke: "#000000", strokeWidth: 6 },
          layer: "action",
          ...animator,
        } as NonNullable<Composition["textAnimators"]>[number],
      ],
    });
  const lint = (
    comp: Composition,
    extra: Parameters<typeof analyzeCompositionQuality>[1] = {},
  ) => {
    const report = analyzeCompositionQuality(comp, {
      profile: "editorial-title",
      evaluation: { textBounds: bounds },
      ...extra,
    });
    return {
      readable: report.readingMotion?.windows[0]?.readableSeconds ?? 0,
      failed: report.diagnostics.some((d) => d.code === "reading-time"),
    };
  };
  it("reads a held outline from its first frame", () => {
    expect(lint(hollow({}))).toEqual({ readable: 4, failed: false });
  });
  it("does not read the frames before a stroke is drawn", () => {
    // The stroke appears at frame 90 of 96: 0.25 s of 1.33 s needed.
    const late = lint(hollow({ start: 90, end: 91, from: { strokeWidth: 0 } }));
    expect(late.readable).toBeLessThanOrEqual(0.25);
    expect(late.failed).toBe(true);
  });
  it("does not read a stroke that only part of the selector reaches", () => {
    expect(lint(hollow({ selector: { start: 0, end: 0.5 } })).readable).toBe(0);
  });
  it("follows the stroke drawn on each frame when pixel lint measures it", () => {
    const measured = lint(hollow({}), {
      textFramingEvidence: {
        glyphMotion: ({ time }: { time: number }) => ({
          ...glyphs(() => [0, 0]),
          strokeWidth: time < 48 ? 0 : 4,
        }),
      },
    } as Parameters<typeof analyzeCompositionQuality>[1]);
    expect(measured.readable).toBe(2);
  });
});

describe("one condition reads outline-only text (PR #76 review, finding 2)", () => {
  /** A transparent-fill title stroked from frame 91 of 96 (0 at frame 90). */
  const late = title({
    layers: [
      {
        id: "title",
        type: "text",
        text: "Olive grove at dusk",
        fontAsset: "serif",
        fontSize: 40,
        color: "#FFFFFF00",
        textRole: "heading",
        transform: { position: [20, 300] },
      },
    ] as Composition["layers"],
    textAnimators: [
      {
        node: "title",
        unit: "glyph",
        start: 90,
        end: 91,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { strokeWidth: 0 },
        to: { stroke: "#000000", strokeWidth: 6 },
        layer: "action",
      },
    ],
  });
  const evaluation = {
    textBounds: { title: [{ left: 0, top: -40, right: 300, bottom: 10 }] },
  };
  it("reads it for reading time and legibility under treated-edge alone", () => {
    const report = analyzeCompositionQuality(late, {
      evaluation,
      textLegibility: { contrastMethod: "treated-edge" },
    });
    expect(report.textLegibility?.layers[0]?.readingFrames).toBe(5);
    expect(report.diagnostics.map((d) => d.code)).toContain("reading-time");
  });
  it("does not read it for reading time under reading motion alone", () => {
    const report = analyzeCompositionQuality(late, {
      evaluation,
      readingMotion: { velocity: 1 },
    });
    expect(report.readingMotion?.windows).toEqual([]);
  });
});

describe("hollow occluders (PR #76 review, finding 3)", () => {
  it("keeps a stacked layer's fill alpha in the ring mask", () => {
    const comp = title({
      layers: [
        {
          id: "over",
          type: "text",
          text: "layer",
          fontAsset: "serif",
          fontSize: 80,
          color: "#FFFFFF00",
          spans: [{ id: "a", start: 0, end: 2, color: "#B3123A" }],
        },
        {
          id: "keyed",
          type: "text",
          text: "keyed",
          fontAsset: "serif",
          fontSize: 80,
          color: {
            keys: [
              { frame: 0, value: "#FFFFFF" },
              { frame: 10, value: "#FFFFFF00" },
            ],
          },
        },
        ...title().layers,
      ] as Composition["layers"],
      textAnimators: [
        {
          node: "over",
          unit: "glyph",
          start: 0,
          end: 1,
          stagger: 0,
          selector: { start: 0, end: 1 },
          from: { stroke: "#000000", strokeWidth: 6 },
          to: { stroke: "#000000", strokeWidth: 6 },
          layer: "action",
        },
      ],
    });
    const ringed = textLegibilityMask(comp, "title", {
      ring: true,
    }).composition;
    const over = ringed.layers.find((layer) => layer.id === "over")!;
    expect(over).toMatchObject({
      color: `${OCCLUDER_CODE}00`,
      spans: [{ color: OCCLUDER_CODE }],
    });
    expect(
      ringed.textAnimators!.find((animator) => animator.node === "over")!.from,
    ).toMatchObject({ stroke: OCCLUDER_CODE, strokeWidth: 6 });
    expect(ringed.layers.find((layer) => layer.id === "keyed")!).toMatchObject({
      color: {
        keys: [{ value: OCCLUDER_CODE }, { value: `${OCCLUDER_CODE}00` }],
      },
    });
  });
});
