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
import { spanAxes } from "../../benchmarks/fixtures/editorial-titles/phase1-fixes.ts";
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
    const summary = { spanAxes: await verifySpanAxes() };
    console.log(`Editorial titles Phase 1: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await verifyPhase1();
