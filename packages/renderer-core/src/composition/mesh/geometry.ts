import type { Point } from "../../node-transform.ts";
export type PuppetPin = { rest: Point; target: Point };
export type StarchRegion = { center: Point; radius: number; strength: number };
export type OverlapRegion = { center: Point; radius: number; depth: number };
type RigidFit = { source: Point; target: Point; cosine: number; sine: number };

/** Closed-form rigid MLS, with serial reductions in authored pin order. */
export function rigidMlsPoint(point: Point, pins: readonly PuppetPin[]): Point {
  const pinned = pinTarget(point, pins);
  return pinned ?? applyFit(point, rigidFit(point, pins));
}
function pinTarget(
  point: Point,
  pins: readonly PuppetPin[],
): Point | undefined {
  for (const pin of pins)
    if (distanceSquared(point, pin.rest) <= 1e-20) return [...pin.target];
  return undefined;
}
function distanceSquared(a: Point, b: Point): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}
function rigidFit(point: Point, pins: readonly PuppetPin[]): RigidFit {
  const source: Point = [0, 0],
    target: Point = [0, 0];
  if (!pins.length) return { source, target, cosine: 1, sine: 0 };
  const weights = pins.map(
    (pin) => 1 / Math.max(1e-12, distanceSquared(point, pin.rest)),
  );
  let total = 0;
  for (let i = 0; i < pins.length; i++) {
    const weight = weights[i]!,
      pin = pins[i]!;
    total += weight;
    source[0] += pin.rest[0] * weight;
    source[1] += pin.rest[1] * weight;
    target[0] += pin.target[0] * weight;
    target[1] += pin.target[1] * weight;
  }
  for (const axis of [0, 1] as const) {
    source[axis] /= total;
    target[axis] /= total;
  }
  if (pins.length === 1) return { source, target, cosine: 1, sine: 0 };
  let dot = 0,
    cross = 0,
    scale = 0;
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!,
      weight = weights[i]!;
    const px = pin.rest[0] - source[0],
      py = pin.rest[1] - source[1];
    const qx = pin.target[0] - target[0],
      qy = pin.target[1] - target[1];
    dot += weight * (px * qx + py * qy);
    cross += weight * (px * qy - py * qx);
    scale += weight * Math.hypot(px, py) * Math.hypot(qx, qy);
  }
  const length = Math.hypot(dot, cross);
  if (!Number.isFinite(length) || length <= Number.EPSILON * scale || !length)
    throw Error(
      "comp-mesh-solver: collapsed rigid fit; separate the pin targets",
    );
  return { source, target, cosine: dot / length, sine: cross / length };
}
function applyFit(point: Point, fit: RigidFit): Point {
  const x = point[0] - fit.source[0],
    y = point[1] - fit.source[1];
  return [
    fit.target[0] + fit.cosine * x - fit.sine * y,
    fit.target[1] + fit.sine * x + fit.cosine * y,
  ];
}

/** Full stiffness in the inner half-radius, smooth falloff to zero at the boundary.
 * Authored regions blend in order; hard pin targets always take precedence.
 */
export function deformPuppetPoint(
  point: Point,
  pins: readonly PuppetPin[],
  starch: readonly StarchRegion[],
): Point {
  const pinned = pinTarget(point, pins);
  if (pinned) return pinned;
  let output = rigidMlsPoint(point, pins);
  for (const region of starch) {
    if (region.strength <= 0) continue;
    const distance =
      Math.sqrt(distanceSquared(point, region.center)) / region.radius;
    if (distance >= 1) continue;
    const edge = Math.max(0, 2 * distance - 1);
    const weight = region.strength * (1 - edge * edge * (3 - 2 * edge));
    const rigid = applyFit(point, rigidFit(region.center, pins));
    output = [
      output[0] + weight * (rigid[0] - output[0]),
      output[1] + weight * (rigid[1] - output[1]),
    ];
  }
  return output;
}
function bernstein(degree: number, index: number, value: number): number {
  let coefficient = 1;
  for (let k = 1; k <= index; k++) coefficient *= (degree - k + 1) / k;
  return coefficient * value ** index * (1 - value) ** (degree - index);
}
/** Tensor-product Bezier patch; controls use row-major order. */
export function bezierMeshPoint(
  uv: Point,
  columns: number,
  rows: number,
  controls: readonly Point[],
): Point {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    columns > 8 ||
    rows < 2 ||
    rows > 8 ||
    controls.length !== rows * columns
  )
    throw Error(
      "comp-mesh-grid: a 2x2 through 8x8 grid needs one control per vertex",
    );
  const point: Point = [0, 0];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const weight =
        bernstein(columns - 1, column, uv[0]) * bernstein(rows - 1, row, uv[1]);
      const control = controls[row * columns + column]!;
      point[0] += weight * control[0];
      point[1] += weight * control[1];
    }
  return point;
}
export function triangleArea(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
/** Return triangle ordinals whose orientation changed or whose area collapsed. */
export function triangleFlips(
  rest: readonly Point[],
  moved: readonly Point[],
  indices: readonly number[],
): number[] {
  if (
    rest.length !== moved.length ||
    indices.length % 3 ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= rest.length)
  )
    throw Error(
      "comp-mesh-topology: inconsistent vertices and triangle indices",
    );
  const flips: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!,
      b = indices[i + 1]!,
      c = indices[i + 2]!;
    const original = triangleArea(rest[a]!, rest[b]!, rest[c]!);
    const current = triangleArea(moved[a]!, moved[b]!, moved[c]!);
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(original) ||
      original * current <= 0 ||
      Math.abs(current) <= Math.max(1e-12, Math.abs(original) * 1e-8)
    )
      flips.push(i / 3);
  }
  return flips;
}
/** Last matching authored region owns the depth; original triangle order breaks ties. */
export function orderMeshTriangles(
  vertices: readonly Point[],
  indices: readonly number[],
  regions: readonly OverlapRegion[],
): number[] {
  const triangles = Array.from(
    { length: indices.length / 3 },
    (_, triangle) => {
      const a = vertices[indices[triangle * 3]!]!,
        b = vertices[indices[triangle * 3 + 1]!]!,
        c = vertices[indices[triangle * 3 + 2]!]!;
      const center: Point = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
      ];
      let depth = 0;
      for (const region of regions)
        if (distanceSquared(center, region.center) <= region.radius ** 2)
          depth = region.depth;
      return { triangle, depth };
    },
  );
  triangles.sort((a, b) => a.depth - b.depth || a.triangle - b.triangle);
  return triangles.flatMap(({ triangle }) =>
    indices.slice(triangle * 3, triangle * 3 + 3),
  );
}
