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
  frame,
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
const render = async (composition: Composition, frameIndex = 0) =>
  rendererFrame(await write(composition), frameIndex);
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
    };
    console.log(`Editorial titles Phase 1: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await verifyPhase1();
