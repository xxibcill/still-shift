import type { Composition } from "../../../packages/scene-contract/src/index.ts";
import {
  evaluateProperty,
  type EvaluationOptions,
} from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
export type GraphPoint = { frame: number; value: number[]; speed: number[] };
const numeric = (value: unknown): number[] =>
  typeof value === "number"
    ? [value]
    : Array.isArray(value) && value.every((v) => typeof v === "number")
      ? value
      : Array.isArray(value) &&
          value.every(
            (point) =>
              Array.isArray(point) &&
              point.length === 2 &&
              point.every((channel) => typeof channel === "number"),
          )
        ? (value.flat() as number[])
        : [];
export function resolvedGraph(
  document: Composition,
  path: string,
  options: EvaluationOptions = {},
): GraphPoint[] {
  const end = document.frameCount - 1,
    count = Math.min(120, Math.max(2, document.frameCount));
  const sample = (frame: number) =>
    numeric(evaluateProperty(document, path, frame, options));
  return Array.from({ length: count }, (_, index) => {
    const frame = (index * end) / (count - 1),
      left = Math.max(0, frame - 0.01),
      right = Math.min(end, frame + 0.01),
      value = sample(frame),
      a = sample(left),
      b = sample(right);
    return {
      frame,
      value,
      speed: value.map((_, axis) =>
        right > left ? (b[axis]! - a[axis]!) / (right - left) : 0,
      ),
    };
  });
}
export function curveGraph(points: GraphPoint[], title: string): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const node = (name: string, attributes: Record<string, string | number>) => {
    const result = document.createElementNS(namespace, name);
    for (const [key, value] of Object.entries(attributes))
      result.setAttribute(key, String(value));
    return result;
  };
  const chart = document.createElementNS(namespace, "svg");
  chart.setAttribute("viewBox", "0 0 640 260");
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", title);
  const colors = ["#afc5a1", "#e6c989", "#a9c6df", "#e8a4bd"],
    start = points[0]!.frame,
    duration = points.at(-1)!.frame - start || 1;
  for (const [panel, field] of ["value", "speed"].entries()) {
    const values = points.flatMap((p) =>
        field === "value" ? p.value : p.speed,
      ),
      min = Math.min(...values),
      max = Math.max(...values),
      span = max - min || 1;
    chart.append(
      node("line", {
        x1: 24,
        x2: 620,
        y1: 120 + panel * 125,
        y2: 120 + panel * 125,
        stroke: "#6d6b5b",
      }),
    );
    const label = node("text", {
      x: 24,
      y: 18 + panel * 125,
      fill: "#ccc4b0",
      "font-size": 12,
    });
    label.textContent = `${field} · ${min.toFixed(2)} … ${max.toFixed(2)}`;
    chart.append(label);
    for (let axis = 0; axis < points[0]!.value.length; axis++)
      chart.append(
        node("polyline", {
          fill: "none",
          stroke: colors[axis % colors.length]!,
          "stroke-width": 2,
          points: points
            .map(
              (p) =>
                `${24 + ((p.frame - start) / duration) * 596},${115 + panel * 125 - (((field === "value" ? p.value : p.speed)[axis]! - min) / span) * 90}`,
            )
            .join(" "),
        }),
      );
  }
  return chart;
}
