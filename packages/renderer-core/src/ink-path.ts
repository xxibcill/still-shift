import type { PreparedPath } from "../../scene-contract/src/prepared.ts";
import { pathLength, pointOnPath } from "./prepared-scene.ts";

/** A fixed nib profile; width never exceeds the path's declared clearance envelope. */
export function inkStrokeOutline(
  path: PreparedPath,
  start: number,
  end: number,
): [number, number][] {
  start = Math.max(0, Math.min(1, start));
  end = Math.max(0, Math.min(1, end));
  const length = pathLength(path.points);
  if (end <= start || length === 0) return [];
  const count = Math.max(8, Math.ceil((end - start) * 96));
  const left: [number, number][] = [],
    right: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const progress = start + ((end - start) * i) / count;
    const point = pointOnPath(path, progress);
    const before = pointOnPath(path, Math.max(0, progress - 0.001));
    const after = pointOnPath(path, Math.min(1, progress + 0.001));
    const dx = after[0] - before[0],
      dy = after[1] - before[1];
    const tangent = Math.hypot(dx, dy) || 1;
    const pressure = Math.max(
      0.25,
      Math.min(
        1,
        0.42 +
          0.52 * Math.sin(Math.PI * progress) ** 0.7 +
          0.06 * Math.sin(7 * Math.PI * progress),
      ),
    );
    const tip =
      end < 1 ? Math.min(1, 0.12 + ((end - progress) * length) / 14) : 1;
    const radius = (path.lineWidth * pressure * tip) / 2;
    const nx = (-dy / tangent) * radius,
      ny = (dx / tangent) * radius;
    left.push([point[0] + nx, point[1] + ny]);
    right.push([point[0] - nx, point[1] - ny]);
  }
  return [...left, ...right.reverse()];
}
