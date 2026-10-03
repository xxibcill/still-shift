/**
 * Pure numeric kernels for CE9 expression built-ins. Nothing here reads clocks,
 * unseeded randomness or global state, so every result is reproducible.
 */
import { easeMotion } from "../../motion-easing.ts";

export type ExpressionValue = number | boolean | string | number[];

const SNAP = 1e-9;
/** Convert seconds to frames, snapping float noise such as 6.000000000000001 to 6. */
export function secondsToFrames(seconds: number, fps: number) {
  const frames = seconds * fps;
  const nearest = Math.round(frames);
  return Math.abs(frames - nearest) <= SNAP * Math.max(1, Math.abs(frames))
    ? nearest
    : frames;
}

function mix32(seed: number, index: number) {
  let h = Math.imul((seed | 0) ^ (index | 0), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Seeded hash in [0, 1). Seeds and indices are truncated to integers. */
export function random(seed: number, index: number) {
  return mix32(Math.trunc(seed), Math.trunc(index)) / 4294967296;
}

/** Seeded value noise with smoothstep interpolation, in [−1, 1]. */
export function noise(seed: number, t: number) {
  const cell = Math.floor(t);
  const f = t - cell;
  const a = random(seed, cell) * 2 - 1;
  const b = random(seed, cell + 1) * 2 - 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}

/** AE-style wiggle offset for one component: octaves double frequency and halve amplitude. */
export function wiggleOffset(
  frequency: number,
  amplitude: number,
  seed: number,
  octaves: number,
  seconds: number,
  component: number,
) {
  let total = 0;
  for (let octave = 0; octave < octaves; octave++)
    total +=
      noise(
        mix32(Math.trunc(seed), component * 64 + octave),
        seconds * frequency * 2 ** octave,
      ) *
      amplitude *
      0.5 ** octave;
  return total;
}

export type EaseKind = "linear" | "ease" | "easeIn" | "easeOut";
export function easeProgress(kind: EaseKind, t: number) {
  const u = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "linear":
      return u;
    case "ease":
      return easeMotion(u, "smoothstep");
    case "easeIn":
      return u * u;
    case "easeOut":
      return 1 - (1 - u) * (1 - u);
  }
}

/** Apply `f` component-wise; scalars broadcast. */
export function zip(
  a: ExpressionValue,
  b: ExpressionValue,
  f: (x: number, y: number) => number,
): ExpressionValue {
  if (Array.isArray(a)) {
    if (Array.isArray(b)) return a.map((x, i) => f(x, b[i]!));
    return a.map((x) => f(x, b as number));
  }
  if (Array.isArray(b)) return b.map((y) => f(a as number, y));
  return f(a as number, b as number);
}
export const map = (a: ExpressionValue, f: (x: number) => number) =>
  Array.isArray(a) ? a.map(f) : f(a as number);

export function lerp(a: ExpressionValue, b: ExpressionValue, t: number) {
  return zip(a, b, (x, y) => x + (y - x) * t);
}

export const vectorLength = (v: readonly number[]) => Math.hypot(...v);

/** Clockwise angle in degrees, matching composition rotation (+y down). */
export const angleOf = (dx: number, dy: number) =>
  (Math.atan2(dy, dx) * 180) / Math.PI;

/**
 * Area-preserving squash and stretch from a 2D velocity (pixels/second). Stretch
 * `s = 1 + min(limit − 1, amount · speed)` applies along the travel direction and
 * `1/s` across it. Unaligned layers weight each axis by the direction's squared
 * components, so `sx · sy = 1`; aligned layers (auto-oriented) return `[s, 1/s]`.
 */
export function squash(
  velocity: readonly number[],
  amount: number,
  limit: number,
  aligned = false,
): number[] {
  const speed = vectorLength(velocity);
  const s = 1 + Math.max(0, Math.min(Math.max(0, limit - 1), amount * speed));
  if (aligned) return [s, 1 / s];
  if (!speed) return [1, 1];
  const dx = (velocity[0]! / speed) ** 2,
    dy = (velocity[1]! / speed) ** 2;
  return [s ** (dx - dy), s ** (dy - dx)];
}

/**
 * Damped harmonic follower `x'' = ω²(u − x) − 2ζω x'` with frame-unit ω, advanced
 * exactly over an interval of length `h` frames on which the input moves linearly
 * from `a` to `b`. `ζ < 1` overshoots, `ζ = 1` is critically damped.
 */
export function springStep(
  x: number,
  v: number,
  a: number,
  b: number,
  h: number,
  omega: number,
  zeta: number,
): [number, number] {
  const slope = h ? (b - a) / h : 0;
  // Particular solution for linear input; e is the homogeneous remainder.
  const lag = (2 * zeta * slope) / omega;
  const e0 = x - (a - lag),
    d0 = v - slope;
  let e: number, d: number;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const c2 = (d0 + zeta * omega * e0) / wd;
    const decay = Math.exp(-zeta * omega * h);
    const cos = Math.cos(wd * h),
      sin = Math.sin(wd * h);
    e = decay * (e0 * cos + c2 * sin);
    d =
      decay *
      ((-zeta * omega * e0 + wd * c2) * cos +
        (-zeta * omega * c2 - wd * e0) * sin);
  } else if (zeta === 1) {
    const c2 = d0 + omega * e0;
    const decay = Math.exp(-omega * h);
    e = (e0 + c2 * h) * decay;
    d = (c2 - omega * (e0 + c2 * h)) * decay;
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega * (zeta - root),
      r2 = -omega * (zeta + root);
    const p = (d0 - r2 * e0) / (r1 - r2),
      q = e0 - p;
    const g1 = Math.exp(r1 * h),
      g2 = Math.exp(r2 * h);
    e = p * g1 + q * g2;
    d = p * r1 * g1 + q * r2 * g2;
  }
  return [b - lag + e, slope + d];
}
