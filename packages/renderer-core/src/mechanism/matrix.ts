import type { MechanismVector } from "@still-shift/scene-contract";

/** Column-major matrices; translation occupies indices 12–14. */
export type MechanismMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export const IDENTITY_MATRIX: MechanismMatrix = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

export function multiplyMatrices(
  left: MechanismMatrix,
  right: MechanismMatrix,
): MechanismMatrix {
  const result = new Array<number>(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      result[column * 4 + row] =
        left[row]! * right[column * 4]! +
        left[4 + row]! * right[column * 4 + 1]! +
        left[8 + row]! * right[column * 4 + 2]! +
        left[12 + row]! * right[column * 4 + 3]!;
    }
  }
  return result as unknown as MechanismMatrix;
}

/** Local +X motion composed after the authored rigid transform. */
export function translateMatrixX(
  matrix: MechanismMatrix,
  x: number,
): MechanismMatrix {
  const result = [...matrix];
  for (let row = 0; row < 4; row++)
    result[12 + row] = matrix[12 + row]! + matrix[row]! * x;
  return result as unknown as MechanismMatrix;
}

export function transformPoint(
  matrix: MechanismMatrix,
  point: readonly number[],
): MechanismVector {
  return [0, 1, 2].map(
    (row) =>
      matrix[row]! * point[0]! +
      matrix[4 + row]! * point[1]! +
      matrix[8 + row]! * point[2]! +
      matrix[12 + row]!,
  ) as MechanismVector;
}

/** T(position) Rx Ry Rz S(scale) T(-pivot), with Euler angles in radians. */
export function matrixFromTransform(transform: {
  readonly position: readonly number[];
  readonly rotation: readonly number[];
  readonly scale: readonly number[];
  readonly pivot: readonly number[];
}): MechanismMatrix {
  const [x, y, z] = transform.rotation as readonly [number, number, number];
  const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)];
  const [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
  const [scaleX, scaleY, scaleZ] = transform.scale as readonly [
    number,
    number,
    number,
  ];
  const result: number[] = [
    cy * cz * scaleX,
    (cx * sz + sx * sy * cz) * scaleX,
    (sx * sz - cx * sy * cz) * scaleX,
    0,
    -cy * sz * scaleY,
    (cx * cz - sx * sy * sz) * scaleY,
    (sx * cz + cx * sy * sz) * scaleY,
    0,
    sy * scaleZ,
    -sx * cy * scaleZ,
    cx * cy * scaleZ,
    0,
    0,
    0,
    0,
    1,
  ];
  for (let row = 0; row < 3; row++)
    result[12 + row] =
      transform.position[row]! -
      result[row]! * transform.pivot[0]! -
      result[4 + row]! * transform.pivot[1]! -
      result[8 + row]! * transform.pivot[2]!;
  return result as unknown as MechanismMatrix;
}
