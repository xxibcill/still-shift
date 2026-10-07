import { inkStrokeOutline } from "../../ink-path.ts";
import { brushStroke } from "../../brush-path.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import { geometrySource, type GeometryPath } from "./geometry.ts";
import { arcLengths } from "./path.ts";
import type { Point } from "../../node-transform.ts";
import type { ShapePaint, ShapeNib } from "./types.ts";

type Stroke = Extract<ShapePaint, { type: "stroke" | "gradient-stroke" }>;

/** Cache segment lengths while retaining the legacy nib's subtraction and multiply/divide order. */
export function nibSampler(points: Point[], budget: ShapeGeometryBudget) {
  const segments = points
      .slice(1)
      .map((point, i) =>
        Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]),
      ),
    total = segments.reduce((sum, length) => sum + length, 0);
  return (progress: number): Point => {
    let distance = total * Math.max(0, Math.min(1, progress));
    for (const [index, length] of segments.entries()) {
      budget.vertices(1);
      const a = points[index]!,
        b = points[index + 1]!;
      if (distance <= length && length > 0)
        return [
          a[0] + ((b[0] - a[0]) * distance) / length,
          a[1] + ((b[1] - a[1]) * distance) / length,
        ];
      distance -= length;
    }
    return points.at(-1)!;
  };
}
function dashSpans(
  span: [number, number],
  length: number,
  dashes: number[],
  offset: number,
  budget: ShapeGeometryBudget,
): [number, number][] {
  const pattern = dashes.length % 2 ? [...dashes, ...dashes] : dashes;
  const period = pattern.reduce((sum, n) => sum + n, 0);
  if (!period) return [span];
  const positive = pattern.filter((n) => n > 0),
    start = span[0] * length,
    end = span[1] * length;
  budget.vertices(
    Math.ceil((end - start) / Math.min(...positive)) + pattern.length + 2,
  );
  let phase = (((start + offset) % period) + period) % period,
    index = 0;
  while (phase >= pattern[index]!) {
    phase -= pattern[index]!;
    index = (index + 1) % pattern.length;
  }
  const result: [number, number][] = [];
  let position = start;
  while (position < end) {
    const next = Math.min(end, position + pattern[index]! - phase);
    if (next <= position && pattern[index]! > 0)
      budget.fail(
        "comp-shape-dash-precision",
        "Dash spacing is below the available coordinate precision",
      );
    if (index % 2 === 0 && next > position)
      result.push([position / length, next / length]);
    position = next;
    phase = 0;
    index = (index + 1) % pattern.length;
  }
  return result;
}

/** Nib geometry is evaluated once, with the same source coordinates and ID as legacy marks. */
export function shapeNibs(
  geometry: GeometryPath,
  paint: Stroke,
  budget: ShapeGeometryBudget,
): ShapeNib[] | undefined {
  if (!paint.style || paint.style === "plain") return undefined;
  if (!paint.width) return [];
  const source = geometrySource(geometry, budget),
    lengths = arcLengths(source.points),
    length = lengths.at(-1) ?? 0;
  if (!length) return [];
  const spans = paint.dashes?.length
    ? dashSpans(source.span, length, paint.dashes, paint.dashOffset, budget)
    : [source.span];
  const sample = nibSampler(source.points, budget);
  return spans.map(([start, end]) => {
    // Conservative bound includes helper intermediate samples, not just returned outlines.
    budget.vertices(paint.style === "ink" ? 2048 : 16384);
    budget.paths();
    const nib =
      paint.style === "ink"
        ? {
            wash: [],
            body: inkStrokeOutline(
              { points: source.points, lineWidth: paint.width },
              start,
              end,
              sample,
            ),
            cuts: [],
          }
        : brushStroke(
            {
              id: geometry.id,
              points: source.points,
              lineWidth: paint.width,
              pinchAt: paint.pinchAt,
              pinchWidth: paint.pinchWidth,
            },
            start,
            end,
            paint.pinch,
            undefined,
            sample,
          );
    for (const points of [nib.wash, nib.body, ...nib.cuts])
      points.forEach((point) => budget.point(point));
    return nib;
  });
}
