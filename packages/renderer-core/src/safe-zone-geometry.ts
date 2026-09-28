export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SafeZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const boundsFromPoints = (
  points: readonly (readonly [number, number])[],
) => ({
  left: Math.min(...points.map((point) => point[0])),
  top: Math.min(...points.map((point) => point[1])),
  right: Math.max(...points.map((point) => point[0])),
  bottom: Math.max(...points.map((point) => point[1])),
});

export const overlapsSafeZone = (bounds: Bounds, zone: SafeZone) =>
  bounds.left < zone.x + zone.width &&
  bounds.right > zone.x &&
  bounds.top < zone.y + zone.height &&
  bounds.bottom > zone.y;

export function safeZoneOffset(
  bounds: Bounds,
  zones: readonly SafeZone[],
  inset: number,
  width: number,
  height: number,
): [number, number] | undefined {
  const overlaps = zones.filter((zone) => overlapsSafeZone(bounds, zone));
  if (!overlaps.length) return [0, 0];
  const candidates = overlaps.flatMap((zone): [number, number][] => [
    [zone.x - bounds.right, 0],
    [zone.x + zone.width - bounds.left, 0],
    [0, zone.y - bounds.bottom],
    [0, zone.y + zone.height - bounds.top],
  ]);
  return candidates
    .filter(([dx, dy]) => {
      const moved = {
        left: bounds.left + dx,
        top: bounds.top + dy,
        right: bounds.right + dx,
        bottom: bounds.bottom + dy,
      };
      return (
        moved.left >= inset &&
        moved.top >= inset &&
        moved.right <= width - inset &&
        moved.bottom <= height - inset &&
        zones.every((zone) => !overlapsSafeZone(moved, zone))
      );
    })
    .sort(
      ([ax, ay], [bx, by]) =>
        Math.abs(ax) + Math.abs(ay) - Math.abs(bx) - Math.abs(by),
    )[0];
}
