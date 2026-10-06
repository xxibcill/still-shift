import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
export type Point = [number, number];
export type Matrix = [number, number, number, number, number, number];
type Pose = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX?: number | undefined;
  skewY?: number | undefined;
  anchorX?: number | undefined;
  anchorY?: number | undefined;
};
export function nodeMatrix(node: PreparedNode, state: Pose): Matrix {
  const angle = (state.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  let a = cos * state.scaleX,
    b = sin * state.scaleX,
    c = -sin * state.scaleY,
    d = cos * state.scaleY;
  if (state.skewX !== undefined || state.skewY !== undefined) {
    const kx = Math.tan(((state.skewX ?? 0) * Math.PI) / 180),
      ky = Math.tan(((state.skewY ?? 0) * Math.PI) / 180);
    a = (cos - sin * ky) * state.scaleX;
    b = (sin + cos * ky) * state.scaleX;
    c = (cos * kx - sin) * state.scaleY;
    d = (sin * kx + cos) * state.scaleY;
  }
  const ox = node.width * (state.anchorX ?? node.origin[0]),
    oy = node.height * (state.anchorY ?? node.origin[1]);
  // Moving the anchor preserves the artwork's placement. Attach/follow constraints
  // use the animated anchor as their reference point in this compensated matrix.
  const dx = ox - node.width * node.origin[0],
    dy = oy - node.height * node.origin[1];
  const x = state.x + (a - 1) * dx + c * dy,
    y = state.y + b * dx + (d - 1) * dy;
  return [a, b, c, d, x + ox - a * ox - c * oy, y + oy - b * ox - d * oy];
}
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/** Affine XY map; spatial projection uses the explicit homogeneous camera map. */
export function transformPoint(matrix: Matrix, [x, y]: readonly [number, number, number?]): Point {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}
export function inverseMatrix(m: Matrix): Matrix {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(determinant) < 1e-12)
    throw new Error("Cannot invert collapsed transform");
  return [
    m[3] / determinant,
    -m[1] / determinant,
    -m[2] / determinant,
    m[0] / determinant,
    (m[2] * m[5] - m[3] * m[4]) / determinant,
    (m[1] * m[4] - m[0] * m[5]) / determinant,
  ];
}
export function imagePlacement(
  node: { width: number; height: number; fit: "contain" | "cover" | "stretch" },
  crop: [number, number, number, number],
  footAnchor?: [number, number],
) {
  const [sx, sy, sw, sh] = crop;
  const ratio =
    node.fit === "cover"
      ? Math.max(node.width / sw, node.height / sh)
      : Math.min(node.width / sw, node.height / sh);
  const width = node.fit === "stretch" ? node.width : sw * ratio,
    height = node.fit === "stretch" ? node.height : sh * ratio;
  return {
    sx,
    sy,
    sw,
    sh,
    width,
    height,
    x: footAnchor
      ? node.width / 2 - width * footAnchor[0]
      : (node.width - width) / 2,
    y: footAnchor
      ? node.height - height * footAnchor[1]
      : (node.height - height) / 2,
  };
}
