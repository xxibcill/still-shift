type Point = [number, number];

/** Legacy attached-path geometry, shared by compilation and local provider drawing. */
export function connectorPoints(
  from: Point,
  to: Point,
  requestedBend = 0,
): Point[] {
  if (!requestedBend) return [from, to];
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [from, to];
  const bend = Math.max(-length * 0.22, Math.min(length * 0.22, requestedBend));
  const points: Point[] = Array.from({ length: 65 }, (_, index) => {
    const t = index / 64;
    const offset = 4 * t * (1 - t) * bend;
    return [
      from[0] + dx * t - (dy / length) * offset,
      from[1] + dy * t + (dx / length) * offset,
    ];
  });
  points[0] = from;
  points[64] = to;
  return points;
}
