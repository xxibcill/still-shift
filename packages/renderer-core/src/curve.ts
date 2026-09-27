import type { MotionEasing } from "../../scene-contract/src/motion-easing.ts";
import { easeMotion, cubicBezierProgress } from "./motion-easing.ts";

export type TemporalHandle = { ease: number; speed?: number | undefined };
export type CurveKey = {
  time: number;
  value: number;
  step?: boolean | undefined;
  easing?: MotionEasing | undefined;
  smooth?: boolean | undefined;
  interpolation?: undefined | "hold" | "linear" | "ease" | "bezier" | "smooth";
  bezier?: [number, number, number, number] | undefined;
  in?: TemporalHandle | undefined;
  out?: TemporalHandle | undefined;
};
export type Curve = { frames: number[]; values: number[]; tangents: number[] };
export function monotoneTangents(
  frames: number[],
  values: number[],
  endpoints: { start?: number; end?: number } = {},
) {
  const slopes = values
    .slice(1)
    .map((v, i) => (v - values[i]!) / (frames[i + 1]! - frames[i]!));
  const tangents = values.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === values.length - 1) return slopes.at(-1)!;
    const left = slopes[i - 1]!,
      right = slopes[i]!;
    if (left * right <= 0) return 0;
    return (left + right) / 2;
  });
  // Authored handoff velocities must obey the same monotonicity limits.
  if (endpoints.start !== undefined) tangents[0] = endpoints.start;
  if (endpoints.end !== undefined)
    tangents[tangents.length - 1] = endpoints.end;
  // Fritsch–Carlson limits each interval without reversing its monotone direction.
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    if (tangents[i]! / slope < 0) tangents[i] = 0;
    if (tangents[i + 1]! / slope < 0) tangents[i + 1] = 0;
    const a = tangents[i]! / slope,
      b = tangents[i + 1]! / slope;
    const radius = Math.hypot(a, b);
    if (radius > 3) {
      tangents[i] = (3 * a * slope) / radius;
      tangents[i + 1] = (3 * b * slope) / radius;
    }
  });
  return tangents;
}
export function hermite(
  a: number,
  b: number,
  ma: number,
  mb: number,
  duration: number,
  t: number,
) {
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * a +
    (t ** 3 - 2 * t ** 2 + t) * duration * ma +
    (-2 * t ** 3 + 3 * t ** 2) * b +
    (t ** 3 - t ** 2) * duration * mb
  );
}
export function sampleCurve(keys: CurveKey[], time: number, fps = 30): number {
  if (time <= keys[0]!.time) return keys[0]!.value;
  if (time >= keys.at(-1)!.time) return keys.at(-1)!.value;
  const i = keys.findIndex((key, i) => i > 0 && key.time > time) - 1;
  const a = keys[i]!,
    b = keys[i + 1]!,
    duration = b.time - a.time;
  const t = (time - a.time) / duration;
  if (b.step || b.interpolation === "hold") return a.value;
  const smooth = (key: CurveKey) =>
    key.smooth || key.interpolation === "smooth";
  if (smooth(a) || smooth(b) || a.out || b.in) {
    const tangents = monotoneTangents(
      keys.map((k) => k.time),
      keys.map((k) => k.value),
    );
    const ma = a.out?.speed ?? (smooth(a) ? tangents[i]! : 0);
    const mb = b.in?.speed ?? (smooth(b) ? tangents[i + 1]! : 0);
    if (!a.out && !b.in) return hermite(a.value, b.value, ma, mb, duration, t);
    const out = a.out?.ease ?? 1 / 3,
      incoming = b.in?.ease ?? 1 / 3;
    // Temporal handles are cubic control points in (frame, value) space.
    const u = cubicBezierProgress(t, [out, 1 / 3, 1 - incoming, 2 / 3]);
    return (
      (1 - u) ** 3 * a.value +
      3 * (1 - u) ** 2 * u * (a.value + ma * duration * out) +
      3 * (1 - u) * u * u * (b.value - mb * duration * incoming) +
      u ** 3 * b.value
    );
  }
  const easing =
    b.interpolation === "linear"
      ? "linear"
      : b.bezier
        ? { bezier: b.bezier }
        : b.easing;
  return a.value + (b.value - a.value) * easeMotion(t, easing, duration / fps);
}
