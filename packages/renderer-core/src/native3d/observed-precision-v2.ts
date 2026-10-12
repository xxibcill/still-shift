import type {
  MechanismCamera,
  MechanismShapeLandmark,
  NativeObservedCamera,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { multiplyMatrices, transformPoint } from "../mechanism/matrix.ts";
import type { MechanismMatrix } from "../mechanism/matrix.ts";
import { inverseMechanismMatrixV2 } from "../mechanism/matrix-v2.ts";

type Vec = readonly [number, number, number];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
/** Independent camera math; this module imports no Three, DOM or graphics context. */
export function nativeExpectedObservedCameraV2(
  camera: DeepReadonly<MechanismCamera>,
  width: number,
  height: number,
): NativeObservedCamera {
  const forward = normalize(
      camera.target.map(
        (value, index) => value - camera.position[index]!,
      ) as unknown as Vec,
    ),
    right = normalize(cross(forward, camera.up)),
    up = cross(right, forward);
  const world: MechanismMatrix = [
    ...right,
    0,
    ...up,
    0,
    -forward[0],
    -forward[1],
    -forward[2],
    0,
    ...camera.position,
    1,
  ];
  const top = camera.near * Math.tan((camera.fovDegrees * Math.PI) / 360),
    vertical = 2 * top,
    horizontal = (vertical * width) / height,
    left = -horizontal / 2;
  const projection: MechanismMatrix = [
    (2 * camera.near) / horizontal,
    0,
    0,
    0,
    0,
    (2 * camera.near) / vertical,
    0,
    0,
    (2 * left + horizontal) / horizontal,
    (2 * top - vertical) / vertical,
    -(camera.far + camera.near) / (camera.far - camera.near),
    -1,
    0,
    0,
    (-2 * camera.far * camera.near) / (camera.far - camera.near),
    0,
  ];
  return {
    worldMatrix: world,
    viewMatrix: inverseMechanismMatrixV2(world),
    projectionMatrix: projection,
    near: camera.near,
    far: camera.far,
    aspect: width / height,
    fovDegrees: camera.fovDegrees,
  };
}

/** Exact intended Float32 mean, with a separate bound against the authored Float64 mean. */
export function nativeExpectedShapeLandmarkV2(
  positions: readonly number[],
  landmark: DeepReadonly<MechanismShapeLandmark>,
  owner: MechanismMatrix,
) {
  const local: [number, number, number] = [0, 0, 0],
    analytic: [number, number, number] = [0, 0, 0],
    error: [number, number, number] = [0, 0, 0];
  for (const vertex of landmark.vertexIndices)
    for (const axis of [0, 1, 2] as const) {
      const value = positions[vertex * 3 + axis]!,
        packed = Math.fround(value);
      local[axis] += packed;
      analytic[axis] += value;
      error[axis] += Math.abs(packed - value);
    }
  for (const axis of [0, 1, 2] as const) {
    local[axis] /= landmark.vertexIndices.length;
    analytic[axis] /= landmark.vertexIndices.length;
    error[axis] /= landmark.vertexIndices.length;
  }
  const worldBound = [0, 1, 2].map(
    (row) =>
      Math.abs(owner[row]!) * error[0] +
      Math.abs(owner[row + 4]!) * error[1] +
      Math.abs(owner[row + 8]!) * error[2],
  ) as [number, number, number];
  return {
    local,
    world: transformPoint(owner, local),
    analyticWorld: transformPoint(owner, analytic),
    quantizationBound: worldBound,
  };
}

/** Mirror the renderer's declared current packed bounding sphere, then test independent clip planes. */
export function nativeExpectedShapeOutsideFrustumV2(
  positions: readonly number[],
  owner: MechanismMatrix,
  camera: NativeObservedCamera,
): boolean {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index++) {
    const axis = index % 3,
      value = Math.fround(positions[index]!);
    min[axis] = Math.min(min[axis]!, value);
    max[axis] = Math.max(max[axis]!, value);
  }
  const center = min.map((value, axis) => (value + max[axis]!) / 2) as [
    number,
    number,
    number,
  ];
  let radiusSquared = 0;
  for (let index = 0; index < positions.length; index += 3)
    radiusSquared = Math.max(
      radiusSquared,
      Math.pow(Math.fround(positions[index]!) - center[0], 2) +
        Math.pow(Math.fround(positions[index + 1]!) - center[1], 2) +
        Math.pow(Math.fround(positions[index + 2]!) - center[2], 2),
    );
  const radius =
      Math.sqrt(radiusSquared) *
      Math.sqrt(
        Math.max(
          ...[0, 4, 8].map(
            (column) =>
              owner[column]! ** 2 +
              owner[column + 1]! ** 2 +
              owner[column + 2]! ** 2,
          ),
        ),
      ),
    world = transformPoint(owner, center);
  const clip = multiplyMatrices(camera.projectionMatrix, camera.viewMatrix);
  for (const [row, sign] of [
    [0, -1],
    [0, 1],
    [1, 1],
    [1, -1],
    [2, -1],
    [2, 1],
  ] as const) {
    const plane = [0, 4, 8, 12].map(
      (column) => clip[column + 3]! + sign * clip[column + row]!,
    );
    const length = Math.hypot(plane[0]!, plane[1]!, plane[2]!);
    if (
      (plane[0]! * world[0] +
        plane[1]! * world[1] +
        plane[2]! * world[2] +
        plane[3]!) /
        length <
      -radius
    )
      return true;
  }
  return false;
}
