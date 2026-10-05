import { expect, it } from "vitest";
import { CompositionDocument } from "../../apps/lab/src/composition-document.ts";
import {
  compositionTracks,
  editSegmentBezier,
  editSpatialTangent,
  editTemporalHandle,
  editedKeysCode,
  sampleTrack,
  trackGraph,
} from "../../apps/lab/src/composition-keys.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
const source = (): Composition => ({
  schemaVersion: "composition-1",
  id: "keys",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  assets: [],
  metadata: { keys: [{ frame: 0, value: 999 }] },
  layers: [
    {
      id: "box",
      type: "solid",
      size: [8, 8],
      color: "#ffffff",
      transform: {
        position: {
          keys: [
            { frame: 0, value: [0, 0], out: { ease: 0.2, speed: [1, 2] } },
            { frame: 23, value: [30, 40], in: { ease: 0.3, speed: [3, 4] } },
          ],
        },
      },
    },
  ],
  precomps: [
    {
      id: "nested",
      width: 64,
      height: 64,
      frameCount: 24,
      layers: [
        {
          id: "inside",
          type: "solid",
          size: [8, 8],
          color: "#ffffff",
          transform: {
            position: {
              x: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 23, value: 40 },
                ],
              },
              y: 10,
            },
          },
        },
      ],
    },
  ],
});
it("discovers only native curves, inherits precomp fps and uses native grouped samplers", () => {
  const tracks = compositionTracks(source());
  expect(tracks).toHaveLength(2);
  expect(tracks[1]!.fps).toBe(24);
  expect(tracks[1]!.property).toBe("transform.position.x");
  expect(sampleTrack(tracks[0]!, 0)).toEqual([0, 0]);
  expect(sampleTrack(tracks[0]!, 23)).toEqual([30, 40]);
  expect(
    trackGraph(tracks[0]!).every((p) => p.speed.every(Number.isFinite)),
  ).toBe(true);
  expect(editedKeysCode(tracks[1]!)).toContain(
    'layer.property("transform.position.x").keys(',
  );
});
it("changes grouped handles losslessly and explicitly replaces their segment precedence with bezier", () => {
  const history = new CompositionDocument(source()),
    track = compositionTracks(history.document)[0]!;
  history.commit(
    history.propose("Handle", (d) =>
      editTemporalHandle(d, track, 0, "out", 0.6, [5, 6]),
    )!,
  );
  const updated = compositionTracks(history.document)[0]!;
  expect(updated.keys[0]!.out).toEqual({ ease: 0.6, speed: [5, 6] });
  expect(updated.keys[1]!.in).toEqual({ ease: 0.3, speed: [3, 4] });
  history.commit(
    history.propose("Bezier", (d) =>
      editSegmentBezier(d, updated, 1, [0.2, 0.1, 0.8, 0.9]),
    )!,
  );
  const keys = compositionTracks(history.document)[0]!.keys;
  expect(keys[0]).not.toHaveProperty("out");
  expect(keys[1]).not.toHaveProperty("in");
  expect(keys[1]!.bezier).toEqual([0.2, 0.1, 0.8, 0.9]);
  history.commit(history.undo()!);
  expect(compositionTracks(history.document)[0]!.keys[0]!.out!.speed).toEqual([
    5, 6,
  ]);
});
it("spatial editing removes incompatible grouped speeds and writes arc-length temporal speed", () => {
  const history = new CompositionDocument(source()),
    track = compositionTracks(history.document)[0]!;
  history.commit(
    history.propose("Spatial", (d) =>
      editSpatialTangent(d, track, 0, "spatialOut", [10, 20]),
    )!,
  );
  const spatial = compositionTracks(history.document)[0]!;
  expect(spatial.spatial).toBe(true);
  expect(spatial.keys[0]!.out).not.toHaveProperty("speed");
  history.commit(
    history.propose("Speed", (d) =>
      editTemporalHandle(d, spatial, 0, "out", 0.5, 2),
    )!,
  );
  expect(compositionTracks(history.document)[0]!.keys[0]!.out).toEqual({
    ease: 0.5,
    spatialSpeed: 2,
  });
  expect(
    sampleTrack(compositionTracks(history.document)[0]!, 11).every(
      Number.isFinite,
    ),
  ).toBe(true);
});
it("validation rejects wrong handle dimensions without corrupting the current graph", () => {
  const history = new CompositionDocument(source()),
    track = compositionTracks(history.document)[0]!,
    before = sampleTrack(track, 12);
  expect(() =>
    history.propose("Bad", (d) =>
      editTemporalHandle(d, track, 0, "out", 0.5, 2),
    ),
  ).toThrow(/tuple/);
  expect(sampleTrack(compositionTracks(history.document)[0]!, 12)).toEqual(
    before,
  );
});
