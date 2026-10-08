import type { Matrix, Point } from "../../node-transform.ts";
import type { Bounds } from "./types.ts";

export type Point3 = [number, number, number];
/** Column-major affine world matrix; the camera itself uses an orthonormal basis. */
export type Matrix4 = [
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
/** Row-major homogeneous map from local plane coordinates to screen pixels. */
export type Homography = [
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
export type SpatialTransform = {
  anchor: Point3;
  position: Point3;
  scale: Point3;
  orientation: Point3;
  rotation: number;
  rotationX: number;
  rotationY: number;
  skewX: number;
  skewY: number;
};
export type CameraGeometry = {
  width: number;
  height: number;
  position: Point3;
  right: Point3;
  down: Point3;
  forward: Point3;
  zoom: number;
  viewOffset: Point;
  nearClip: number;
  farClip: number;
  filmSize: number;
  focusDistance: number;
  aperture: number;
  blurLevel: number;
  blurModel: "lens" | "gaussian";
  maxBlur: number;
};
export type ProjectedPlane = {
  localBounds: Bounds;
  homography: Homography;
  inverse: Homography | null;
  /** Camera depth is `depth[0]*localX + depth[1]*localY + depth[2]`. */
  depth: Point3;
  polygon: Point[];
  localPolygon: Point[];
  bounds: Bounds | null;
  /** Only present when the homogeneous denominator is constant and nonzero. */
  affineMatrix: Matrix | null;
  nearClip: number;
  farClip: number;
};

const radians = (angle: number) => (angle * Math.PI) / 180;
const identity4 = (): Matrix4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];
export function affineMatrix4(matrix: Matrix): Matrix4 {
  return [
    matrix[0],
    matrix[1],
    0,
    0,
    matrix[2],
    matrix[3],
    0,
    0,
    0,
    0,
    1,
    0,
    matrix[4],
    matrix[5],
    0,
    1,
  ];
}
export function multiplyWorldMatrices(
  parent: Matrix4,
  local: Matrix4,
): Matrix4 {
  const matrix = multiply4(parent, local);
  if (!matrix.every(Number.isFinite))
    throw new Error("Non-finite 3D parent world transform");
  return matrix;
}
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a: Point3, b: Point3): Point3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
function normalized(vector: Point3, label: string): Point3 {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length <= 1e-12)
    throw new Error(
      `Invalid camera ${label}: a nonzero finite basis is required`,
    );
  return vector.map((value) => value / length) as Point3;
}
function multiply4(a: Matrix4, b: Matrix4): Matrix4 {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++)
        result[column * 4 + row]! += a[k * 4 + row]! * b[column * 4 + k]!;
  return result as Matrix4;
}
function rotation4(axis: 0 | 1 | 2, degrees: number): Matrix4 {
  const result = identity4(),
    c = Math.cos(radians(degrees)),
    s = Math.sin(radians(degrees));
  if (axis === 0) {
    result[5] = c;
    result[6] = s;
    result[9] = -s;
    result[10] = c;
  } else if (axis === 1) {
    result[0] = c;
    result[2] = -s;
    result[8] = s;
    result[10] = c;
  } else {
    result[0] = c;
    result[1] = s;
    result[4] = -s;
    result[5] = c;
  }
  return result;
}

/** Parent · T(position) · Oz · Oy · Ox · Rz · Ry · Rx · skewXY · S · T(-anchor). */
export function layerMatrix3d(
  transform: SpatialTransform,
  parent?: Matrix4,
): Matrix4 {
  const t = transform;
  let matrix = identity4();
  matrix[12] = t.position[0];
  matrix[13] = t.position[1];
  matrix[14] = t.position[2];
  for (const [axis, angle] of [
    [2, t.orientation[2]],
    [1, t.orientation[1]],
    [0, t.orientation[0]],
    [2, t.rotation],
    [1, t.rotationY],
    [0, t.rotationX],
  ] as const)
    matrix = multiply4(matrix, rotation4(axis, angle));
  const skew = identity4();
  skew[4] = Math.tan(radians(t.skewX));
  skew[1] = Math.tan(radians(t.skewY));
  matrix = multiply4(matrix, skew);
  for (let axis = 0; axis < 3; axis++)
    for (let row = 0; row < 3; row++) matrix[axis * 4 + row]! *= t.scale[axis]!;
  for (let row = 0; row < 3; row++)
    matrix[12 + row]! -=
      matrix[row]! * t.anchor[0] +
      matrix[4 + row]! * t.anchor[1] +
      matrix[8 + row]! * t.anchor[2];
  if (parent) matrix = multiply4(parent, matrix);
  if (!matrix.every(Number.isFinite))
    throw new Error("Non-finite 3D world transform");
  return matrix;
}

export function worldPoint(matrix: Matrix4, point: Point3): Point3 {
  return [0, 1, 2].map(
    (row) =>
      matrix[row]! * point[0] +
      matrix[4 + row]! * point[1] +
      matrix[8 + row]! * point[2] +
      matrix[12 + row]!,
  ) as Point3;
}

/** Film size/aperture are millimetres; world distances and zoom are pixel units. */
export function cameraGeometry(options: {
  width: number;
  height: number;
  world: Matrix4;
  pointOfInterest?: Point3;
  viewOffset?: Point;
  zoom: number;
  nearClip?: number;
  farClip?: number;
  filmSize?: number;
  focusDistance?: number;
  aperture?: number;
  blurLevel?: number;
  blurModel?: "lens" | "gaussian";
  maxBlur?: number;
}): CameraGeometry {
  const { width, height, world, zoom } = options;
  const viewOffset: Point = [...(options.viewOffset ?? [0, 0])];
  if (
    viewOffset.length !== 2 ||
    !viewOffset.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000,
    )
  )
    throw Error(
      "Camera view offset must contain two finite values within ±1000000",
    );
  const nearClip = options.nearClip ?? 0.01,
    farClip = options.farClip ?? 10_000_000;
  const filmSize = options.filmSize ?? 36,
    focusDistance = options.focusDistance ?? zoom;
  const aperture = options.aperture ?? 0,
    blurLevel = options.blurLevel ?? 1;
  const maxBlur = options.maxBlur ?? 128,
    blurModel = options.blurModel ?? "lens";
  if (
    !Number.isFinite(maxBlur) ||
    maxBlur < 0 ||
    maxBlur > 128 ||
    !["lens", "gaussian"].includes(blurModel)
  )
    throw Error("Camera focus blur model or radius cap is invalid");
  if (
    ![width, height, zoom, filmSize, focusDistance].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error(
      "Camera width, height, zoom, film size and focus distance must be finite and positive",
    );
  if (
    !Number.isFinite(nearClip) ||
    !Number.isFinite(farClip) ||
    nearClip <= 0 ||
    farClip <= nearClip
  )
    throw new Error("Camera clip planes must be finite, positive and ordered");
  if (
    ![aperture, blurLevel].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new Error(
      "Camera aperture and blur level must be finite and nonnegative",
    );
  if (!world.every(Number.isFinite))
    throw new Error("Camera world basis must be finite");
  const worldRight = normalized(
      [world[0], world[1], world[2]],
      "right transform basis",
    ),
    worldDown = normalized(
      [world[4], world[5], world[6]],
      "down transform basis",
    ),
    worldForward = normalized(
      [world[8], world[9], world[10]],
      "forward transform basis",
    );
  if (
    Math.abs(dot(worldRight, cross(worldDown, worldForward))) <=
    Number.EPSILON * 16
  )
    throw Error("Camera world basis must be nonsingular");
  const position: Point3 = [world[12], world[13], world[14]];
  const forward = normalized(
    options.pointOfInterest
      ? subtract(options.pointOfInterest, position)
      : [world[8], world[9], world[10]],
    options.pointOfInterest ? "point of interest" : "forward basis",
  );
  let downHint: Point3 = [world[4], world[5], world[6]];
  if (
    options.pointOfInterest &&
    Math.hypot(...cross(downHint, forward)) <= 1e-12
  )
    downHint = Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const right = normalized(cross(downHint, forward), "right basis");
  const down = normalized(cross(forward, right), "down basis");
  return {
    width,
    height,
    position,
    right,
    down,
    forward,
    zoom,
    viewOffset,
    nearClip,
    farClip,
    filmSize,
    focusDistance,
    aperture,
    blurLevel,
    blurModel,
    maxBlur,
  };
}
function cameraPoint(camera: CameraGeometry, world: Point3): Point3 {
  const delta = subtract(world, camera.position);
  return [
    dot(delta, camera.right),
    dot(delta, camera.down),
    dot(delta, camera.forward),
  ];
}
export function projectWorldPoint(
  camera: CameraGeometry,
  world: Point3,
): Point | null {
  const [x, y, z] = cameraPoint(camera, world);
  if (z < camera.nearClip || z > camera.farClip) return null;
  return [
    camera.width / 2 + camera.viewOffset[0] + (camera.zoom * x) / z,
    camera.height / 2 + camera.viewOffset[1] + (camera.zoom * y) / z,
  ];
}
export function cameraDepth(camera: CameraGeometry, world: Point3): number {
  return cameraPoint(camera, world)[2];
}
/** Four world-space corners at a positive camera-space distance, clockwise in screen space. */
export function cameraFrustum(
  camera: CameraGeometry,
  distance: number,
): Point3[] {
  if (
    !Number.isFinite(distance) ||
    distance < camera.nearClip ||
    distance > camera.farClip
  )
    throw Error("Frustum distance must lie between the camera clip planes");
  return [
    [0, 0],
    [camera.width, 0],
    [camera.width, camera.height],
    [0, camera.height],
  ].map(([x, y]) => {
    const horizontal =
      ((x! - camera.width / 2 - camera.viewOffset[0]) * distance) / camera.zoom;
    const vertical =
      ((y! - camera.height / 2 - camera.viewOffset[1]) * distance) /
      camera.zoom;
    return [0, 1, 2].map(
      (axis) =>
        camera.position[axis]! +
        camera.forward[axis]! * distance +
        camera.right[axis]! * horizontal +
        camera.down[axis]! * vertical,
    ) as Point3;
  });
}
export function inverseHomography(matrix: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h,
    B = f * g - d * i,
    C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  const error =
    Number.EPSILON * 8 * (Math.abs(a * A) + Math.abs(b * B) + Math.abs(c * C));
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= error)
    return null;
  const result = [
    A,
    c * h - b * i,
    b * f - c * e,
    B,
    a * i - c * g,
    c * d - a * f,
    C,
    b * g - a * h,
    a * e - b * d,
  ].map((value) => value / determinant) as Homography;
  return result.every(Number.isFinite) ? result : null;
}
function clipDepth(
  polygon: Point[],
  depth: Point3,
  clip: number,
  keepGreater: boolean,
): Point[] {
  const result: Point[] = [];
  const distance = ([x, y]: Point) =>
    (depth[0] * x + depth[1] * y + depth[2] - clip) * (keepGreater ? 1 : -1);
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!,
      b = polygon[(index + 1) % polygon.length]!;
    const da = distance(a),
      db = distance(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}
function homographyPoint(h: Homography, [x, y]: Point): Point {
  const divisor = h[6] * x + h[7] * y + h[8];
  return [
    (h[0] * x + h[1] * y + h[2]) / divisor,
    (h[3] * x + h[4] * y + h[5]) / divisor,
  ];
}

/** Project the local z=0 coordinate plane even when its owner has no drawable bounds. */
export function planeHomography(
  world: Matrix4,
  camera: CameraGeometry,
): Homography {
  const origin = cameraPoint(camera, worldPoint(world, [0, 0, 0]));
  const x = subtract(cameraPoint(camera, worldPoint(world, [1, 0, 0])), origin);
  const y = subtract(cameraPoint(camera, worldPoint(world, [0, 1, 0])), origin);
  const cx = camera.width / 2 + camera.viewOffset[0],
    cy = camera.height / 2 + camera.viewOffset[1],
    z = camera.zoom;
  return [
    z * x[0] + cx * x[2],
    z * y[0] + cx * y[2],
    z * origin[0] + cx * origin[2],
    z * x[1] + cy * x[2],
    z * y[1] + cy * y[2],
    z * origin[1] + cy * origin[2],
    x[2],
    y[2],
    origin[2],
  ];
}

/** Clip the local z=0 artwork plane before projecting; no affine perspective approximation. */
export function projectPlane(
  world: Matrix4,
  camera: CameraGeometry,
  bounds: Bounds,
): ProjectedPlane {
  const homography = planeHomography(world, camera);
  const depth: Point3 = [homography[6], homography[7], homography[8]];
  const inverse = inverseHomography(homography);
  const localPolygon = clipDepth(
    clipDepth(
      [
        [bounds.left, bounds.top],
        [bounds.right, bounds.top],
        [bounds.right, bounds.bottom],
        [bounds.left, bounds.bottom],
      ],
      depth,
      camera.nearClip,
      true,
    ),
    depth,
    camera.farClip,
    false,
  );
  const polygon = inverse
    ? localPolygon.map((point) => homographyPoint(homography, point))
    : [];
  const valid = polygon.length >= 3 && polygon.flat().every(Number.isFinite);
  const projectedBounds = valid
    ? {
        left: Math.min(...polygon.map((point) => point[0])),
        top: Math.min(...polygon.map((point) => point[1])),
        right: Math.max(...polygon.map((point) => point[0])),
        bottom: Math.max(...polygon.map((point) => point[1])),
      }
    : null;
  const affineMatrix: Matrix | null =
    inverse &&
    depth[0] === 0 &&
    depth[1] === 0 &&
    depth[2] >= camera.nearClip &&
    depth[2] <= camera.farClip
      ? [
          homography[0] / depth[2],
          homography[3] / depth[2],
          homography[1] / depth[2],
          homography[4] / depth[2],
          homography[2] / depth[2],
          homography[5] / depth[2],
        ]
      : null;
  return {
    localBounds: { ...bounds },
    homography,
    inverse,
    depth,
    polygon,
    localPolygon,
    bounds: projectedBounds,
    affineMatrix,
    nearClip: camera.nearClip,
    farClip: camera.farClip,
  };
}
export function projectLocalPoint(
  plane: ProjectedPlane,
  point: Point,
): Point | null {
  const depth =
    plane.depth[0] * point[0] + plane.depth[1] * point[1] + plane.depth[2];
  return plane.inverse && depth >= plane.nearClip && depth <= plane.farClip
    ? homographyPoint(plane.homography, point)
    : null;
}
/** Declared screen-space circle of confusion, capped at CE8's 128-pixel lens budget. */
export function circleOfConfusion(
  camera: CameraGeometry,
  depth: number,
): number {
  if (camera.aperture === 0 || camera.blurLevel === 0 || depth <= 0) return 0;
  return Math.min(
    camera.maxBlur,
    ((camera.aperture * camera.zoom) / (2 * camera.filmSize)) *
      Math.abs(1 - camera.focusDistance / depth) *
      camera.blurLevel,
  );
}

export function multiplyHomographies(a: Homography, b: Homography): Homography {
  return [0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((column) =>
      [0, 1, 2].reduce(
        (sum, k) => sum + a[row * 3 + k]! * b[k * 3 + column]!,
        0,
      ),
    ),
  ) as Homography;
}
export function affineHomography(m: Matrix): Homography {
  return [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}
