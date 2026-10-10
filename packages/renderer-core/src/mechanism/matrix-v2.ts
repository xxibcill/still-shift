import type { MechanismVector } from "@still-shift/scene-contract";
import { IDENTITY_MATRIX } from "./matrix.ts";
import type { MechanismMatrix } from "./matrix.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";

export function inverseMechanismMatrixV2(
  matrix: MechanismMatrix,
): MechanismMatrix {
  const [a, d, g] = matrix;
  const b = matrix[4],
    e = matrix[5],
    h = matrix[6];
  const c = matrix[8],
    f = matrix[9],
    i = matrix[10];
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (determinant === 0 || !Number.isFinite(determinant))
    throw new MechanismEvaluationErrorV2(
      "Reference transform is singular or nonfinite",
      { code: "mechanism-transform", path: ["parts"] },
    );
  const inverse = [
    (e * i - f * h) / determinant,
    (f * g - d * i) / determinant,
    (d * h - e * g) / determinant,
    0,
    (c * h - b * i) / determinant,
    (a * i - c * g) / determinant,
    (b * g - a * h) / determinant,
    0,
    (b * f - c * e) / determinant,
    (c * d - a * f) / determinant,
    (a * e - b * d) / determinant,
    0,
    0,
    0,
    0,
    1,
  ];
  for (let row = 0; row < 3; row++)
    inverse[12 + row] =
      -inverse[row]! * matrix[12] -
      inverse[4 + row]! * matrix[13] -
      inverse[8 + row]! * matrix[14];
  if (inverse.some((value) => !Number.isFinite(value)))
    throw new MechanismEvaluationErrorV2("Reference inverse is nonfinite", {
      code: "mechanism-transform",
      path: ["parts"],
    });
  return inverse as unknown as MechanismMatrix;
}

export function translationAlongAxisV2(
  axis: readonly number[],
  distance: number,
): MechanismMatrix {
  return [
    ...IDENTITY_MATRIX.slice(0, 12),
    axis[0]! * distance,
    axis[1]! * distance,
    axis[2]! * distance,
    1,
  ] as unknown as MechanismMatrix;
}

export function rotationAroundAxisV2(
  axis: readonly number[],
  angle: number,
  pivot: readonly number[],
): MechanismMatrix {
  const [x, y, z] = axis as readonly [number, number, number];
  const cosine = Math.cos(angle),
    sine = Math.sin(angle),
    remainder = 1 - cosine;
  const result = [
    cosine + x * x * remainder,
    y * x * remainder + z * sine,
    z * x * remainder - y * sine,
    0,
    x * y * remainder - z * sine,
    cosine + y * y * remainder,
    z * y * remainder + x * sine,
    0,
    x * z * remainder + y * sine,
    y * z * remainder - x * sine,
    cosine + z * z * remainder,
    0,
    0,
    0,
    0,
    1,
  ];
  for (let row = 0; row < 3; row++)
    result[12 + row] =
      pivot[row]! -
      result[row]! * pivot[0]! -
      result[4 + row]! * pivot[1]! -
      result[8 + row]! * pivot[2]!;
  return result as unknown as MechanismMatrix;
}

export function transformMechanismDirectionV2(
  matrix: MechanismMatrix,
  vector: readonly number[],
): MechanismVector {
  return [0, 1, 2].map(
    (row) =>
      matrix[row]! * vector[0]! +
      matrix[4 + row]! * vector[1]! +
      matrix[8 + row]! * vector[2]!,
  ) as MechanismVector;
}
