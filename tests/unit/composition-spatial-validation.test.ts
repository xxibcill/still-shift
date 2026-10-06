import { expect, it } from "vitest";
import {
  CompositionSchema,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
const document = (layers: CompositionLayer[]): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers,
});
const camera: CompositionLayer = { id: "camera", type: "camera" };
const code = (doc: Composition) => {
  const result = CompositionSchema.safeParse(doc);
  return result.success
    ? []
    : result.error.issues.map(
        (issue) =>
          (issue as { params?: { diagnosticCode?: string } }).params
            ?.diagnosticCode,
      );
};
it("accepts implicit spatial camera transforms and explicit native 3D artwork", () => {
  expect(
    CompositionSchema.safeParse(
      document([
        {
          ...camera,
          transform: { position: [50, 50, -100], orientation: [0, 0, 0] },
        },
        {
          id: "art",
          type: "solid",
          size: [10, 10],
          color: "#ffffff",
          threeD: true,
          transform: { rotationY: 12, scale: [1, 1, 2] },
        },
      ]),
    ).success,
  ).toBe(true);
});
it("rejects ambiguous raw optics, incompatible POI models and unordered clips", () => {
  for (const layer of [
    { ...camera, zoom: 100, focalLength: 36 },
    {
      ...camera,
      model: "one-node" as const,
      pointOfInterest: [50, 50, 0] as [number, number, number],
    },
    { ...camera, nearClip: 20, farClip: 10 },
  ])
    expect(code(document([layer]))).toContain("comp-camera-settings");
});
it("rejects conflicting primary optical writers and ignored POI writes", () => {
  expect(
    code({
      ...document([{ ...camera, zoom: 100 }]),
      expressions: { "camera.focalLength": { source: "36" } },
    }),
  ).toContain("comp-camera-settings");
  expect(
    code({
      ...document([camera]),
      expressions: { "camera.pointOfInterest.z": { source: "1" } },
    }),
  ).toContain("comp-camera-settings");
  expect(
    code({
      ...document([{ ...camera, model: "two-node" }]),
      expressions: { "camera.pointOfInterest.z": { source: "1" } },
    }),
  ).toEqual([]);
});
it("reports real camera-parent feedback and non-drawable input/coverage declarations", () => {
  expect(
    code(
      document([
        {
          id: "parent",
          type: "null",
          threeD: true,
          transform: { autoOrient: "camera" },
        },
        { ...camera, parent: "parent" },
      ]),
    ),
  ).toContain("comp-camera-cycle");
  expect(code(document([{ ...camera, coverage: "required" }]))).toContain(
    "comp-camera-coverage",
  );
  expect(
    code(
      document([
        camera,
        {
          id: "art",
          type: "solid",
          size: [10, 10],
          color: "#ffffff",
          effects: [
            {
              id: "map",
              effect: "transition.gradient-wipe",
              inputs: { map: "camera" },
              params: { progress: 0.5 },
            },
          ],
        },
      ]),
    ),
  ).toContain("comp-effect-layer");
});
it("rejects 2D constraints on spatial references instead of dropping z", () => {
  const doc = {
    ...document([
      { id: "spatial", type: "null", threeD: true },
      { id: "art", type: "solid", size: [10, 10], color: "#ffffff" },
    ]),
    constraints: [
      { type: "attach" as const, target: "art", anchor: "spatial" },
    ],
  };
  expect(code(doc)).toContain("comp-3d-constraint");
});
