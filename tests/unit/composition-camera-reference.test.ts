import { expect, it } from "vitest";
import {
  cameraRayPlanePoint,
  cameraPlaneReference,
} from "../helpers/composition-camera-reference.ts";
it("casts independent analytic camera rays and checks depth clipping", () => {
  const plane = {
    position: [40, 20, 128] as const,
    rotationY: 0,
    width: 48,
    height: 40,
  };
  expect(cameraRayPlanePoint(64, 48, 128, 96, plane)).toEqual([24, 28]);
  expect(cameraRayPlanePoint(64, 48, 128, 96, plane, 1, 255)).toBeNull();
  expect(cameraRayPlanePoint(0, 0, 128, 96, plane)).toBeNull();
});
it("has exact opaque interior and quarter-sample edge coverage over black", () => {
  const pixels = cameraPlaneReference(128, 96, {
    position: [40.5, 20, 0],
    rotationY: 0,
    width: 48,
    height: 40,
  });
  const pixel = (x: number, y: number) =>
    Array.from(pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
  expect(pixel(41, 21)).toEqual([255, 255, 255, 255]);
  expect(pixel(40, 21)).toEqual([128, 128, 128, 255]);
  expect(pixel(39, 21)).toEqual([0, 0, 0, 255]);
});
