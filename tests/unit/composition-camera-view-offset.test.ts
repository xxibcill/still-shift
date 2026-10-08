import { expect, it } from "vitest";
import {
  CompositionSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { ownCurve } from "../../packages/renderer-core/src/composition/evaluate/expression-keys.ts";
import { projectLocalPoint } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import {
  compositionTracks,
  sampleTrack,
} from "../../apps/lab/src/composition-keys.ts";

const scene = (): Composition => ({
  schemaVersion: "composition-1",
  id: "offset",
  width: 100,
  height: 80,
  fps: 24,
  frameCount: 32,
  assets: [],
  layers: [
    {
      id: "parent",
      type: "null",
      threeD: true,
      transform: { position: [10, 0, 0] },
    },
    {
      id: "camera",
      type: "camera",
      parent: "parent",
      startFrame: 2,
      stretch: 2,
      viewOffset: {
        x: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 20, interpolation: "linear" },
          ],
        },
        y: -3,
      },
    },
    {
      id: "plane",
      type: "solid",
      threeD: true,
      size: [10, 10],
      color: "#ffffff",
      transform: { position: [75, 40, 0] },
    },
  ],
});

it("samples screen offset in camera-local time without inheriting parent displacement", () => {
  const doc = CompositionSchema.parse(scene());
  const tree = evaluateComp(doc, 13);
  expect(tree.camera?.viewOffset).toEqual([11, -3]);
  expect(projectLocalPoint(tree.layers[2]!.projection!, [5, 5])).toEqual([
    76, 37,
  ]);
  expect(evaluateProperty(doc, "camera.viewOffset.x", 13)).toBe(11);
  expect(evaluateComp(doc, 13).camera?.viewOffset).toEqual([11, -3]);
});

it("evaluates offset writers before camera geometry and bounds their resulting values", () => {
  const doc = scene();
  doc.expressions = { "camera.viewOffset.y": { source: "value + 4" } };
  const tree = evaluateComp(CompositionSchema.parse(doc), 13);
  expect(projectLocalPoint(tree.layers[2]!.projection!, [5, 5])).toEqual([
    76, 41,
  ]);
  doc.expressions = { "camera.viewOffset.x": { source: "1000001" } };
  expect(() => evaluateComp(CompositionSchema.parse(doc), 13)).toThrow(
    /view offset/i,
  );
});

it("retains xy own-key reads and inspector grouped/separated tracks", () => {
  const doc = scene(),
    camera = doc.layers[1]!;
  expect(
    ownCurve(camera, [{ name: "viewOffset" }, { name: "x" }], 24)!.sample(5.5),
  ).toBe(11);
  expect(compositionTracks(doc).map((track) => track.property)).toEqual([
    "viewOffset.x",
  ]);
  if (camera.type !== "camera") throw Error("fixture camera missing");
  camera.viewOffset = {
    keys: [
      { frame: 0, value: [0, -3] },
      { frame: 10, value: [20, 7], interpolation: "linear" },
    ],
  };
  const tracks = compositionTracks(doc);
  expect(tracks[0]!.property).toBe("viewOffset");
  expect(sampleTrack(tracks[0]!, 5.5)).toEqual([11, 2.5]);
  expect(ownCurve(camera, [{ name: "viewOffset" }], 24)!.sample(5.5)).toEqual([
    11, 2.5,
  ]);
});
