import type { Point } from "../../node-transform.ts";
import { triangleArea } from "./geometry.ts";

/** Fixed serial edge-improvement passes; contours and pin vertices never move. */
export function improveMeshTriangles(
  vertices: readonly Point[],
  indices: number[],
) {
  for (let pass = 0; pass < 8; pass++) {
    const edges = new Map<number, [number, number, number, number]>();
    const touched = new Set<number>();
    for (let face = 0; face < indices.length; face += 3) {
      for (let side = 0; side < 3; side++) {
        const a = indices[face + side]!,
          b = indices[face + ((side + 1) % 3)]!,
          c = indices[face + ((side + 2) % 3)]!;
        const key = Math.min(a, b) * 32768 + Math.max(a, b);
        const prior = edges.get(key);
        if (!prior) {
          edges.set(key, [face, a, b, c]);
          continue;
        }
        const [other, pa, pb, d] = prior;
        if (touched.has(face) || touched.has(other) || pa !== b || pb !== a)
          continue;
        const va = vertices[a]!,
          vb = vertices[b]!,
          vc = vertices[c]!,
          vd = vertices[d]!;
        // Both old faces have the same positive winding from Earcut/pin insertion.
        const winding = Math.sign(triangleArea(va, vb, vc));
        if (
          triangleArea(vc, vd, vb) * winding <= 1e-10 ||
          triangleArea(vd, vc, va) * winding <= 1e-10
        )
          continue;
        const before = Math.min(quality(va, vb, vc), quality(vb, va, vd));
        const after = Math.min(quality(vc, vd, vb), quality(vd, vc, va));
        if (after <= before + 1e-10) continue;
        indices.splice(face, 3, c, d, b);
        indices.splice(other, 3, d, c, a);
        touched.add(face);
        touched.add(other);
        break;
      }
    }
  }
}
function quality(a: Point, b: Point, c: Point) {
  const squared = (p: Point, q: Point) =>
    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  return (
    Math.abs(triangleArea(a, b, c)) /
    (squared(a, b) + squared(b, c) + squared(c, a))
  );
}
