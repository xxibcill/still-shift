// Editorial titles Phase 1: the ET7a small fixes, checked in the pinned
// browser (docs/editorial-typography-improvement-plan.md#remaining-phases-2026-11-20).
//
// Each case is one of the pilot's small gaps
// (benchmarks/fixtures/editorial-titles/phase1-fixes.ts), rendered and read
// straight from the renderer canvas (tests/helpers/renderer-frame.ts).
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { measureCompositionFile } from "@still-shift/animation-engine";
import {
  colouredGlow,
  frame,
  paddedBox,
  spanAxes,
  typedHighlight,
} from "../../benchmarks/fixtures/editorial-titles/phase1-fixes.ts";
import { measured } from "../../research/editorial-titles-et7a/layout.ts";
import { rendererFrame } from "../helpers/renderer-frame.ts";

let directory = "";
let count = 0;
async function write(composition: Composition) {
  const path = join(directory, `${composition.id}-${count++}.json`);
  await writeFile(path, JSON.stringify(composition));
  return path;
}
const render = async (
  composition: Composition,
  frameIndex = 0,
  backend: "canvas2d" | "webgl2" = "canvas2d",
) => rendererFrame(await write(composition), frameIndex, backend);
const measure = async (composition: Composition) =>
  measureCompositionFile(await write(composition));

type Box = { left: number; top: number; right: number; bottom: number };
const rgbOf = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Half-open box of pixels within `distance` (Euclidean RGB) of `color`. */
function colourBox(pixels: Buffer, color: string, distance = 30): Box | null {
  const [r, g, b] = rgbOf(color) as [number, number, number];
  let box: Box | null = null;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 3;
      if (
        Math.hypot(pixels[i]! - r, pixels[i + 1]! - g, pixels[i + 2]! - b) >
        distance
      )
        continue;
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

/**
 * `growWithText`: a highlight under a glyph-by-glyph build covers only the
 * glyphs revealed so far. Mid-typing its right edge sits just past the last
 * opaque glyph (within the next glyph's advance); without it the box spans
 * the whole label (the ET7a b06 symptom). Fully typed, and with no
 * animator, it renders exactly as before.
 */
async function verifyTypedHighlight() {
  const { typing, box, ink } = typedHighlight;
  // Glyphs 0–1 opaque, glyph 2 fading in, glyphs 3–5 not started.
  const mid = typing.start + 2 * typing.stagger + 1;
  const measureMid = async (grow: boolean) => {
    const { rgb } = await render(typedHighlight.build(grow), mid);
    const highlight = colourBox(rgb, box);
    const opaque = colourBox(rgb, ink, 60);
    assert.ok(highlight && opaque, "typed highlight: box and ink drawn");
    return { highlight, opaque, past: highlight.right - opaque.right };
  };
  const full = colourBox(
    (await render(typedHighlight.build(false), typedHighlight.frames - 1)).rgb,
    box,
  )!;
  const grown = await measureMid(true);
  const fixed = await measureMid(false);
  // One Bebas glyph advance at 120 px plus tracking is under 0.6 em.
  const limit = 0.6 * 120;
  assert.ok(
    grown.past >= 0 && grown.past <= limit,
    `typed highlight: grown box ends ${grown.past} px past the opaque glyphs (limit ${limit})`,
  );
  assert.ok(
    fixed.past > limit,
    `typed highlight: without growWithText the box ends ${fixed.past} px past them`,
  );
  assert.equal(fixed.highlight.right, full.right);
  assert.equal(grown.highlight.left, full.left);
  const last = typedHighlight.frames - 1;
  for (const [label, a, b] of [
    [
      "fully typed",
      await render(typedHighlight.build(true), last),
      await render(typedHighlight.build(false), last),
    ],
    [
      "no animator",
      await render(typedHighlight.build(true, { animate: false })),
      await render(typedHighlight.build(false, { animate: false })),
    ],
  ] as const)
    assert.ok(a.rgb.equals(b.rgb), `typed highlight: ${label} is unchanged`);
  return {
    frame: mid,
    pastOpaqueInk: { growWithText: grown.past, without: fixed.past },
    fullBox: full,
  };
}

/**
 * `padding` on highlight and box decorations: `comp measure` reports the
 * padded paint box, it grows by exactly the padding, and the rendered box
 * agrees with it within 2 px per edge. Without padding the render is
 * unchanged.
 */
async function verifyPadding() {
  const paint = async (composition: Composition) => {
    const report = await measure(composition);
    const entry = report.layers.find((l) => l.key === "tag")!;
    assert.ok(entry.measured && entry.origin, "padded box: measured layer");
    const box = measured(report, "tag").decorations[0]!.paint!;
    const [x, y] = entry.origin;
    return {
      left: box.left + x,
      top: box.top + y,
      right: box.right + x,
      bottom: box.bottom + y,
    };
  };
  const results: Record<string, unknown> = {};
  for (const [kind, value, sides] of [
    ["highlight", [6, 18], [6, 18, 6, 18]],
    ["highlight", [2, 24, 10, 12], [2, 24, 10, 12]],
    ["box", 14, [14, 14, 14, 14]],
  ] as const) {
    const padding = value as Parameters<typeof paddedBox.build>[0];
    const plain = await paint(paddedBox.build(undefined, kind));
    const padded = await paint(paddedBox.build(padding, kind));
    const [top, right, bottom, left] = sides;
    const grown = {
      top: plain.top - padded.top,
      right: padded.right - plain.right,
      bottom: padded.bottom - plain.bottom,
      left: plain.left - padded.left,
    };
    for (const [side, expected] of Object.entries({ top, right, bottom, left }))
      assert.ok(
        Math.abs(grown[side as keyof typeof grown] - expected) < 1e-6,
        `padded ${kind}: ${side} grows by ${grown[side as keyof typeof grown]}, expected ${expected}`,
      );
    const pixels = colourBox(
      (await render(paddedBox.build(padding, kind))).rgb,
      paddedBox.box,
      40,
    )!;
    const errors = {
      left: pixels.left - padded.left,
      top: pixels.top - padded.top,
      right: pixels.right - padded.right,
      bottom: pixels.bottom - padded.bottom,
    };
    for (const [side, error] of Object.entries(errors))
      assert.ok(
        Math.abs(error) <= 2,
        `padded ${kind}: rendered ${side} edge is ${error} px from the measured paint box`,
      );
    results[`${kind} ${JSON.stringify(padding)}`] = {
      grown,
      pixelErrors: errors,
    };
  }
  return results;
}

/**
 * `light.glow` `color` and `tint` (effect 1.1.0): around dark plum caps on a
 * dark frame, an untinted glow barely shows; a lavender tint glows lavender
 * from the glyphs' coverage, on Canvas and WebGL2 alike. `tint` 0 (the
 * default) renders exactly as the 1.0.0 parameters did on both backends.
 */
async function verifyColouredGlow() {
  const night = rgbOf(colouredGlow.night);
  const backends = ["canvas2d", "webgl2"] as const;
  const plain = (await render(colouredGlow.build())).rgb;
  // The ring: pixels within 14 px of the text's ink, not ink themselves.
  const ink: number[] = [];
  for (let i = 0; i < plain.length; i += 3)
    if (plain.subarray(i, i + 3).some((v, c) => Math.abs(v - night[c]!) > 4))
      ink.push(i / 3);
  const inkSet = new Set(ink);
  const xs = ink.map((p) => p % frame.width),
    ys = ink.map((p) => Math.floor(p / frame.width));
  const ring: number[] = [];
  for (let y = Math.min(...ys) - 14; y <= Math.max(...ys) + 14; y++)
    for (let x = Math.min(...xs) - 14; x <= Math.max(...xs) + 14; x++)
      if (!inkSet.has(y * frame.width + x)) ring.push(y * frame.width + x);
  const mean = (pixels: Buffer) =>
    [0, 1, 2].map(
      (c) =>
        Math.round(
          (ring.reduce((sum, p) => sum + pixels[p * 3 + c]!, 0) / ring.length) *
            100,
        ) / 100,
    );
  const base = { radius: 10, intensity: 1 };
  const tinted = { ...base, color: colouredGlow.lavender, tint: 1 };
  const results: Record<string, unknown> = { night };
  for (const backend of backends) {
    const old = (await render(colouredGlow.build(base), 0, backend)).rgb;
    const zero = (
      await render(
        colouredGlow.build({ ...base, color: colouredGlow.lavender, tint: 0 }),
        0,
        backend,
      )
    ).rgb;
    assert.ok(old.equals(zero), `coloured glow: tint 0 unchanged (${backend})`);
    const glow = (await render(colouredGlow.build(tinted), 0, backend)).rgb;
    const ringMean = mean(glow);
    // Lift over the night frame, per channel: lavender lifts blue most, then
    // red, then green.
    const [r, g, b] = ringMean.map((v, c) => v - night[c]!) as [
      number,
      number,
      number,
    ];
    const untinted = mean(old);
    assert.ok(
      b > 20 && r > 15 && b > r && r > g,
      `coloured glow (${backend}): lavender ring expected, lift ${[r, g, b]} over ${night}`,
    );
    assert.ok(
      untinted[2]! - night[2]! < 5,
      `coloured glow (${backend}): untinted ring ${untinted} should barely show`,
    );
    results[backend] = { untintedRing: untinted, tintedRing: ringMean };
  }
  const [canvas, webgl] = await Promise.all(
    backends.map(
      async (backend) =>
        (await render(colouredGlow.build(tinted), 0, backend)).rgb,
    ),
  );
  let worst = 0;
  for (let i = 0; i < canvas!.length; i++)
    worst = Math.max(worst, Math.abs(canvas![i]! - webgl![i]!));
  assert.ok(worst <= 3, `coloured glow: Canvas and WebGL2 differ by ${worst}`);
  results.backendWorstDifference = worst;
  return results;
}

/**
 * A span style resolves axes against its own font: Pinyon gets no wght, the
 * layer validates, the span measures in Pinyon, and the render equals the
 * pilot's `axes: {}` workaround byte for byte.
 */
async function verifySpanAxes() {
  const fixed = spanAxes.build();
  const validation = validateComposition(fixed);
  assert.equal(
    validation.ok,
    true,
    `span axes: ${JSON.stringify(validation.ok ? [] : validation.diagnostics)}`,
  );
  const report = await measure(fixed);
  assert.equal(report.status, "measured", JSON.stringify(report.diagnostics));
  const state = measured(report, "ital");
  assert.deepEqual(
    state.spans.map((s) => s.metrics.fontAsset),
    ["playfair-italic", "pinyon"],
  );
  const [withFix, withWorkaround] = [
    await render(fixed),
    await render(spanAxes.build(true)),
  ];
  assert.ok(
    withFix.rgb.equals(withWorkaround.rgb),
    "span axes: the fix renders the pilot's axes: {} workaround exactly",
  );
  return { spanFonts: state.spans.map((s) => s.metrics.fontAsset) };
}

export async function verifyPhase1() {
  directory = await mkdtemp(join(tmpdir(), "editorial-phase1-"));
  try {
    const summary = {
      spanAxes: await verifySpanAxes(),
      typedHighlight: await verifyTypedHighlight(),
      padding: await verifyPadding(),
      colouredGlow: await verifyColouredGlow(),
    };
    console.log(`Editorial titles Phase 1: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await verifyPhase1();
