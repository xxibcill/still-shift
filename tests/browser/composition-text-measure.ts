// ET6a: `comp measure` text geometry
// (docs/editorial-typography-improvement-plan.md#et6a--text-measurement-command).
//
// Failing-first: each case is one of the ET7a pilot's measurement failures
// (benchmarks/fixtures/editorial-titles/et6a-measure.ts), built once as the
// pilot placed it without measurement and once placed from `comp measure`
// with research/editorial-titles-et7a/layout.ts, with no hand-tuned numbers.
// Both are rendered and read straight from the renderer canvas (before any
// export encoding; tests/helpers/renderer-frame.ts); the guesses miss their
// targets in pixels, the measured placements hit them, and every measured box
// checked agrees with the rendered pixels within TOLERANCE. Also: measure bounds equal
// render-time textBounds on the ET0 fixtures, measuring renders no frames,
// and a cancelled `comp measure` leaves no temporary files.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Composition } from "@still-shift/scene-contract";
import {
  TEXT_EFFECT_VISIBLE_COVERAGE,
  type MeasureBox,
  type TextStateMeasure,
} from "@still-shift/renderer-core";
import {
  lintCompositionFile,
  measureCompositionFile,
  type CompositionMeasureReport,
} from "@still-shift/animation-engine";
import { comp, text } from "@still-shift/motion";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { thai as thaiFonts } from "../../research/editorial-titles-et7a/fonts.ts";
import {
  boxes,
  effects,
  frame,
  leather,
  lockup,
  mainCharacter,
  paper,
  scripts,
} from "../../benchmarks/fixtures/editorial-titles/et6a-measure.ts";
import {
  bottomOf,
  centreOn,
  fitSize,
  highlightOffset,
  measured,
  topAt,
} from "../../research/editorial-titles-et7a/layout.ts";
import {
  editorialFixture,
  lintTemporaryEntries,
} from "../helpers/editorial-video-lint.ts";
import {
  PASS1_TREATMENTS,
  writeFootageFreePass1,
} from "../helpers/editorial-proof-pass1.ts";
import { rendererFrame } from "../helpers/renderer-frame.ts";

const root = resolve(import.meta.dirname, "../..");
/**
 * Measured box edges agree with rendered pixel edges within this many pixels.
 * A rendered edge is the first or last pixel row or column with at least 12%
 * coverage (half-open), so an exact measurement can read up to 1 px outside;
 * Chrome's antialiasing and glyph bounds add the rest (worst seen 1.82 px).
 */
export const TOLERANCE = Number(process.env.ET6A_TOLERANCE ?? 2);
const edgeLog: string[] = [];
const edgeErrors: number[] = [];

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
/** Half-open pixel box [left, right) × [top, bottom) in composition pixels. */
type PixelBox = { left: number; top: number; right: number; bottom: number };

let directory = "";
let count = 0;
const timings: { measureMs: number[]; renders: number } = {
  measureMs: [],
  renders: 0,
};

async function measure(composition: Composition) {
  const path = join(directory, `${composition.id}-${count++}.json`);
  await writeFile(path, JSON.stringify(composition));
  const started = performance.now();
  const report = await measureCompositionFile(path);
  timings.measureMs.push(performance.now() - started);
  return report;
}

/** Render the composition's only frame to PNG and return its RGB pixels. */
async function render(composition: Composition) {
  const input = join(directory, `${composition.id}-${count++}.json`);
  await writeFile(input, JSON.stringify(composition));
  const { width, height, rgb } = await rendererFrame(input);
  assert.deepEqual([width, height], [frame.width, frame.height]);
  timings.renders++;
  return rgb;
}

/**
 * The colour the canvas shows for an authored colour. The canvas holds the
 * authored sRGB bytes exactly; this asserts it, so a colour change would fail
 * here instead of silently moving edges.
 */
function rendered(pixels: Buffer, color: string): Rgb {
  const target = rgb(color);
  for (let i = 0; i < pixels.length; i += 3)
    if (
      pixels[i] === target[0] &&
      pixels[i + 1] === target[1] &&
      pixels[i + 2] === target[2]
    )
      return target;
  assert.fail(`${color} is not drawn exactly anywhere in the frame`);
}

/**
 * Pixels drawn in `color` over `over` (paper by default): on the blend line
 * between the two colours within 24 levels (Euclidean), with at least 12%
 * coverage. Blends of two other colours, such as an antialiased edge between
 * two glyph colours, are not on that line and are not counted.
 */
function pixelBox(
  pixels: Buffer,
  color: string,
  over: string = paper,
  region: PixelBox = {
    left: 0,
    top: 0,
    right: frame.width,
    bottom: frame.height,
  },
): PixelBox | null {
  const c = rendered(pixels, color),
    p = rendered(pixels, over);
  const d = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
  const dd = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
  let box: PixelBox | null = null;
  for (let y = region.top; y < region.bottom; y++)
    for (let x = region.left; x < region.right; x++) {
      const i = (y * frame.width + x) * 3;
      const v = [
        pixels[i]! - p[0],
        pixels[i + 1]! - p[1],
        pixels[i + 2]! - p[2],
      ];
      const a = (v[0]! * d[0]! + v[1]! * d[1]! + v[2]! * d[2]!) / dd;
      if (a < 0.12 || a > 1.2) continue;
      const residual = Math.hypot(
        v[0]! - a * d[0]!,
        v[1]! - a * d[1]!,
        v[2]! - a * d[2]!,
      );
      if (residual > 24) continue;
      box = box
        ? {
            left: Math.min(box.left, x),
            top: Math.min(box.top, y),
            right: Math.max(box.right, x + 1),
            bottom: Math.max(box.bottom, y + 1),
          }
        : { left: x, top: y, right: x + 1, bottom: y + 1 };
    }
  return box;
}

const placed = (b: MeasureBox, origin: { x: number; y: number }) => ({
  left: b.left + origin.x,
  top: b.top + origin.y,
  right: b.right + origin.x,
  bottom: b.bottom + origin.y,
});
type Edges = { left: number; top: number; right: number; bottom: number };
function agrees(
  label: string,
  expected: Edges,
  actual: PixelBox | null,
  sides: (keyof Edges)[] = ["left", "top", "right", "bottom"],
) {
  assert.ok(actual, `${label}: no rendered pixels`);
  for (const side of sides) edgeErrors.push(actual[side] - expected[side]);
  for (const side of sides)
    edgeLog.push(
      `${label} ${side} ${(actual[side] - expected[side]).toFixed(2)}`,
    );
  const misses = sides.flatMap((side) => {
    const error = Math.abs(actual[side] - expected[side]);
    return error > TOLERANCE
      ? [
          `${side} measured ${expected[side].toFixed(2)}, rendered ${actual[side]}`,
        ]
      : [];
  });
  assert.deepEqual(misses, [], `${label}: ${misses.join("; ")}`);
  return Math.max(
    ...sides.map((side) => Math.abs(actual[side] - expected[side])),
  );
}
let worstError = 0;
const agree = (...args: Parameters<typeof agrees>) => {
  worstError = Math.max(worstError, agrees(...args));
};
/** The pixel region within `by` px of a box, clipped to the frame. */
const near = (b: Edges, by = 10): PixelBox => ({
  left: Math.max(0, Math.floor(b.left) - by),
  top: Math.max(0, Math.floor(b.top) - by),
  right: Math.min(frame.width, Math.ceil(b.right) + by),
  bottom: Math.min(frame.height, Math.ceil(b.bottom) + by),
});
/** Compare a measured box with the pixels of `color` near it. */
const agreeAt = (
  label: string,
  expected: Edges,
  pixels: Buffer,
  color: string,
  over = paper,
  sides?: (keyof Edges)[],
) => {
  const actual = pixelBox(pixels, color, over, near(expected));
  agree(label, expected, actual, sides);
  return actual!;
};

/** Largest integer size whose measured ink width is at most `width`. */
async function fitted(
  build: (size: number) => Composition,
  layer: string,
  size: number,
  width: number,
) {
  let state = measured(await measure(build(size)), layer);
  for (;;) {
    const next = fitSize(state, size, width);
    if (next === size && state.ink!.width <= width) break;
    size = Math.min(next, size - (state.ink!.width > width ? 1 : 0));
    state = measured(await measure(build(size)), layer, { size });
    if (state.ink!.width <= width) {
      // Check the next size up does not also fit.
      const up = measured(await measure(build(size + 1)), layer);
      if (up.ink!.width > width) break;
      size++;
      state = up;
    }
  }
  return { size, state };
}

/** a02 / b08: widths the pilot guessed; measured fitting keeps the margin. */
async function verifyWidths() {
  const target = frame.width - 2 * 72;
  const results = [];
  for (const [name, fixture] of [
    ["a02 LEATHER", leather],
    ["b08 main character", mainCharacter],
  ] as const) {
    // Failing-first: the pilot's size and centred origin.
    const guess = await render(
      fixture.build(fixture.guess.size, fixture.guess.at),
    );
    const guessed = pixelBox(guess, fixture.ink)!;
    const guessMargin = Math.min(guessed.left, frame.width - guessed.right);
    // The guess was made to fit the same target; rendered, it misses it.
    assert.ok(
      guessMargin < 72 - TOLERANCE,
      `${name}: the pilot's guess keeps ${guessMargin} px, expected under the 72 px target`,
    );
    // Measured: fit the ink to the target width and centre the ink.
    const { size, state } = await fitted(
      (s) => fixture.build(s, { x: 0, y: 0 }),
      "word",
      fixture.guess.size,
      target,
    );
    const at = { x: centreOn(state, frame.width / 2), y: fixture.guess.at.y };
    const pixels = await render(fixture.build(size, at));
    const actual = pixelBox(pixels, fixture.ink);
    agree(`${name} ink`, placed(state.ink!, at), actual);
    const margin = Math.min(actual!.left, frame.width - actual!.right);
    assert.ok(margin >= 72 - TOLERANCE, `${name}: margin ${margin}`);
    results.push({
      name,
      guess: fixture.guess.size,
      guessInkWidth: guessed.right - guessed.left,
      guessMargin,
      size,
      inkWidth: actual!.right - actual!.left,
      margin,
    });
  }
  return results;
}

/** b02: the highlight offset the pilot guessed, and the measured one. */
async function verifyBoxes() {
  const centreY = (b: PixelBox | Edges) => (b.top + b.bottom) / 2;
  const draft = await measure(boxes.build({ caps: 0, label: 0 }));
  const caps = measured(draft, "caps"),
    label = measured(draft, "label");
  const offsets = {
    caps: highlightOffset(caps, 0, "cap"),
    label: highlightOffset(label, 0, "ink"),
  };
  const origin = { caps: { x: 360, y: 500 }, label: { x: 360, y: 800 } };
  const check = async (o: { caps: number; label: number }) => {
    const pixels = await render(boxes.build(o));
    const capsBox = pixelBox(pixels, boxes.capsBox)!;
    const labelBox = pixelBox(pixels, boxes.labelBox)!;
    return {
      pixels,
      capsBox,
      labelBox,
      caps: centreY(capsBox) - centreY(placed(caps.ink!, origin.caps)),
      label: centreY(labelBox) - centreY(placed(label.ink!, origin.label)),
    };
  };
  const guessed = await check(boxes.guess);
  assert.ok(
    Math.abs(guessed.caps) > 10,
    `b02 guess: box centre ${guessed.caps} px from the caps, expected far off`,
  );
  const good = await check(offsets);
  assert.ok(Math.abs(good.caps) <= TOLERANCE, `caps box off by ${good.caps}`);
  assert.ok(
    Math.abs(good.label) <= TOLERANCE,
    `label box off by ${good.label}`,
  );
  // The measured decoration geometry is what was painted.
  const remeasured = await measure(boxes.build(offsets));
  for (const [layer, box, at] of [
    ["caps", good.capsBox, origin.caps],
    ["label", good.labelBox, origin.label],
  ] as const) {
    const paint = measured(remeasured, layer).decorations[0]!.paint!;
    agree(`${layer} highlight`, placed(paint, at), box);
  }
  // Word boxes: Bebas "THE" stands on the baseline and reaches the cap line.
  const the = caps.words.find((w) => w.text === "THE")!;
  const word = placed(the.ink!, origin.caps);
  agree(
    'Bebas word "THE"',
    {
      ...word,
      top: caps.lines[0]!.capTop + 500,
      bottom: caps.lines[0]!.baseline + 500,
    },
    pixelBox(good.pixels, boxes.caps, boxes.capsBox, {
      left: Math.floor(word.left) - 2,
      right: Math.ceil(word.right) + 2,
      top: 400,
      bottom: 700,
    }),
  );
  return {
    guess: boxes.guess,
    guessedError: { caps: guessed.caps, label: guessed.label },
    offsets,
    error: { caps: good.caps, label: good.label },
  };
}

/** a01-style stack: script over outlined caps at a measured gap. */
async function verifyLockup() {
  const draft = await measure(
    lockup.build({ script: { x: 0, y: 0 }, caps: { x: 0, y: 0 } }),
  );
  const script = measured(draft, "script"),
    caps = measured(draft, "caps");
  type At = Parameters<typeof lockup.build>[0];
  /** Rendered script ink and outline ring, searched near where each was put. */
  const gapOf = (pixels: Buffer, at: At) => {
    const scriptBox = pixelBox(
      pixels,
      lockup.script,
      paper,
      near(placed(script.ink!, at.script)),
    )!;
    const ring = pixelBox(
      pixels,
      lockup.outline,
      paper,
      near(placed(caps.outline!.ink!, at.caps)),
    )!;
    return { script: scriptBox, ring, gap: ring.top - scriptBox.bottom };
  };
  // Failing-first: the pilot's metric stack (caps cap line a gap below the
  // script baseline, both centred on their advance).
  const guessed = gapOf(await render(lockup.build(lockup.guess)), lockup.guess);
  assert.ok(
    Math.abs(guessed.gap - lockup.gap) > TOLERANCE,
    `lockup guess: gap ${guessed.gap} px, expected to miss ${lockup.gap}`,
  );
  const top = 420;
  const at: At = {
    script: { x: centreOn(script, lockup.centre), y: topAt(script, top) },
    caps: { x: 0, y: 0 },
  };
  at.caps = {
    x: centreOn(caps, lockup.centre, "outline"),
    y: topAt(caps, bottomOf(script, at.script.y) + lockup.gap, "outline"),
  };
  const pixels = await render(lockup.build(at));
  const result = gapOf(pixels, at);
  assert.ok(
    Math.abs(result.gap - lockup.gap) <= TOLERANCE,
    `lockup: rendered gap ${result.gap}, measured plan ${lockup.gap}`,
  );
  agree("script ink", placed(script.ink!, at.script), result.script);
  agree("caps outline", placed(caps.outline!.ink!, at.caps), result.ring);
  assert.equal(caps.outline!.strokeWidth, lockup.outlineWidth);
  assert.equal(caps.outline!.extent, lockup.outlineWidth / 2);
  // Caps fill: flat tops sit on the cap line ("IT UP": I, T, U and P).
  agreeAt(
    "caps fill and cap line",
    { ...placed(caps.ink!, at.caps), top: caps.lines[0]!.capTop + at.caps.y },
    pixels,
    lockup.caps,
    lockup.outline,
    ["left", "top", "right"],
  );
  // Both centred on the lockup's centre line.
  const centre = (b: PixelBox) => (b.left + b.right) / 2;
  assert.ok(Math.abs(centre(result.script) - lockup.centre) <= TOLERANCE);
  assert.ok(Math.abs(centre(result.ring) - lockup.centre) <= TOLERANCE);
  return {
    guessGap: guessed.gap,
    guessCentres: [centre(guessed.script), centre(guessed.ring)],
    gap: result.gap,
    centres: [centre(result.script), centre(result.ring)],
  };
}

/** Thai, mixed Thai/English and three-font Latin spans against pixels. */
async function verifyScripts() {
  const draft = await measure(
    scripts.build({
      thai: { x: 0, y: 0 },
      mixed: { x: 0, y: 0 },
      spans: { x: 0, y: 0 },
    }),
  );
  const thai = measured(draft, "thai"),
    mixed = measured(draft, "mixed"),
    spans = measured(draft, "spans");
  // Stack the three lines 60 px apart by ink, centred by ink.
  const at = {
    thai: { x: centreOn(thai, 360), y: topAt(thai, 300) },
    mixed: { x: 0, y: 0 },
    spans: { x: 0, y: 0 },
  };
  at.mixed = {
    x: centreOn(mixed, 360),
    y: topAt(mixed, bottomOf(thai, at.thai.y) + 60),
  };
  at.spans = {
    x: centreOn(spans, 360),
    y: topAt(spans, bottomOf(mixed, at.mixed.y) + 60),
  };
  const pixels = await render(scripts.build(at));
  agreeAt(
    "Thai ink (marks included)",
    placed(thai.ink!, at.thai),
    pixels,
    scripts.thai,
  );
  const spanBox = (state: TextStateMeasure, span: number | null) =>
    state.spans.find((s) => s.span === span)!.lines[0]!.ink!;
  agreeAt(
    "mixed: Thai text",
    placed(spanBox(mixed, null), at.mixed),
    pixels,
    scripts.mixedThai,
  );
  agreeAt(
    "mixed: English span",
    placed(spanBox(mixed, 0), at.mixed),
    pixels,
    scripts.mixedLatin,
  );
  agreeAt(
    "spans: Playfair",
    placed(spanBox(spans, null), at.spans),
    pixels,
    scripts.lace,
  );
  agreeAt(
    "spans: Bodoni ampersand",
    placed(spanBox(spans, 0), at.spans),
    pixels,
    scripts.amp,
  );
  agreeAt(
    "spans: Archivo caps",
    placed(spanBox(spans, 1), at.spans),
    pixels,
    scripts.wide,
  );
  // Each span reports its own font's metrics.
  const fonts = spans.spans.map((s) => s.metrics.fontAsset);
  assert.deepEqual(fonts, ["playfair-italic", "bodoni-italic", "archivo"]);
  assert.deepEqual(
    mixed.spans.map((s) => s.metrics.fontAsset),
    ["kanit-black", "anton"],
  );
  // Archivo caps stand on the baseline and reach their own cap line.
  const wide = spans.spans.find((s) => s.span === 1)!.lines[0]!;
  agreeAt(
    "spans: Archivo cap line and baseline",
    {
      ...placed(wide.ink!, at.spans),
      top: wide.capTop + at.spans.y,
      bottom: spans.lines[0]!.baseline + at.spans.y,
    },
    pixels,
    scripts.wide,
    paper,
    ["top", "bottom"],
  );
  // Thai word units follow Unicode word segmentation of the shaped clusters.
  assert.equal(thai.words.map((w) => w.text).join(""), "แต่งตัวปัง");
  return {
    thaiInk: thai.ink,
    spanFonts: fonts,
  };
}

/**
 * Plan check: `comp measure` bounds equal render-time textBounds exactly, on
 * every ET0 fixture and on footage-free copies of the proof's pass-1
 * treatments (as ET5a used them).
 */
async function verifyRenderBounds() {
  const names = [
    "o1-attach-static",
    "o1-attach-animated",
    "o2-center-origin",
    "o2-center-control",
    "o3-highlight-fade",
    "o3-highlight-fade-with-text",
    "o4-video-pixel-lint",
    "o5-plex-thai",
    "o6-dark-band",
    "p1-thai-marks",
  ];
  const inputs: [string, string][] = [];
  for (const name of names) {
    const { default: composition } = (await import(
      editorialFixture(`${name}.ts`).href
    )) as { default: Composition };
    const json = join(directory, `${name}.json`);
    await writeFile(json, JSON.stringify(composition));
    inputs.push([name, json]);
  }
  for (const name of PASS1_TREATMENTS)
    inputs.push([
      `pass1 ${name}`,
      await writeFootageFreePass1(directory, name),
    ]);
  const compared: string[] = [];
  for (const [name, json] of inputs) {
    const report = await measureCompositionFile(json);
    const lint = await lintCompositionFile(
      json,
      {},
      { pixels: true, collectTextBounds: true },
    );
    for (const layer of report.layers) {
      if (!layer.measured) continue;
      const expected = lint.textBounds![layer.key]!;
      layer.states.forEach((state, i) => {
        const { left, top, right, bottom } = state.motionBounds;
        const bounds = { left, top, right, bottom };
        assert.deepEqual(
          bounds,
          expected[i],
          `${name}/${layer.key}: motionBounds`,
        );
      });
      compared.push(`${name}/${layer.key}`);
    }
  }
  return compared;
}

/** Plan check: 100 copy variants in one measure call; no frame is rendered. */
async function verifyHundredVariants() {
  const words = [
    "lace",
    "LEATHER",
    "fit check",
    "แต่งตัว",
    "OOTD",
    "main character",
    "No. 05",
    "ลุค",
    "brown",
    "IS THE NEW",
  ];
  const composition = comp(
    {
      id: "et6a-hundred",
      ...frame,
      background: paper,
      fontCoverage: "strict",
      assets: [thaiFonts.kanitBlack],
    },
    (c) => {
      for (let i = 0; i < 100; i++)
        c.add(
          text(`${words[i % words.length]} ${i}`, {
            id: `v${i}`,
            fontAsset: "kanit-black",
            fontSize: 40 + (i % 9) * 20,
            color: "#111111",
          })
            .at(360, 640)
            .with({ align: "center", locale: "th" }),
        );
    },
  ) as Composition;
  const path = join(directory, "hundred.json");
  await writeFile(path, JSON.stringify(composition));
  const started = performance.now();
  const report: CompositionMeasureReport = await measureCompositionFile(path);
  const ms = performance.now() - started;
  assert.equal(report.layers.length, 100);
  assert.ok(report.layers.every((l) => l.measured));
  return { layers: 100, ms: Math.round(ms) };
}

/** Effect edges agree with rendered pixels within this many pixels at the stated coverage. */
export const EFFECT_TOLERANCE = 2;

/**
 * Drop shadows (soft, the pilot's zero-offset halo around an outline, hard,
 * and one cast by a text container) and `light.glow`. Glyphs are filled in the background colour, so every
 * changed pixel is the effect's. Two checks per effect: no changed pixel lies
 * outside its conservative `paint` box (the renderer's own bound), and the
 * pixels at TEXT_EFFECT_VISIBLE_COVERAGE or more along the background→effect
 * colour line span its `visible` box within EFFECT_TOLERANCE.
 */
async function verifyEffects() {
  const results: Record<string, unknown> = {};
  let worst = 0;
  for (const [composition, background] of [
    [effects.shadows(), paper],
    [effects.containerShadow(), paper],
    [effects.glow(), effects.night],
  ] as const) {
    const path = join(directory, `${composition.id}.json`);
    await writeFile(path, JSON.stringify(composition));
    const report = await measureCompositionFile(path);
    const { width, height, rgb } = await rendererFrame(path);
    const bg = rgb_(background);
    for (const layer of report.layers) {
      assert.ok(layer.measured, layer.key);
      const state = layer.states[0]!;
      const measuredEffects = state.effects!;
      assert.ok(measuredEffects, `${layer.key}: effects measured`);
      assert.deepEqual(measuredEffects.unmeasured, []);
      assert.equal(measuredEffects.coverage, TEXT_EFFECT_VISIBLE_COVERAGE);
      const [effect] = measuredEffects.list;
      assert.ok(effect && measuredEffects.list.length === 1);
      const origin = { x: layer.origin![0], y: layer.origin![1] };
      const paint = placed(effect.paint, origin);
      const color = rgb_(
        layer.layer === "glow"
          ? effects.glowText
          : effects[layer.layer as "shadow" | "halo" | "hard" | "bubble"],
      );
      const region = near(paint, 30);
      const d = color.map((c, k) => c - bg[k]!);
      const dd = d.reduce((sum, v) => sum + v * v, 0);
      let changed: PixelBox | null = null,
        shown: PixelBox | null = null;
      const grow = (b: PixelBox | null, x: number, y: number) =>
        b
          ? {
              left: Math.min(b.left, x),
              top: Math.min(b.top, y),
              right: Math.max(b.right, x + 1),
              bottom: Math.max(b.bottom, y + 1),
            }
          : { left: x, top: y, right: x + 1, bottom: y + 1 };
      for (let y = region.top; y < Math.min(height, region.bottom); y++)
        for (let x = region.left; x < Math.min(width, region.right); x++) {
          const i = (y * width + x) * 3;
          const v = [
            rgb[i]! - bg[0]!,
            rgb[i + 1]! - bg[1]!,
            rgb[i + 2]! - bg[2]!,
          ];
          if (v.every((c) => c === 0)) continue;
          changed = grow(changed, x, y);
          const a = v.reduce((sum, c, k) => sum + c * d[k]!, 0) / dd;
          if (a >= TEXT_EFFECT_VISIBLE_COVERAGE) shown = grow(shown, x, y);
        }
      assert.ok(changed && shown, `${layer.key}: effect pixels`);
      // Conservative: nothing painted outside the reported paint box.
      for (const side of ["left", "top"] as const)
        assert.ok(
          changed[side] >= Math.floor(paint[side]),
          `${layer.key} paint ${side}`,
        );
      for (const side of ["right", "bottom"] as const)
        assert.ok(
          changed[side] <= Math.ceil(paint[side]),
          `${layer.key} paint ${side}`,
        );
      const visible = placed(effect.visible!, origin);
      for (const side of ["left", "top", "right", "bottom"] as const) {
        const error = Math.abs(shown[side] - visible[side]);
        worst = Math.max(worst, error);
        assert.ok(
          error <= EFFECT_TOLERANCE,
          `${layer.key} visible ${side}: measured ${visible[side].toFixed(2)}, rendered ${shown[side]}`,
        );
      }
      results[layer.key] = {
        effect: effect.effect,
        sigma: effect.sigma,
        strength: Math.round(effect.strength * 1000) / 1000,
        reach: effect.reach,
        visibleReach:
          effect.visibleReach === null
            ? null
            : Math.round(effect.visibleReach * 100) / 100,
      };
      if (layer.layer === "halo") {
        // The halo grows from the outline, not the bare ink.
        assert.deepEqual(measuredEffects.source, state.outline!.ink);
        assert.deepEqual(effect.offset, { min: [0, 0], max: [0, 0] });
      }
      if (layer.layer === "shadow")
        assert.deepEqual(effect.offset, { min: [10, 14], max: [10, 14] });
      if (layer.layer === "hard") assert.equal(effect.visibleReach, 0);
      if (layer.layer === "bubble") {
        // The container encloses the ink, so the shadow grows from it.
        assert.ok(state.container, "bubble: container measured");
        assert.deepEqual(measuredEffects.source, state.container);
      }
    }
  }
  return { layers: results, worst, tolerance: EFFECT_TOLERANCE };
}
const rgb_ = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Plan check: SIGINT during the browser phase leaves no temporary files. */
async function verifyCancellation() {
  const temporary = await mkdtemp(join(tmpdir(), "et6a-measure-signal-"));
  const input = join(directory, "cancel.json");
  await writeFile(
    input,
    JSON.stringify(
      scripts.build({
        thai: { x: 0, y: 0 },
        mixed: { x: 0, y: 0 },
        spans: { x: 0, y: 0 },
      }),
    ),
  );
  try {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(root, "tools/still-shift-cli/src/cli.ts"),
        "comp",
        "measure",
        "--input",
        input,
      ],
      {
        cwd: root,
        detached: true,
        env: { ...process.env, TMPDIR: temporary },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const exited = new Promise<number | null>((done) =>
      child.on("exit", (code) => done(code)),
    );
    const deadline = performance.now() + 120_000;
    for (;;) {
      assert.equal(
        child.exitCode,
        null,
        `measure finished before the browser phase: ${stderr}`,
      );
      const names = await readdir(temporary);
      if (
        names.some((n) => n.startsWith("composition-measure-vite-")) &&
        names.some((n) => n.startsWith("playwright_chromiumdev_profile-"))
      )
        break;
      if (performance.now() > deadline)
        throw new Error("measure never reached the browser phase");
      await delay(10);
    }
    process.kill(-child.pid!, "SIGINT");
    const code = await Promise.race([
      exited,
      delay(60_000).then(() => {
        throw new Error("measure did not exit");
      }),
    ]);
    assert.equal(code, 128 + constants.signals.SIGINT, stderr);
    assert.equal(stdout, "");
    assert.equal(
      (JSON.parse(stderr) as { diagnostics: { code: string }[] })
        .diagnostics[0]!.code,
      "comp-program-aborted",
    );
    const left = (await readdir(temporary)).filter(
      (n) => !n.startsWith("tsx-"),
    );
    assert.deepEqual(left, [], "no temporary files after a cancelled measure");
    assert.deepEqual(await lintTemporaryEntries(temporary), []);
    return "SIGINT: exit 130, no report, temporary folder empty";
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** CLI: a builder program through `comp measure`, and the strict font gate. */
async function verifyCli() {
  const cli = async (args: string[]) => {
    let stdout = "",
      stderr = "";
    const code = await runCli(["comp", "measure", ...args], {
      stdout: (t) => (stdout += t),
      stderr: (t) => (stderr += t),
    });
    return { code, stdout, stderr };
  };
  const input = fileURLToPath(editorialFixture("o5-plex-thai.ts"));
  const legacy = await cli(["--input", input]);
  assert.equal(legacy.code, 0, legacy.stderr);
  const report = JSON.parse(legacy.stdout) as CompositionMeasureReport & {
    source: string;
  };
  assert.equal(report.schemaVersion, "composition-measure-1");
  assert.equal(report.source, "builder");
  assert.equal(report.coordinates, "layer-local");
  // O5 draws Thai with a Latin-only face: strict coverage refuses to measure.
  const strict = await cli(["--input", input, "--font-coverage", "strict"]);
  assert.equal(strict.code, 1);
  assert.equal(strict.stdout, "");
  assert.ok(
    (
      JSON.parse(strict.stderr) as { diagnostics: { code: string }[] }
    ).diagnostics.every((d) => d.code === "font-coverage"),
  );
  // --output writes the report only once measured.
  const outputPath = join(directory, "o5.measure.json");
  const written = await cli(["--input", input, "--output", outputPath]);
  assert.equal(written.code, 0, written.stderr);
  assert.deepEqual(JSON.parse(written.stdout), {
    status: "measured",
    composition: report.composition,
    layers: report.layers.length,
    outputPath,
  });
  assert.deepEqual(
    JSON.parse(await readFile(outputPath, "utf8")),
    JSON.parse(legacy.stdout),
  );
  return { layers: report.layers.length, strictRefused: true, output: true };
}

export async function verifyTextMeasure() {
  directory = await mkdtemp(join(tmpdir(), "et6a-measure-"));
  try {
    const cli = await verifyCli();
    const widths = await verifyWidths();
    const highlight = await verifyBoxes();
    const stacked = await verifyLockup();
    const scriptsResult = await verifyScripts();
    const effectResult = await verifyEffects();
    const bounds = await verifyRenderBounds();
    const hundred = await verifyHundredVariants();
    const cancellation = await verifyCancellation();
    const summary = {
      cli,
      widths,
      highlight,
      stacked,
      scripts: scriptsResult,
      effects: effectResult,
      boundsEqual: bounds,
      hundred,
      cancellation,
      edges: {
        compared: edgeErrors.length,
        within1px: edgeErrors.filter((e) => Math.abs(e) <= 1).length,
        worst: Math.round(worstError * 100) / 100,
        tolerance: TOLERANCE,
      },
      measureMs: timings.measureMs.map(Math.round),
      renders: timings.renders,
    };
    if (process.env.ET6A_EDGES) console.log(edgeLog.join("\n"));
    console.log(`ET6a text measurement: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    if (process.env.ET6A_KEEP) console.log(`kept ${directory}`);
    else await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await verifyTextMeasure();
