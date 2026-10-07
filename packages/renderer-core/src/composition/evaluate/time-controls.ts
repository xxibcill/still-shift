import type { CompositionLayer } from "@still-shift/scene-contract";
import {
  passageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";

type Precomp = Extract<CompositionLayer, { type: "precomp" }>;

/** Keyed/content frames; visibility and explicitly root-bound motion keep their scope clock. */
export function layerContentTime(
  layer: CompositionLayer,
  scopeFrame: number,
  scopeFps: number,
): number {
  const local = (scopeFrame - (layer.startFrame ?? 0)) / (layer.stretch ?? 1);
  const time =
    layer.holdFrame ??
    (layer.posterizeFps === undefined
      ? local
      : (Math.floor((local * layer.posterizeFps) / scopeFps) * scopeFps) /
        layer.posterizeFps);
  if (!Number.isFinite(time))
    passageError("comp-evaluation-time", "Layer content time must be finite", {
      path: `${layer.id}.${layer.posterizeFps === undefined ? "stretch" : "posterizeFps"}`,
      frame: scopeFrame,
      node: layer.id,
    });
  return time;
}

/** Map a content switch to a scope frame that actually reaches its posterized grid. */
export function layerContentCut(
  layer: CompositionLayer,
  contentFrame: number,
  scopeFps: number,
): number {
  const stretch = layer.stretch ?? 1,
    start = layer.startFrame ?? 0;
  if (layer.posterizeFps === undefined) return contentFrame * stretch + start;
  const source =
    (Math.ceil((contentFrame * layer.posterizeFps) / scopeFps) * scopeFps) /
    layer.posterizeFps;
  let before = source * stretch + start;
  // Inverting a grid can round onto either side of its switch. Bracket it
  // using the same clock, including precision lost to start/stretch cancellation.
  let distance = Math.max(
    Number.MIN_VALUE,
    Number.EPSILON *
      Math.max(Math.abs(before), Math.abs(start), Math.abs(source * stretch)),
  );
  let after = before;
  while (layerContentTime(layer, before, scopeFps) >= contentFrame) {
    before -= Math.sign(stretch) * distance;
    distance *= 2;
  }
  while (layerContentTime(layer, after, scopeFps) < contentFrame) {
    after += Math.sign(stretch) * distance;
    distance *= 2;
  }
  for (;;) {
    const middle = before + (after - before) / 2;
    if (middle === before || middle === after) return after;
    if (layerContentTime(layer, middle, scopeFps) >= contentFrame)
      after = middle;
    else before = middle;
  }
}

/** Unlimited loops extend through negative time; finite loops have fixed terminal holds. */
export function loopedPrecompTime(
  sourceFrame: number,
  frameCount: number,
  layer: Precomp,
  location: Pick<PassageDiagnostic, "node" | "path" | "frame"> = {
    node: layer.id,
    path: `${layer.id}.loop`,
  },
): number {
  if (!layer.loop) return sourceFrame;
  if (frameCount === 1) return 0;
  const last = frameCount - 1;
  const period = layer.loop === "cycle" ? frameCount : 2 * last;
  if (layer.loopCount !== undefined) {
    if (sourceFrame < 0) return 0;
    if (sourceFrame >= period * layer.loopCount)
      return layer.loop === "cycle" ? last : 0;
  }
  // Keep modulo clocks in a range with useful subframe precision. Finite terminal
  // holds and singleton sources do not perform modulo and need no such bound.
  if (!Number.isFinite(sourceFrame) || Math.abs(sourceFrame) > 2 ** 40)
    passageError(
      "comp-evaluation-time",
      "Loop source time must be within ±2^40 frames",
      location,
    );
  // One remainder preserves positive subframes. A tiny negative remainder can
  // round up to period on addition; cycle's later source clamp then holds its
  // last frame instead of spuriously selecting the new cycle's first frame.
  const remainder = sourceFrame % period;
  const phase = remainder < 0 ? remainder + period : remainder;
  return layer.loop === "cycle"
    ? phase
    : phase <= last
      ? phase
      : period - phase;
}

export type SourceFramePair = { first: number; second: number; mix: number };

/** Source-frame pair after FPS/remap mapping. CE13 supplies the decoded frame images. */
export function sourceFramePair(
  sourceFrame: number,
  frameCount: number,
  blending: "hold" | "linear" = "hold",
): SourceFramePair {
  if (
    !Number.isFinite(sourceFrame) ||
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1
  )
    passageError(
      "comp-media-time",
      "Source sampling requires finite time and a positive integer frame count",
      {
        path: "frameBlending",
      },
    );
  if (blending !== "hold" && blending !== "linear")
    passageError(
      "comp-media-frame-blending",
      "Frame blending must be hold or linear",
      {
        path: "frameBlending",
      },
    );
  const clamped = Math.max(0, Math.min(frameCount - 1, sourceFrame));
  const first = Math.floor(clamped);
  return blending === "hold"
    ? { first, second: first, mix: 0 }
    : {
        first,
        second: Math.min(first + 1, frameCount - 1),
        mix: clamped - first,
      };
}

/** Only explicitly supplied instance overrides are clocks; inherited names are not. */
export function scopeTimeOverride(
  times: Readonly<Record<string, number>> | undefined,
  route: string,
): number | undefined {
  return times && Object.hasOwn(times, route) ? times[route] : undefined;
}
