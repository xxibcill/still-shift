import { expect, it } from "vitest";
import { cameraFacingWorld } from "../../packages/renderer-core/src/composition/evaluate/spatial-orient.ts";
import {
  cameraGeometry,
  layerMatrix3d,
  worldPoint,
  type SpatialTransform,
} from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
const transform: SpatialTransform = {
  anchor: [5, 5, 0],
  position: [75, 50, 0],
  scale: [1, 1, 1],
  orientation: [0, 0, 0],
  rotation: 0,
  rotationX: 0,
  rotationY: 0,
  skewX: 0,
  skewY: 0,
};
const camera = cameraGeometry({
  width: 100,
  height: 100,
  zoom: 100,
  world: layerMatrix3d({
    ...transform,
    anchor: [0, 0, 0],
    position: [50, 50, -100],
  }),
});
it("faces the camera around an unchanged world anchor", () => {
  const world = layerMatrix3d(transform),
    facing = cameraFacingWorld(world, undefined, transform.anchor, camera);
  expect(worldPoint(facing, transform.anchor)).toEqual([75, 50, 0]);
  expect(facing[8]).toBeCloseTo(25 / Math.hypot(25, 100), 12);
  expect(facing[10]).toBeCloseTo(100 / Math.hypot(25, 100), 12);
});
it("retains authored rotation, signed scale, skew and parent mirror parity", () => {
  const parent = layerMatrix3d({
    ...transform,
    anchor: [0, 0, 0],
    position: [0, 0, 0],
    scale: [-2, 3, 4],
    rotation: 32,
  });
  const local = {
    ...transform,
    rotation: 27,
    rotationX: 13,
    scale: [-2, 1, 3] as [number, number, number],
    skewX: 8,
  };
  const world = layerMatrix3d(local, parent),
    basis = layerMatrix3d({
      ...transform,
      anchor: [0, 0, 0],
      position: [0, 0, 0],
      scale: [2, 3, 4],
      rotation: 32,
    }),
    facing = cameraFacingWorld(world, basis, local.anchor, camera);
  const dot = (m: number[], a: number, b: number) =>
    m[a]! * m[b]! + m[a + 1]! * m[b + 1]! + m[a + 2]! * m[b + 2]!;
  for (const a of [0, 4, 8])
    for (const b of [0, 4, 8])
      expect(dot(facing, a, b)).toBeCloseTo(dot(world, a, b), 9);
  worldPoint(world, local.anchor).forEach((v, axis) =>
    expect(worldPoint(facing, local.anchor)[axis]).toBeCloseTo(v, 10),
  );
});
it("uses a deterministic alternate hint at the camera's vertical pole", () => {
  const world = layerMatrix3d({ ...transform, position: [50, 100, -100] });
  expect(
    cameraFacingWorld(world, undefined, transform.anchor, camera).every(
      Number.isFinite,
    ),
  ).toBe(true);
});
it("rejects coincident camera anchors and singular parent orientation", () => {
  expect(() =>
    cameraFacingWorld(
      layerMatrix3d({ ...transform, position: camera.position }),
      undefined,
      transform.anchor,
      camera,
    ),
  ).toThrow("nonzero basis");
  const parent = layerMatrix3d({ ...transform, scale: [0, 1, 1] });
  expect(() =>
    cameraFacingWorld(
      layerMatrix3d(transform, parent),
      parent,
      transform.anchor,
      camera,
    ),
  ).toThrow("nonzero basis");
});

it("retains horizontal parent mirroring in the artwork plane rather than moving it to depth", () => {
  const parent = layerMatrix3d({
      ...transform,
      anchor: [0, 0, 0],
      position: [0, 0, 0],
      scale: [-2, 3, 4],
    }),
    basis = layerMatrix3d({
      ...transform,
      anchor: [0, 0, 0],
      position: [0, 0, 0],
      scale: [2, 3, 4],
    });
  const world = layerMatrix3d(transform, parent),
    facing = cameraFacingWorld(world, basis, transform.anchor, camera),
    anchor = worldPoint(world, transform.anchor);
  const dx = anchor[0] - camera.position[0],
    dz = anchor[2] - camera.position[2],
    length = Math.hypot(dx, dz);
  expect((facing[0] * dz) / length - (facing[2] * dx) / length).toBeCloseTo(
    -2,
    10,
  );
});
