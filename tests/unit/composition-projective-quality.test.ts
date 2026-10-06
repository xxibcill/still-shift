import { expect, it } from "vitest";
import {
  homographicBounds,
  homographicPoint,
  homographicScale,
  homographicVelocityPoints,
} from "../../packages/renderer-core/src/composition/projective-quality.ts";
import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";
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
