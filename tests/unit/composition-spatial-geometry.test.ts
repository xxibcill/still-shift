import { describe, expect, it } from "vitest";
import {
  cameraGeometry,
  cameraFrustum,
  circleOfConfusion,
  layerMatrix3d,
  projectLocalPoint,
  projectPlane,
  projectWorldPoint,
  worldPoint,
  type SpatialTransform,
} from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";

const transform = (
  fields: Partial<SpatialTransform> = {},
): SpatialTransform => ({
  anchor: [0, 0, 0],
  position: [0, 0, 0],
  scale: [1, 1, 1],
  orientation: [0, 0, 0],
  rotation: 0,
  rotationX: 0,
  rotationY: 0,
  skewX: 0,
  skewY: 0,
  ...fields,
});
const camera = (x = 50) =>
  cameraGeometry({
    width: 100,
    height: 100,
    world: layerMatrix3d(transform({ position: [x, 50, -100] })),
    zoom: 100,
    nearClip: 1,
    farClip: 1000,
  });
const rectangle = { left: 0, top: 0, right: 100, bottom: 100 };
const close = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index]!, 10),
  );
};

describe("native camera analytic geometry", () => {
  it("projects the default plane identically and halves distant parallax", () => {
    close(projectWorldPoint(camera(), [75, 50, 0])!, [75, 50]);
    close(projectWorldPoint(camera(), [75, 50, 100])!, [62.5, 50]);
    close(projectWorldPoint(camera(60), [75, 50, 0])!, [65, 50]);
    close(projectWorldPoint(camera(60), [75, 50, 100])!, [57.5, 50]);
  });
  it("retains actual world-space frustum corners for inspection", () => {
    const corners = cameraFrustum(camera(), 200);
    close(corners[0]!, [-50, -50, 100]);
    close(corners[2]!, [150, 150, 100]);
    expect(() => cameraFrustum(camera(), 0)).toThrow(/clip planes/);
  });

  it("uses one screen offset for world points, tilted planes and inverse frusta", () => {
    const shifted = cameraGeometry({
      ...camera(),
      world: layerMatrix3d(transform({ position: [50, 50, -100] })),
      viewOffset: [12, -7],
    });
    close(projectWorldPoint(shifted, [75, 50, 0])!, [87, 43]);
    const matrix = layerMatrix3d(transform({ rotationY: 30 }));
    const ordinary = projectPlane(matrix, camera(), rectangle);
    const plane = projectPlane(matrix, shifted, rectangle);
    const unshifted = projectLocalPoint(ordinary, [20, 25])!;
    close(projectLocalPoint(plane, [20, 25])!, [
      unshifted[0] + 12,
      unshifted[1] - 7,
    ]);
    const corners = cameraFrustum(shifted, 200);
    close(corners[0]!, [-74, -36, 100]);
    for (const [index, expected] of [
      [0, [0, 0]],
      [2, [100, 100]],
    ] as const)
      close(projectWorldPoint(shifted, corners[index]!)!, expected);
    expect(() =>
      cameraGeometry({ ...shifted, world: matrix, viewOffset: [Infinity, 0] }),
    ).toThrow(/offset/i);
  });

  it("composes parent rotation, xyz translation, scale and anchor in world space", () => {
    const parent = layerMatrix3d(
      transform({ position: [10, 20, 30], rotation: 90 }),
    );
    const child = layerMatrix3d(
      transform({
        position: [4, 5, 6],
        anchor: [1, 2, 3],
        scale: [2, 3, 4],
      }),
      parent,
    );
    close(worldPoint(child, [1, 2, 3]), [5, 24, 36]);
    close(worldPoint(child, [2, 3, 4]), [2, 26, 40]);
  });

  it("applies X then Y then Z rotations, followed by orientation", () => {
    const matrix = layerMatrix3d(
      transform({ rotationX: 90, rotationY: 90, rotation: 90 }),
    );
    close(worldPoint(matrix, [0, 1, 0]), [0, 1, 0]);
    close(
      worldPoint(
        layerMatrix3d(transform({ orientation: [0, 90, 0] })),
        [0, 0, 1],
      ),
      [1, 0, 0],
    );
  });

  it("retains a genuine inverse homography on a tilted plane", () => {
    const plane = projectPlane(
      layerMatrix3d(transform({ rotationY: 45 })),
      camera(),
      rectangle,
    );
    expect(plane.affineMatrix).toBeNull();
    const point = projectLocalPoint(plane, [25, 20])!;
    const depth = 100 - 25 / Math.SQRT2;
    close(point, [
      50 + (100 * (25 / Math.SQRT2 - 50)) / depth,
      50 - 3000 / depth,
    ]);
    const [a, b, c, d, e, f, g, h, i] = plane.inverse!;
    const divisor = g * point[0] + h * point[1] + i;
    close(
      [
        (a * point[0] + b * point[1] + c) / divisor,
        (d * point[0] + e * point[1] + f) / divisor,
      ],
      [25, 20],
    );
  });

  it("clips actual geometry at near and far planes before bounding", () => {
    const world = layerMatrix3d(
      transform({ position: [60, 50, -100], rotationY: 45 }),
    );
    const plane = projectPlane(world, camera(), {
      left: -20,
      top: -5,
      right: 20,
      bottom: 5,
    });
    expect(plane.polygon).toHaveLength(4);
    expect(plane.polygon.flat().every(Number.isFinite)).toBe(true);
    expect(plane.localPolygon.every(([x]) => x <= -Math.SQRT2 + 1e-10)).toBe(
      true,
    );
    expect(projectWorldPoint(camera(), [0, 0, -100])).toBeNull();
    expect(projectWorldPoint(camera(), [0, 0, 1001])).toBeNull();
  });

  it("reports edge-on and zero-area planes without an invented affine map", () => {
    const plane = projectPlane(
      layerMatrix3d(transform({ scale: [0, 1, 1] })),
      camera(),
      rectangle,
    );
    expect(plane.inverse).toBeNull();
    expect(plane.bounds).toBeNull();
    expect(plane.affineMatrix).toBeNull();
  });

  it("aims two-node cameras using world POI and a deterministic vertical basis", () => {
    const ordinary = cameraGeometry({
      ...camera(),
      world: layerMatrix3d(transform({ position: [50, 50, -100] })),
      pointOfInterest: [75, 50, 0],
    });
    close(projectWorldPoint(ordinary, [75, 50, 0])!, [50, 50]);
    const vertical = cameraGeometry({
      ...camera(),
      world: layerMatrix3d(transform()),
      pointOfInterest: [0, 10, 0],
    });
    close(projectWorldPoint(vertical, [0, 10, 0])!, [50, 50]);
    expect(() =>
      cameraGeometry({
        ...camera(),
        world: layerMatrix3d(transform()),
        pointOfInterest: [0, 0, 0],
      }),
    ).toThrow(/point of interest/i);
  });

  it("keeps focus identity, inverse-depth symmetry and bounded lens blur", () => {
    const focused = cameraGeometry({
      ...camera(),
      world: layerMatrix3d(transform({ position: [50, 50, -100] })),
      filmSize: 50,
      focusDistance: 100,
      aperture: 50,
      blurLevel: 1,
    });
    expect(circleOfConfusion(focused, 100)).toBe(0);
    expect(circleOfConfusion(focused, 200)).toBe(25);
    expect(circleOfConfusion(focused, 100 / 1.5)).toBeCloseTo(25);
    expect(circleOfConfusion(focused, 1)).toBe(128);
    expect(circleOfConfusion({ ...focused, aperture: 0 }, 1)).toBe(0);
  });

  it("rejects invalid optics and singular camera basis before projection", () => {
    const world = layerMatrix3d(transform());
    expect(() =>
      cameraGeometry({ width: 100, height: 100, world, zoom: 0 }),
    ).toThrow(/zoom/i);
    expect(() =>
      cameraGeometry({
        width: 100,
        height: 100,
        world,
        zoom: 100,
        nearClip: 2,
        farClip: 1,
      }),
    ).toThrow(/clip/i);
    expect(() =>
      cameraGeometry({
        width: 100,
        height: 100,
        zoom: 100,
        world: layerMatrix3d(transform({ scale: [0, 0, 0] })),
      }),
    ).toThrow(/basis/i);
    expect(() =>
      cameraGeometry({
        width: 100,
        height: 100,
        zoom: 100,
        world: layerMatrix3d(transform({ scale: [0, 1, 1] })),
      }),
    ).toThrow(/basis/i);
    expect(() =>
      cameraGeometry({
        width: 100,
        height: 100,
        zoom: 100,
        pointOfInterest: [0, 0, 10],
        world: layerMatrix3d(transform({ scale: [1, 0, 1] })),
      }),
    ).toThrow(/basis/i);
  });
  it("normalizes camera scale magnitudes while retaining authored forward/down orientation", () => {
    const scaled = cameraGeometry({
      width: 100,
      height: 100,
      zoom: 100,
      world: layerMatrix3d(
        transform({ position: [50, 50, -100], scale: [2, 3, 4] }),
      ),
    });
    close(projectWorldPoint(scaled, [75, 50, 0])!, [75, 50]);
    const rolled = cameraGeometry({
      width: 100,
      height: 100,
      zoom: 100,
      world: layerMatrix3d(
        transform({ position: [50, 50, -100], rotation: 90, scale: [2, 3, 4] }),
      ),
    });
    close(projectWorldPoint(rolled, [75, 50, 0])!, [50, 25]);
  });
});
