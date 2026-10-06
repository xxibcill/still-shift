import { expect, it } from "vitest";
import {
  resolvePropertyPath,
  type Composition,
} from "@still-shift/scene-contract";

const document: Composition = {
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [
    { id: "camera", type: "camera" },
    {
      id: "plane",
      type: "solid",
      size: [100, 100],
      color: "#ffffff",
      threeD: true,
    },
    { id: "overlay", type: "solid", size: [10, 10], color: "#ffffff" },
  ],
};

it.each([
  ["camera.transform.position", "vec3"],
  ["camera.transform.position.z", "scalar"],
  ["camera.transform.orientation", "vec3"],
  ["camera.transform.orientation.z", "scalar"],
  ["camera.pointOfInterest", "vec3"],
  ["camera.pointOfInterest.z", "scalar"],
  ["camera.viewOffset", "vec2"],
  ["camera.viewOffset.x", "scalar"],
  ["camera.viewOffset.y", "scalar"],
  ["camera.zoom", "scalar"],
  ["camera.focalLength", "scalar"],
  ["camera.filmSize", "scalar"],
  ["camera.focusDistance", "scalar"],
  ["camera.aperture", "scalar"],
  ["camera.blurLevel", "scalar"],
  ["plane.transform.rotationX", "scalar"],
  ["plane.transform.rotationY", "scalar"],
  ["plane.transform.orientation", "vec3"],
  ["plane.constraintReference.z", "scalar"],
])("resolves spatial authoring path %s as %s", (path, type) => {
  expect(resolvePropertyPath(document, path)).toMatchObject({ type });
});

it.each([
  "plane.zoom",
  "plane.pointOfInterest",
  "camera.zoom.x",
  "camera.pointOfInterest.w",
  "camera.viewOffset.z",
  "plane.viewOffset",
  "overlay.transform.position.z",
])("rejects incompatible spatial path %s", (path) => {
  expect(resolvePropertyPath(document, path)).toMatchObject({
    code: "comp-path-property",
  });
});
