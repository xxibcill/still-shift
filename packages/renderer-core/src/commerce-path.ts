import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";
import type {
  CommerceFragment,
  ComponentBounds,
} from "./commerce-composition.ts";

type Point = [number, number];
export function buildPath(options: {
  id: string;
  points: Point[];
  stroke: string;
  lineWidth: number;
  protectedRegion?: ComponentBounds;
}): CommerceFragment {
  const node = PreparedNodeSchema.parse({
    type: "path",
    id: options.id,
    points: options.points,
    stroke: options.stroke,
    lineWidth: options.lineWidth,
  });
  if (
    options.protectedRegion &&
    options.points
      .slice(1)
      .some((point, index) =>
        intersectsBox(options.points[index]!, point, options.protectedRegion!),
      )
  )
    throw new Error(
      "Path crosses the protected product label; choose another target",
    );
  const xs = options.points.map((point) => point[0]),
    ys = options.points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    nodes: [node],
    events: [],
    bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
  };
}

/** Slab intersection covers horizontal, vertical and diagonal connectors. */
function intersectsBox(a: Point, b: Point, box: ComponentBounds) {
  let enter = 0,
    exit = 1;
  for (const [index, lower, upper] of [
    [0, box.x, box.x + box.width],
    [1, box.y, box.y + box.height],
  ] as const) {
    const delta = b[index] - a[index];
    if (delta === 0) {
      if (a[index] <= lower || a[index] >= upper) return false;
    } else {
      const first = (lower - a[index]) / delta,
        last = (upper - a[index]) / delta;
      enter = Math.max(enter, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (enter >= exit) return false;
    }
  }
  return true;
}
