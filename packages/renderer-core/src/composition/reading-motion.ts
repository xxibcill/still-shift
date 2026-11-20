/**
 * ET6b reading motion (D-read, owner 2026-11-16: "Gentle drift is fine")
 * (docs/editorial-typography-improvement-plan.md#et6b--editorial-title-lint-profile).
 *
 * Slow, steady movement while a title holds counts as reading time: a push,
 * float or scale-up of about one letter-height per second or less, in one
 * direction. Fast motion, jitter, back-and-forth and spinning do not.
 *
 * The rule follows tracked points through a reading run: each visible
 * glyph's centre and the two ends of its advance (from the renderer's own
 * text-animator poses when pixel lint supplies them, else the layer's
 * transformed corners). A frame continues the run while every point moves
 * no faster than `velocity` letter-heights per second, no point has
 * travelled more than `displacement` letter-heights since the run began,
 * and no point has turned more than 90° from the direction it first moved
 * in during the run. Steps under `READING_MOTION_NOISE` pixels have no
 * direction, so a drift that eases to a stop is not a reversal.
 */
import type { Composition } from "@still-shift/scene-contract";
import type { Matrix } from "../node-transform.ts";
import type { TextGlyphMotion } from "./quality-policy.ts";

/** Steps shorter than this, in output pixels per frame, carry no direction. */
export const READING_MOTION_NOISE = 0.1;
/** Glyph blur above this, in output pixels, ends a reading run. */
export const READING_MOTION_BLUR = 0.5;
/** Without a shaped layout, a letter is taken as this share of the font size. */
export const FALLBACK_CAP_HEIGHT = 0.7;

export type ReadingMotionSettings = { velocity: number; displacement: number };
export type ReadingMotionRun = {
  start?: number[];
  previous?: number[];
  /** Per point, the unit direction it first moved in during this run. */
  reference: (readonly [number, number] | undefined)[];
};
export type ReadingMotionFrame = {
  /** x, y pairs in output pixels. */
  points: number[];
  /** Letter height in output pixels. */
  letterHeight: number;
  opacity: number;
  /** Output pixels. */
  blur: number;
  /** Measured from the renderer's glyph poses (else the layer transform). */
  glyphs: boolean;
};
export type ReadingMotionStep = {
  readable: boolean;
  /** Fastest point, in letter-heights per second. */
  speed: number;
  /** Farthest point from the run start, in letter-heights. */
  travel: number;
  /** Why the run ended on this frame, if it did. */
  ended?: "speed" | "reversal" | "travel" | "blur";
};

const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Output-space points of one text sample. */
export function readingMotionFrame(
  matrix: Matrix,
  scaleY: number,
  glyphs: TextGlyphMotion | undefined,
  fontSize: number,
): ReadingMotionFrame {
  const scale = Math.abs(scaleY);
  if (glyphs) {
    const points: number[] = [];
    for (let i = 0; i + 1 < glyphs.points.length; i += 2)
      points.push(...apply(matrix, glyphs.points[i]!, glyphs.points[i + 1]!));
    return {
      points,
      letterHeight: glyphs.capHeight * scale,
      opacity: glyphs.opacity,
      blur: glyphs.blur * scale,
      glyphs: true,
    };
  }
  return {
    points: [
      [0, 0],
      [100, 0],
      [0, 100],
      [100, 100],
    ].flatMap(([x, y]) => apply(matrix, x!, y!)),
    letterHeight: fontSize * FALLBACK_CAP_HEIGHT * scale,
    opacity: 1,
    blur: 0,
    glyphs: false,
  };
}

/** Advance a reading run by one frame; mutates `run`. */
export function advanceReadingMotion(
  run: ReadingMotionRun,
  frame: ReadingMotionFrame,
  fps: number,
  settings: ReadingMotionSettings,
): ReadingMotionStep {
  const restart = () => {
    run.start = frame.points;
    run.reference = [];
  };
  const previous = run.previous;
  run.previous = frame.points;
  if (frame.blur > READING_MOTION_BLUR) {
    restart();
    return { readable: false, speed: 0, travel: 0, ended: "blur" };
  }
  if (
    !previous ||
    !run.start ||
    previous.length !== frame.points.length ||
    run.start.length !== frame.points.length
  ) {
    restart();
    return { readable: true, speed: 0, travel: 0 };
  }
  const letter = Math.max(frame.letterHeight, 1);
  let fastest = 0,
    farthest = 0,
    reversal = false;
  const directions: (readonly [number, number] | undefined)[] = [];
  for (let i = 0; i + 1 < frame.points.length; i += 2) {
    const dx = frame.points[i]! - previous[i]!,
      dy = frame.points[i + 1]! - previous[i + 1]!,
      step = Math.hypot(dx, dy);
    fastest = Math.max(fastest, step);
    farthest = Math.max(
      farthest,
      Math.hypot(
        frame.points[i]! - run.start[i]!,
        frame.points[i + 1]! - run.start[i + 1]!,
      ),
    );
    const point = i / 2;
    if (step < READING_MOTION_NOISE) {
      directions[point] = run.reference[point];
      continue;
    }
    const direction = [dx / step, dy / step] as const;
    const reference = run.reference[point];
    if (
      reference &&
      direction[0] * reference[0] + direction[1] * reference[1] < 0
    )
      reversal = true;
    directions[point] = reference ?? direction;
  }
  const speed = (fastest * fps) / letter,
    travel = farthest / letter;
  if (speed > settings.velocity) {
    restart();
    return { readable: false, speed, travel, ended: "speed" };
  }
  if (reversal) {
    // The run begins again at this frame, heading the new way.
    restart();
    for (let i = 0; i + 1 < frame.points.length; i += 2) {
      const dx = frame.points[i]! - previous[i]!,
        dy = frame.points[i + 1]! - previous[i + 1]!,
        step = Math.hypot(dx, dy);
      run.reference[i / 2] =
        step < READING_MOTION_NOISE ? undefined : [dx / step, dy / step];
    }
    return { readable: false, speed, travel, ended: "reversal" };
  }
  if (travel > settings.displacement) {
    restart();
    return { readable: false, speed, travel, ended: "travel" };
  }
  run.reference = directions;
  return { readable: true, speed, travel };
}

export const READING_MOTION_VERSION = "composition-reading-motion-1";

/**
 * ET6b: root text layers drawn by their outline alone (a transparent fill
 * with a text animator that strokes them). Lint samples fold the fill's
 * alpha into a text layer's opacity, so such a layer otherwise never has a
 * reading window; the profile reads it by its outline instead.
 */
export function strokedTextLayers(
  comp: Pick<Composition, "layers" | "textAnimators">,
) {
  const ids = new Set<string>();
  for (const animator of comp.textAnimators ?? [])
    if (
      [animator.from, animator.to].some(
        (properties) => (properties?.strokeWidth ?? 0) > 0,
      )
    )
      ids.add(animator.node);
  return new Set(
    comp.layers
      .filter((layer) => layer.type === "text" && ids.has(layer.id))
      .map((layer) => layer.id),
  );
}
type OutlineSample = {
  id: string;
  ancestors: readonly string[];
  onScreen: boolean;
  opacity: number;
  reveal: number;
  clippedBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
  state: {
    opacity: number;
    color?: readonly number[] | undefined;
    drawable?: boolean;
  };
};
/**
 * A sample's on-screen state and opacity for reading: unchanged unless it is
 * an outlined layer (`strokedTextLayers`) with a fully transparent fill, which
 * is then read at its layer and ancestor opacity, without the fill's alpha.
 */
export function outlinedReading<S extends OutlineSample>(
  sample: S,
  layers: ReadonlyMap<string, { state: { opacity: number } }>,
  stroked: ReadonlySet<string> | undefined,
  viewport: { width: number; height: number },
): { onScreen: boolean; opacity: number } {
  if (
    !stroked?.has(sample.id) ||
    sample.onScreen ||
    (sample.state.color?.[3] ?? 1) > 0
  )
    return { onScreen: sample.onScreen, opacity: sample.opacity };
  let opacity = sample.state.opacity;
  for (const ancestor of sample.ancestors)
    opacity *= layers.get(ancestor)?.state.opacity ?? 1;
  const box = sample.clippedBounds;
  const onScreen =
    sample.state.drawable !== false &&
    opacity > 1e-8 &&
    sample.reveal > 0 &&
    !!box &&
    Math.min(box.right, viewport.width) > Math.max(box.left, 0) &&
    Math.min(box.bottom, viewport.height) > Math.max(box.top, 0);
  return { onScreen, opacity };
}
