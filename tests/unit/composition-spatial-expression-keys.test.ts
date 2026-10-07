import { expect, it } from "vitest";
import type { CompositionLayer } from "@still-shift/scene-contract";
import {
  ownCurve,
  loop,
  rove,
} from "../../packages/renderer-core/src/composition/evaluate/expression-keys.ts";

it("retains xyz own-key reads and loop offsets for expression-stage values", () => {
  const layer: CompositionLayer = {
    id: "control",
    type: "null",
    threeD: true,
    transform: {
      position: {
        keys: [
          { frame: 0, value: [0, 10, 20] },
          { frame: 20, value: [20, 30, 40], interpolation: "linear" },
        ],
      },
    },
  };
  const curve = ownCurve(
    layer,
    [{ name: "transform" }, { name: "position" }],
    24,
  )!;
  expect(curve.sample(5.5)).toEqual([5.5, 15.5, 25.5]);
  expect(loop(curve, "out", "offset", 0, 30, [20, 30, 40])).toEqual([
    30, 40, 50,
  ]);
  const z = ownCurve(
    layer,
    [{ name: "transform" }, { name: "position" }, { name: "z" }],
    24,
  )!;
  expect(z.sample(5.5)).toBe(25.5);
});

it("roves full xyz distance while preserving implicit scale z", () => {
  const layer: CompositionLayer = {
    id: "control",
    type: "null",
    threeD: true,
    transform: {
      position: {
        keys: [
          { frame: 0, value: [0, 0, 0], spatialOut: [0, 0, 10] },
          { frame: 20, value: [0, 0, 20], spatialIn: [0, 0, -10] },
        ],
      },
      scale: {
        keys: [
          { frame: 0, value: [1, 1] },
          { frame: 20, value: [2, 2] },
        ],
      },
    },
  };
  const path = ownCurve(
    layer,
    [{ name: "transform" }, { name: "position" }],
    24,
  )!;
  expect(rove(path, 10, path.sample(10))).toEqual([0, 0, 10]);
  const scale = ownCurve(
    layer,
    [{ name: "transform" }, { name: "scale" }],
    24,
  )!;
  expect((rove(scale, 10, scale.sample(10)) as number[])[2]).toBe(1);
});

it("samples camera orientation and point-of-interest own keys in xyz", () => {
  const layer: CompositionLayer = {
    id: "camera",
    type: "camera",
    pointOfInterest: {
      keys: [
        { frame: 0, value: [0, 0, 0] },
        { frame: 20, value: [20, 40, 60], interpolation: "linear" },
      ],
    },
    transform: {
      orientation: {
        keys: [
          { frame: 0, value: [0, 0, 0] },
          { frame: 20, value: [10, 20, 30], interpolation: "linear" },
        ],
      },
    },
  };
  expect(
    ownCurve(layer, [{ name: "pointOfInterest" }], 24)!.sample(10),
  ).toEqual([10, 20, 30]);
  expect(
    ownCurve(
      layer,
      [{ name: "transform" }, { name: "orientation" }],
      24,
    )!.sample(10),
  ).toEqual([5, 10, 15]);
});

it("roves separated xyz keys by their full three-dimensional path length", () => {
  const layer: CompositionLayer = {
    id: "control",
    type: "null",
    threeD: true,
    transform: {
      position: {
        x: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 10, interpolation: "linear" },
            { frame: 20, value: 10, interpolation: "linear" },
          ],
        },
        y: 0,
        z: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 0, interpolation: "linear" },
            { frame: 20, value: 30, interpolation: "linear" },
          ],
        },
      },
    },
  };
  const curve = ownCurve(
    layer,
    [{ name: "transform" }, { name: "position" }],
    24,
  )!;
  expect(rove(curve, 10, curve.sample(10))).toEqual([10, 0, 10]);
});

it("keeps separated roving caches distinct across dimensions and implicit scale z", () => {
  const axes = {
    x: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 20, value: 20, interpolation: "linear" as const },
      ],
    },
    y: 0,
  };
  for (const [threeD, property, expected] of [
    [false, "position", [10, 0]],
    [true, "position", [10, 0, 0]],
    [true, "scale", [10, 0, 1]],
    [false, "position", [10, 0]],
  ] as const) {
    const layer: CompositionLayer = {
      id: "control",
      type: "null",
      threeD,
      transform: { [property]: axes },
    };
    const curve = ownCurve(
      layer,
      [{ name: "transform" }, { name: property }],
      24,
    )!;
    expect(rove(curve, 10, curve.sample(10))).toEqual(expected);
  }
});

it("bounds the work required by separated z-axis spring oscillation", () => {
  const layer: CompositionLayer = {
    id: "control",
    type: "null",
    threeD: true,
    transform: {
      position: {
        x: 0,
        y: 0,
        z: {
          keys: [
            { frame: 0, value: 0 },
            {
              frame: 10_000,
              value: 100,
              easing: {
                spring: { stiffness: 1_000, damping: 0.1, mass: 0.1 },
              },
            },
          ],
        },
      },
    },
  };
  const curve = ownCurve(
    layer,
    [{ name: "transform" }, { name: "position" }],
    30,
  )!;
  expect(() => rove(curve, 0, curve.sample(0))).toThrow(
    "rove(): resolving this separated path requires",
  );
});
