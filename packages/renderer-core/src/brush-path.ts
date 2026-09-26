import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import { pathLength, pointOnPath } from "./prepared-scene.ts";

type Point = [number, number];
type BrushPath = Pick<PreparedPath, "id" | "points" | "lineWidth">;
export type BrushStroke = { wash: Point[]; body: Point[]; cuts: Point[][] };

const STEPS = 256;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Samples stay in stroke coordinates, so revealing a mark never reseeds its texture. */
export function brushStroke(
  path: BrushPath,
  start: number,
  end: number,
): BrushStroke {
  start = clamp(start);
  end = clamp(end);
  const empty = { wash: [], body: [], cuts: [] };
  if (end <= start || pathLength(path.points) === 0) return empty;
  let seed = 0;
  for (const char of path.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const phase = (seed % 997) / 159;

  const section = (t: number) => {
    const p = pointOnPath(path, t);
    const a = pointOnPath(path, Math.max(0, t - 1 / STEPS));
    const b = pointOnPath(path, Math.min(1, t + 1 / STEPS));
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length === 0)
      return { p, normal: [0, 0] as Point, middle: 0, radius: 0 };
    const belly = Math.sin(Math.PI * t) ** 0.65;
    const middle = 0.055 * Math.sin(2 * Math.PI * t + phase) * belly;
    const pressure =
      0.1 + 0.31 * belly + 0.025 * Math.sin(5 * Math.PI * t + phase) * belly;
    const tooth =
      (0.018 * Math.sin(173 * t + phase) + 0.009 * Math.sin(431 * t + phase)) *
      belly;
    // A short loaded-nib tip; the completed body is independent of reveal time.
    const tip = end < 1 ? Math.min(1, 0.15 + (end - t) * 32) : 1;
    return {
      p,
      normal: [-dy / length, dx / length] as Point,
      middle: middle * path.lineWidth * tip,
      radius:
        Math.min(0.48 - Math.abs(middle), pressure + tooth) *
        path.lineWidth *
        tip,
    };
  };
  const samples = (from: number, to: number) => {
    const values = [from];
    for (let i = Math.floor(from * STEPS) + 1; i < to * STEPS; i++)
      values.push(i / STEPS);
    values.push(to);
    return values;
  };
  const band = (
    from: number,
    to: number,
    edges: (t: number) => [number, number],
  ): Point[] => {
    const left: Point[] = [],
      right: Point[] = [];
    for (const t of samples(from, to)) {
      const { p, normal, middle, radius } = section(t);
      const [upper, lower] = edges(t);
      const offset = (edge: number): Point => [
        p[0] + normal[0] * (middle + radius * edge),
        p[1] + normal[1] * (middle + radius * edge),
      ];
      left.push(offset(upper));
      right.push(offset(lower));
    }
    return [...left, ...right.reverse()];
  };
  const wash = band(start, end, () => [1, -1]);
  // An asymmetric loaded edge and a softer trailing edge suggest the angle of a nib.
  const body = band(start, end, (t) => [
    0.78 + 0.05 * Math.sin(97 * t + phase),
    -0.7 + 0.06 * Math.sin(131 * t + phase),
  ]);
  const cuts: Point[][] = [];
  for (const [from, to, lane, width] of [
    [0.1, 0.43, -0.3, 0.095],
    [0.27, 0.72, 0.23, 0.075],
    [0.56, 0.94, -0.19, 0.105],
    [0.77, 0.98, 0.45, 0.045],
  ] as const) {
    const a = Math.max(from, start),
      b = Math.min(to, end);
    if (b <= a) continue;
    cuts.push(
      band(a, b, (t) => {
        const taper = Math.sin((Math.PI * (t - from)) / (to - from)) ** 0.55;
        const drift = 0.05 * Math.sin(23 * t + phase);
        return [lane + drift + width * taper, lane + drift - width * taper];
      }),
    );
  }
  return { wash, body, cuts };
}
