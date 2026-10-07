import { expect, it } from "vitest";
import {
  sampleCameraControls,
  sampleSpatialTransform,
  validateCameraControls,
  refreshCameraControls,
} from "../../packages/renderer-core/src/composition/evaluate/spatial-state.ts";

it("samples native camera defaults in an identity z=0 optical setup", () => {
  const layer = { id: "camera", type: "camera" as const };
  expect(
    sampleSpatialTransform(layer, 0, 24, [100, 80], [0, 0]).transform,
  ).toMatchObject({
    position: [50, 40, -100],
    anchor: [0, 0, 0],
    scale: [1, 1, 1],
    orientation: [0, 0, 0],
  });
  expect(sampleCameraControls(layer, 0, 24, [100, 80])).toEqual({
    model: "one-node",
    pointOfInterest: [50, 40, 0],
    opticalMode: "zoom",
    zoom: 100,
    focalLength: 36,
    filmSize: 36,
    nearClip: 0.01,
    farClip: 10_000_000,
    depthOfField: false,
    focusDistance: 100,
    aperture: 0,
    blurLevel: 1,
  });
});

it("samples the supplied fractional keyed clock for all spatial axes", () => {
  const result = sampleSpatialTransform(
    {
      id: "plane",
      type: "solid",
      size: [20, 10],
      color: "#ffffff",
      threeD: true,
      transform: {
        position: {
          x: 10,
          y: 20,
          z: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 20, value: 40, interpolation: "linear" },
            ],
          },
        },
        orientation: [10, 20, 30],
        rotationX: 45,
        scale: [2, 3],
      },
    },
    5.5,
    24,
    [100, 80],
    [20, 10],
  );
  expect(result.transform).toMatchObject({
    position: [10, 20, 11],
    anchor: [10, 5, 0],
    scale: [2, 3, 1],
    orientation: [10, 20, 30],
    rotationX: 45,
  });
  expect(result.constraintReference).toEqual([10, 5, 0]);
});

it("converts horizontal film millimetres to pixel zoom and preserves keyed focus", () => {
  const controls = sampleCameraControls(
    {
      id: "camera",
      type: "camera",
      pointOfInterest: [50, 40, 0],
      focalLength: 72,
      filmSize: 36,
      depthOfField: true,
      focusDistance: {
        keys: [
          { frame: 0, value: 100 },
          { frame: 20, value: 200, interpolation: "linear" },
        ],
      },
      aperture: 20,
    },
    5.5,
    24,
    [100, 80],
  );
  expect(controls).toMatchObject({
    model: "two-node",
    zoom: 200,
    focalLength: 72,
    focusDistance: 127.5,
    aperture: 20,
    depthOfField: true,
  });
});

it("rejects ambiguous optics, ignored POI and invalid runtime optical values", () => {
  expect(() =>
    sampleCameraControls(
      { id: "camera", type: "camera", zoom: 100, focalLength: 36 },
      0,
      24,
      [100, 80],
    ),
  ).toThrow(/mutually exclusive/);
  expect(() =>
    sampleCameraControls(
      {
        id: "camera",
        type: "camera",
        model: "one-node",
        pointOfInterest: [0, 0, 0],
      },
      0,
      24,
      [100, 80],
    ),
  ).toThrow(/one-node/);
  const controls = sampleCameraControls(
    { id: "camera", type: "camera" },
    0,
    24,
    [100, 80],
  );
  expect(() =>
    validateCameraControls({ ...controls, nearClip: 100, farClip: 10 }),
  ).toThrow(/ordered/);
  expect(() => validateCameraControls({ ...controls, zoom: Infinity })).toThrow(
    /zoom/,
  );
});

it("derives the secondary optic after a keyed or expression-stage film change", () => {
  const controls = sampleCameraControls(
    { id: "camera", type: "camera", focalLength: 72, filmSize: 36 },
    0,
    24,
    [100, 80],
  );
  controls.filmSize = 18;
  refreshCameraControls(controls, 100);
  expect(controls.zoom).toBe(400);
  controls.opticalMode = "zoom";
  controls.zoom = 100;
  refreshCameraControls(controls, 100);
  expect(controls.focalLength).toBe(18);
});
