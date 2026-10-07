import { expect, it } from "vitest";
import { projectedMaskGeometry } from "../../packages/renderer-core/src/composition/render/projected-mask.ts";
import {
  cameraGeometry,
  layerMatrix3d,
  type SpatialTransform,
} from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import type { EvaluatedMask } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
const transform: SpatialTransform = {
  anchor: [0, 0, 0],
  position: [0, 0, 0],
  scale: [1, 1, 1],
  orientation: [0, 0, 0],
  rotation: 0,
  rotationX: 0,
  rotationY: 0,
  skewX: 0,
  skewY: 0,
};
const mask: EvaluatedMask = {
  id: "cut",
  mode: "subtract",
  inverted: true,
  feather: 4,
  expansion: 2,
  opacity: 0.5,
  path: {
    closed: true,
    vertices: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  },
};
const camera = cameraGeometry({
  width: 100,
  height: 100,
  zoom: 100,
  world: layerMatrix3d({ ...transform, position: [50, 50, -100] }),
});
it("includes local path expansion/feather before the actual mask homography", () => {
  const geometry = projectedMaskGeometry(
    mask,
    layerMatrix3d({ ...transform, position: [40, 40, 0], rotationY: 30 }),
    camera,
    [1, 0, 0, 1, 0, 0],
    "group",
  );
  expect(geometry.matrix).toEqual([1, 0, 0, 1, 10, 10]);
  expect(geometry.projected.width).toBe(30);
  expect(geometry.projected.height).toBe(30);
  expect(geometry.projected.placement!.affineMatrix).toBeNull();
  const h = geometry.projected.placement!.homography,
    w = h[6] * 10 + h[7] * 10 + h[8];
  expect((h[0] * 10 + h[1] * 10 + h[2]) / w).toBeCloseTo(40, 10);
  expect((h[3] * 10 + h[4] * 10 + h[5]) / w).toBeCloseTo(40, 10);
  expect(mask).toMatchObject({
    mode: "subtract",
    inverted: true,
    opacity: 0.5,
  });
});
it("represents wholly clipped masks as empty coverage before global inversion", () => {
  expect(
    projectedMaskGeometry(
      mask,
      layerMatrix3d({ ...transform, position: [0, 0, -200] }),
      camera,
      [1, 0, 0, 1, 0, 0],
      "group",
    ).projected.placement,
  ).toBeNull();
});
