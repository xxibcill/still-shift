import { expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import {
  homographicBounds,
  homographicPoint,
  homographicScale,
  homographicVelocityPoints,
} from "../../packages/renderer-core/src/composition/projective-quality.ts";
import {
  compositionQualityFrame,
  qualityTrackSignature,
} from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
it("measures perspective position and local scale from the actual map", () => {
  const h: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [2, 0, 0, 0, 2, 0, 0.01, 0, 1];
  expect(homographicPoint(h, [100, 0])).toEqual([100, 0]);
  expect(homographicScale(h, [100, 0])).toEqual([0.5, 1]);
  expect(homographicVelocityPoints(h, [0, 0])).toEqual([0, 0, 100, 0, 0, 200]);
  expect(
    homographicBounds({ left: 0, top: 0, right: 100, bottom: 100 }, h, {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    }),
  ).toEqual({ left: 0, top: 0, right: 100, bottom: 200 });
});
it("uses conservative viewport support when outer bounds cross the projective horizon", () => {
  const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
  expect(
    homographicBounds(
      { left: -200, top: 0, right: 100, bottom: 100 },
      [1, 0, 0, 0, 1, 0, 0.01, 0, 1],
      viewport,
    ),
  ).toEqual(viewport);
});
it("visible quality signatures include z-induced projection rather than the old XY slice", () => {
  const doc = {
    schemaVersion: "composition-1" as const,
    id: "main",
    width: 100,
    height: 100,
    fps: 24 as const,
    frameCount: 24,
    assets: [],
    layers: [
      {
        id: "plane",
        type: "solid" as const,
        size: [10, 10] as [number, number],
        color: "#ffffff",
        threeD: true,
        transform: {
          position: {
            keys: [
              { frame: 0, value: [75, 50, 0] as [number, number, number] },
              {
                frame: 20,
                value: [75, 50, 100] as [number, number, number],
                interpolation: "linear" as const,
              },
            ],
          },
        },
      },
    ],
  };
  const a = compositionQualityFrame(doc, 0),
    b = compositionQualityFrame(doc, 10);
  expect(a.layers.get("plane")!.matrix).not.toEqual(
    b.layers.get("plane")!.matrix,
  );
  expect(a.layers.get("plane")!.velocityPoints).not.toEqual(
    b.layers.get("plane")!.velocityPoints,
  );
  expect(a.signature).not.toBe(b.signature);
});

const projectiveDocument = (layers: CompositionLayer[]): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 8,
  assets: [],
  layers,
});
const tiltedPlane = (
  transform: CompositionLayer["transform"] = {},
): CompositionLayer => ({
  id: "plane",
  type: "solid",
  size: [20, 20],
  color: "#ffffff",
  threeD: true,
  transform: {
    anchor: [10, 10, 0],
    position: [50, 50, 0],
    rotationY: 30,
    ...transform,
  },
});

it("reports a camera scale jump on a perspective plane whose affine slice stays fixed", () => {
  const doc = projectiveDocument([
    {
      id: "camera",
      type: "camera",
      zoom: {
        keys: [
          { frame: 0, value: 100 },
          { frame: 3, value: 200, interpolation: "hold" },
        ],
      },
    },
    tiltedPlane(),
  ]);
  const before = compositionQualityFrame(doc, 2).layers.get("plane")!,
    after = compositionQualityFrame(doc, 3).layers.get("plane")!;
  expect(before.state.projection!.affineMatrix).toBeNull();
  expect(after.matrix).toEqual(before.matrix);
  expect(after.scale[0]).toBeGreaterThan(before.scale[0] * 1.9);
  expect(analyzeCompositionQuality(doc).diagnostics).toContainEqual(
    expect.objectContaining({
      code: "scale-pop",
      nodes: ["plane"],
      frames: [2, 3],
    }),
  );
});

it("retains signed scale when a perspective plane abruptly reflects", () => {
  const doc = projectiveDocument([
    tiltedPlane({
      scale: {
        keys: [
          { frame: 0, value: [1, 1, 1] },
          { frame: 3, value: [-1, 1, 1], interpolation: "hold" },
        ],
      },
    }),
  ]);
  const before = compositionQualityFrame(doc, 2).layers.get("plane")!,
    after = compositionQualityFrame(doc, 3).layers.get("plane")!;
  expect(before.state.projection!.affineMatrix).toBeNull();
  expect(after.scale[0]).toBeLessThan(0);
  expect(Math.abs(after.scale[0])).toBeCloseTo(before.scale[0], 10);
  expect(after.scale[1]).toBeCloseTo(before.scale[1], 10);
  expect(analyzeCompositionQuality(doc).diagnostics).toContainEqual(
    expect.objectContaining({
      code: "scale-pop",
      nodes: ["plane"],
      frames: [2, 3],
    }),
  );
});

it("reads evaluated z motion and counts separate XYZ axes as one moving property", () => {
  const doc = projectiveDocument([
    tiltedPlane({
      position: {
        x: {
          keys: [
            { frame: 0, value: 45 },
            { frame: 7, value: 55, interpolation: "linear" },
          ],
        },
        y: {
          keys: [
            { frame: 0, value: 45 },
            { frame: 7, value: 55, interpolation: "linear" },
          ],
        },
        z: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 7, value: 20, interpolation: "linear" },
          ],
        },
      },
    }),
  ]);
  doc.expressions = { "plane.transform.position.z": { source: "value + 2" } };
  const before = compositionQualityFrame(doc, 0).layers.get("plane")!,
    after = compositionQualityFrame(doc, 3).layers.get("plane")!;
  expect(qualityTrackSignature(before, "transform.position.z")).toBe("2");
  expect(qualityTrackSignature(after, "transform.position.z")).toBe(
    JSON.stringify(after.state.transform.position[2]),
  );
  expect(after.state.transform.position[2]).toBeGreaterThan(2);
  expect(
    analyzeCompositionQuality(doc, {
      minimumMovingProperties: 2,
    }).diagnostics.map((diagnostic) => diagnostic.code),
  ).not.toContain("easing-monotony");
});

it("ignores rotated parent and child reflections that cancel in the projected map", () => {
  const child = tiltedPlane({
    anchor: [0, 0, 0],
    position: [0, 0, 0],
    rotation: 90,
    rotationY: 0,
    scale: {
      keys: [
        { frame: 0, value: [1, 1, 1] },
        { frame: 3, value: [1, -1, 1], interpolation: "hold" },
      ],
    },
  });
  child.parent = "parent";
  const doc = projectiveDocument([
    {
      id: "parent",
      type: "null",
      threeD: true,
      transform: {
        position: [50, 50, 0],
        rotationY: 30,
        scale: {
          keys: [
            { frame: 0, value: [1, 1, 1] },
            { frame: 3, value: [-1, 1, 1], interpolation: "hold" },
          ],
        },
      },
    },
    child,
  ]);
  const before = compositionQualityFrame(doc, 2).layers.get("plane")!,
    after = compositionQualityFrame(doc, 3).layers.get("plane")!;
  expect(before.state.projection!.affineMatrix).toBeNull();
  expect(before.scale[0]).toBeGreaterThan(0);
  expect(after.scale[0]).toBeLessThan(0);
  before.velocityPoints!.forEach((value, index) =>
    expect(after.velocityPoints![index]).toBeCloseTo(value, 10),
  );
  expect(
    analyzeCompositionQuality(doc).diagnostics.map(
      (diagnostic) => diagnostic.code,
    ),
  ).not.toContain("scale-pop");
});

it("includes evaluated separate orientation axes in native motion timing", () => {
  const doc = projectiveDocument([
    tiltedPlane({
      orientation: {
        x: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 7, value: 10, interpolation: "linear" },
          ],
        },
        y: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 7, value: 20, interpolation: "linear" },
          ],
        },
        z: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 7, value: 30, interpolation: "linear" },
          ],
        },
      },
    }),
  ]);
  doc.expressions = {
    "plane.transform.orientation.z": { source: "value + 2" },
  };
  const before = compositionQualityFrame(doc, 0).layers.get("plane")!,
    after = compositionQualityFrame(doc, 3).layers.get("plane")!;
  expect(qualityTrackSignature(before, "transform.orientation.z")).toBe("2");
  for (const [index, axis] of ["x", "y", "z"].entries())
    expect(qualityTrackSignature(after, `transform.orientation.${axis}`)).toBe(
      JSON.stringify(after.state.transform.orientation![index]),
    );
  expect(after.state.transform.orientation![2]).toBeGreaterThan(2);
  expect(
    analyzeCompositionQuality(doc, { minimumMovingProperties: 1 }).diagnostics,
  ).toContainEqual(
    expect.objectContaining({ code: "easing-monotony", nodes: ["plane"] }),
  );
  expect(
    analyzeCompositionQuality(doc, {
      minimumMovingProperties: 2,
    }).diagnostics.map((diagnostic) => diagnostic.code),
  ).not.toContain("easing-monotony");
});
