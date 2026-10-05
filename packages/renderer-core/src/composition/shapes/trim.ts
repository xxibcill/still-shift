import type { ShapeGeometryBudget } from "./budget.ts";
import {
  arcLengths,
  flattenBezier,
  pathSection,
  polylinePath,
} from "./path.ts";
import { geometrySource, type GeometryPath } from "./geometry.ts";

type Trim = {
  start: number;
  end: number;
  offset: number;
  mode: "simultaneous" | "individual";
};
type Interval = [number, number];

function intervals(
  start: number,
  end: number,
  offset: number,
  closed: boolean,
): Interval[] {
  const shift = (offset / 360) % 1;
  const low = Math.min(start, end) + shift,
    high = Math.max(start, end) + shift;
  if (high <= low) return [];
  if (!closed)
    return [[Math.max(0, low), Math.min(1, high)]].filter(
      ([a, b]) => b! > a!,
    ) as Interval[];
  const from = ((low % 1) + 1) % 1,
    to = from + high - low;
  return to <= 1
    ? [[from, to]]
    : [
        [from, 1],
        [0, to - 1],
      ];
}

/** Each path trims separately, or all ordered contours share one length interval. */
export function trimGeometry(
  paths: GeometryPath[],
  trim: Trim,
  budget: ShapeGeometryBudget,
): GeometryPath[] {
  if (Math.abs(trim.end - trim.start) >= 1 - 1e-12) return paths;
  if (trim.start === trim.end) return [];
  const measured = paths.map((geometry) => {
    const points = flattenBezier(geometry.path, budget),
      lengths = arcLengths(points);
    return { geometry, points, lengths, length: lengths.at(-1) ?? 0 };
  });
  const total = measured.reduce((sum, item) => sum + item.length, 0);
  if (!total) return [];
  const combined = intervals(
    trim.start,
    trim.end,
    trim.offset,
    paths.every((item) => item.path.closed),
  );
  const result: GeometryPath[] = [];
  let before = 0;
  for (const item of measured) {
    if (!item.length) continue;
    const ranges =
      trim.mode === "simultaneous"
        ? intervals(
            trim.start,
            trim.end,
            trim.offset,
            item.geometry.path.closed,
          )
        : combined.map(
            ([a, b]): Interval => [
              Math.max(0, (a * total - before) / item.length),
              Math.min(1, (b * total - before) / item.length),
            ],
          );
    const original = item.geometry.source ?? {
      points: item.points,
      span: [0, 1] as Interval,
    };
    for (const [a, b] of ranges) {
      if (b <= a) continue;
      const section = pathSection(
        item.points,
        item.lengths,
        a * item.length,
        b * item.length,
        budget,
      );
      const from = original.span[0],
        width = original.span[1] - from;
      result.push({
        ...item.geometry,
        path: polylinePath(section, false, budget),
        source: {
          points: original.points,
          span: [from + width * a, from + width * b],
        },
      });
    }
    before += item.length;
  }
  return result;
}

/** Resolve the full source lazily for nib styles that were never trimmed. */
export { geometrySource };
