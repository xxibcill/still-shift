import type { Matrix } from "../../node-transform.ts";
import { bezierBounds } from "../shapes/path.ts";
import {
  projectPlane,
  type CameraGeometry,
  type Matrix4,
} from "../evaluate/spatial-geometry.ts";
import type { EvaluatedMask } from "../evaluate/types.ts";
import {
  localSurfaceBounds,
  planePlacement,
  type ProjectivePlacement,
} from "./projective-placement.ts";
export type ProjectedMask = {
  width: number;
  height: number;
  placement: ProjectivePlacement | null;
};
/** Rasterize the actual local path/support, then project coverage before global inversion/combination. */
export function projectedMaskGeometry(
  mask: EvaluatedMask,
  world: Matrix4,
  camera: CameraGeometry,
  outer: Matrix,
  node: string,
) {
  const path = bezierBounds(mask.path) ?? {
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
  };
  const margin = Math.abs(mask.expansion) + mask.feather * 1.5 + 2;
  const domain = {
    left: path.left - margin,
    top: path.top - margin,
    right: path.right + margin,
    bottom: path.bottom + margin,
  };
  const local = localSurfaceBounds(domain, node);
  const matrix: Matrix = [1, 0, 0, 1, -local.origin[0], -local.origin[1]];
  return {
    matrix,
    transforms: [matrix],
    projected: {
      width: local.width,
      height: local.height,
      placement: planePlacement(
        projectPlane(world, camera, domain),
        outer,
        local.origin,
      ),
    },
  };
}
