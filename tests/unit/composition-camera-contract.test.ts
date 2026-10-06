import { expect, it } from "vitest";
import {
  CameraLayerSchema,
  SolidLayerSchema,
} from "../../packages/scene-contract/src/composition/layers.ts";

it("retains authored camera units and independent xyz animation without injecting defaults", () => {
  const camera = {
    id: "camera",
    type: "camera",
    model: "two-node",
    transform: {
      position: {
        x: 50,
        y: 50,
        z: {
          keys: [
            { frame: 0, value: -100 },
            { frame: 20, value: -200 },
          ],
        },
      },
    },
    pointOfInterest: [50, 50, 0],
    focalLength: 36,
    filmSize: 36,
    nearClip: 1,
    farClip: 1000,
    depthOfField: true,
    focusDistance: {
      keys: [
        { frame: 0, value: 100 },
        { frame: 20, value: 200 },
      ],
    },
    aperture: 20,
    blurLevel: 1,
  };
  expect(CameraLayerSchema.parse(camera)).toEqual(camera);
  expect(CameraLayerSchema.parse({ id: "camera", type: "camera" })).toEqual({
    id: "camera",
    type: "camera",
  });
});

it.each([
  { zoom: 0 },
  { zoom: Infinity },
  { focalLength: -1 },
  { filmSize: 0 },
  { nearClip: 0 },
  { farClip: 10_000_001 },
  { aperture: -1 },
  { blurLevel: 101 },
  { focusDistance: 0 },
  { pointOfInterest: [0, 0, Infinity] },
  { viewOffset: [0, Infinity] },
  { viewOffset: [0, 0, 1] },
  { viewOffset: [1_000_001, 0] },
  { model: "orbit" },
])("bounds camera optics and targets: %j", (fields) => {
  expect(
    CameraLayerSchema.safeParse({ id: "camera", type: "camera", ...fields })
      .success,
  ).toBe(false);
});

it("retains bounded screen-space camera offset keys without injecting defaults", () => {
  const camera = {
    id: "camera",
    type: "camera",
    viewOffset: {
      keys: [
        { frame: 0, value: [0, 0] },
        { frame: 20, value: [10, -5] },
      ],
    },
  };
  expect(CameraLayerSchema.parse(camera)).toEqual(camera);
});

it("declares required coverage without changing unauthored layer JSON", () => {
  const solid = {
    id: "cover",
    type: "solid",
    size: [100, 100],
    color: "#ffffff",
  };
  expect(SolidLayerSchema.parse(solid)).toEqual(solid);
  expect(
    SolidLayerSchema.parse({ ...solid, coverage: "required" }).coverage,
  ).toBe("required");
  expect(SolidLayerSchema.safeParse({ ...solid, coverage: true }).success).toBe(
    false,
  );
});
