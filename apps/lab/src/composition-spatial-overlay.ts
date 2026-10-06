import {
  cameraFrustum,
  projectLocalPoint,
  type CameraGeometry,
  type Homography,
} from "../../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import type { EvaluatedLayer } from "../../../packages/renderer-core/src/composition/evaluate/types.ts";
import {
  transformPoint,
  type Matrix,
  type Point,
} from "../../../packages/renderer-core/src/node-transform.ts";
export function overlayHomographyPoint(h: Homography, p: Point): Point | null {
  const denominator = h[6] * p[0] + h[7] * p[1] + h[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= 1e-12)
    return null;
  const result: Point = [
    (h[0] * p[0] + h[1] * p[1] + h[2]) / denominator,
    (h[3] * p[0] + h[4] * p[1] + h[5]) / denominator,
  ];
  return result.every(Number.isFinite) ? result : null;
}
export function spatialOverlayPoint(
  state: EvaluatedLayer,
  matrix: Matrix,
  outer: Matrix,
  outerHomography: Homography | undefined,
  point: Point,
): Point | null {
  if (state.projection) {
    const projected = projectLocalPoint(state.projection, point);
    if (!projected) return null;
    return outerHomography
      ? overlayHomographyPoint(outerHomography, projected)
      : transformPoint(outer, projected);
  }
  return outerHomography
    ? overlayHomographyPoint(
        outerHomography,
        transformPoint(state.screenMatrix, point),
      )
    : transformPoint(matrix, point);
}
/** Real world-space near/focus-plane corners, displayed as an X/Z (or vertical-camera X/Y) inset. */
export function cameraFrustumOverlay(
  camera: CameraGeometry,
  width: number,
  height: number,
) {
  const distance = Math.max(
    camera.nearClip,
    Math.min(camera.farClip, camera.focusDistance),
  );
  const near = cameraFrustum(camera, camera.nearClip),
    focus = cameraFrustum(camera, distance);
  const vertical = Math.hypot(camera.forward[0], camera.forward[2]) <= 1e-9,
    axis = vertical ? 1 : 2;
  const world = [camera.position, ...near, ...focus];
  const xs = world.map((point) => point[0]),
    ys = world.map((point) => point[axis]!);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    spanX = Math.max(1, Math.max(...xs) - left),
    spanY = Math.max(1, Math.max(...ys) - top);
  const w = Math.min(240, width * 0.3),
    h = Math.min(160, height * 0.3),
    scale = Math.min(w / spanX, h / spanY);
  const x = width - w - 8 + (w - spanX * scale) / 2,
    y = height - h - 8 + (h - spanY * scale) / 2;
  const map = (point: readonly number[]): Point => [
    x + (point[0]! - left) * scale,
    y + (point[axis]! - top) * scale,
  ];
  return {
    near,
    focus,
    distance,
    axes: vertical ? "X/Y" : "X/Z",
    position: map(camera.position),
    nearPoints: near.map(map),
    focusPoints: focus.map(map),
    label: [width - w - 8, height - h - 14] as Point,
  };
}
