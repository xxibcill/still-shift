// Placement arithmetic over `comp measure` output (ET6a). These helpers turn
// measured geometry into sizes, origins and decoration offsets; they choose
// nothing. The candidate still picks every target: the width to fill, the
// centre line, the gap between lines, which edge to stack on.
//
// Measurements are in layer-local pixels and do not depend on a layer's
// position, so a program can place its layers from its own measurement: run
// `comp measure --input <candidate.ts> --output <candidate>.measure.json`, read it
// with `readMeasure`, place, and measure again after any change of copy, font
// or size (`measured` refuses a stale file).
import { existsSync, readFileSync } from "node:fs";
import type {
  CompositionTextMeasure,
  MeasureBox,
  TextStateMeasure,
} from "@still-shift/renderer-core";

export type Measure = CompositionTextMeasure & { composition?: string };

/** Which box of a measured layer to place by. */
export type Edge =
  /** Glyph ink. */
  | "ink"
  /** Glyph ink plus a text animator outline (ink when there is none). */
  | "outline"
  /** First line's cap line to last line's baseline, ink width. */
  | "cap";

/** A saved `comp measure` report beside a program, or undefined before the first run. */
export function readMeasure(url: URL): Measure | undefined {
  if (!existsSync(url)) return undefined;
  const text = readFileSync(url, "utf8");
  // An empty file is one a shell redirect created before measuring finished.
  if (!text.trim()) return undefined;
  const report = JSON.parse(text) as Measure & {
    schemaVersion?: string;
  };
  if (report.schemaVersion !== "composition-measure-1")
    throw new Error(`${url.pathname}: not a comp measure report`);
  return report;
}

/**
 * One measured state of a layer. With `expect`, refuses a measurement made
 * for other copy or another size: measure again after changing either.
 */
export function measured(
  report: Measure,
  layer: string,
  expect?: { text?: string; size?: number },
  state = 0,
): TextStateMeasure {
  const entry = report.layers.find((l) => l.key === layer);
  if (!entry) throw new Error(`measure: no text layer ${layer}`);
  if (!entry.measured)
    throw new Error(`measure: ${layer} is not measured: ${entry.reason}`);
  const measuredState = entry.states[state];
  if (!measuredState)
    throw new Error(`measure: ${layer} has no state ${state}`);
  if (expect?.text !== undefined && measuredState.text !== expect.text)
    throw new Error(
      `measure: ${layer} was measured with "${measuredState.text}", not "${expect.text}"; measure again`,
    );
  if (expect?.size !== undefined && measuredState.metrics.size !== expect.size)
    throw new Error(
      `measure: ${layer} was measured at ${measuredState.metrics.size} px, not ${expect.size}; measure again`,
    );
  return measuredState;
}

/** The box `edge` names, in layer-local pixels. */
export function edgeBox(state: TextStateMeasure, edge: Edge): MeasureBox {
  const ink = state.ink;
  if (!ink) throw new Error(`measure: "${state.text}" has no ink`);
  if (edge === "ink") return ink;
  if (edge === "outline") return state.outline?.ink ?? ink;
  const top = state.lines[0]!.capTop,
    bottom = state.lines.at(-1)!.baseline;
  return { ...ink, top, bottom, height: bottom - top };
}

/**
 * Font size at which `edge` is about `width` wide, from a measurement at
 * `size`: rounded down to an integer. Glyph widths scale with size, so this
 * is close but not exact; measure again at the new size and step down by one
 * while the box is still wider than the target.
 */
export function fitSize(
  state: TextStateMeasure,
  size: number,
  width: number,
  edge: Edge = "ink",
): number {
  return Math.floor((size * width) / edgeBox(state, edge).width);
}

/** Origin x that puts the centre of `edge` on `x`. */
export function centreOn(
  state: TextStateMeasure,
  x: number,
  edge: Edge = "ink",
): number {
  const box = edgeBox(state, edge);
  return Math.round(x - (box.left + box.right) / 2);
}

/** Origin y that puts the top of `edge` at `y`. */
export function topAt(
  state: TextStateMeasure,
  y: number,
  edge: Edge = "ink",
): number {
  return Math.round(y - edgeBox(state, edge).top);
}

/** Composition y of the bottom of `edge` for a layer whose origin y is `originY`. */
export function bottomOf(
  state: TextStateMeasure,
  originY: number,
  edge: Edge = "ink",
): number {
  return originY + edgeBox(state, edge).bottom;
}

/**
 * The `offset` that centres a highlight or strike decoration on the layer's
 * cap band (`on: "cap"`) or on its decorated glyphs' ink (`on: "ink"`), for
 * the first line it covers. Read from the measured decoration, so it holds
 * for any face; a caps-only face with x-height equal to cap height gives 0.
 */
export function highlightOffset(
  state: TextStateMeasure,
  decoration = 0,
  on: "cap" | "ink" = "cap",
): number {
  const mark = state.decorations[decoration];
  const centred = mark?.segments[0]?.centredOffset;
  if (!centred)
    throw new Error(
      `measure: decoration ${decoration} of "${state.text}" is not a highlight or strike`,
    );
  const value = on === "cap" ? centred.cap : centred.ink;
  if (value === null)
    throw new Error(`measure: decoration ${decoration} covers no ink`);
  return Math.round(value * 100) / 100;
}
