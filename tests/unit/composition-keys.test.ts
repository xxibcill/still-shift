import { expect, it } from "vitest";
import { CompositionDocument } from "../../apps/lab/src/composition-document.ts";
import {
  compositionTracks,
  resolvedTrackRoutes,
  editSegmentBezier,
  editSpatialTangent,
  editTemporalHandle,
  editedKeysCode,
  sampleTrack,
  trackGraph,
} from "../../apps/lab/src/composition-keys.ts";
import { resolvedGraph } from "../../apps/lab/src/composition-graph.ts";
import { sampleCameraMotion } from "../../packages/renderer-core/src/camera-sampling.ts";
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

it("samples the native camera with Hermite easing and rejects property-style camera handles", () => {
  const document = source();
  document.camera2d = {
    keys: [
      { frame: 0, x: 20, y: 30, zoom: 1 },
      { frame: 23, x: 40, y: 45, zoom: 2 },
    ],
    jolts: [{ frame: 10, dx: 3, dy: 4, decayFrames: 4 }],
  };
  const track = compositionTracks(document).find((t) => t.kind === "camera")!,
    state = sampleCameraMotion(document.camera2d, 11);
  expect(sampleTrack(track, 11)).toEqual([state.x, state.y, state.zoom]);
  expect(() => editTemporalHandle(document, track, 0, "out", 0.5)).toThrow(
    /no numeric/,
  );
});
it("selects native instance routes with inherited fps and separates resolved root time from authored keys", () => {
  const document = source();
  document.precomps!.push({
    id: "wrapper",
    width: 64,
    height: 64,
    fps: 50,
    frameCount: 24,
    layers: [{ id: "inner", type: "precomp", comp: "nested" }],
  });
  document.layers.push(
    { id: "fast", type: "precomp", comp: "wrapper" },
    { id: "ordinary", type: "precomp", comp: "nested", startFrame: 4 },
  );
  document.expressions = {
    "box.transform.position": { source: "value + [2, 3]" },
  };
  const tracks = compositionTracks(document),
    nested = tracks.find((t) => t.scope === "nested")!;
  expect(resolvedTrackRoutes(document, nested)).toEqual([
    { path: "fast/inner/inside.transform.position.x", fps: 50 },
    { path: "ordinary/inside.transform.position.x", fps: 24 },
  ]);
  expect(resolvedGraph(document, "box.transform.position")[0]!.value).toEqual([
    2, 3,
  ]);
  expect(sampleTrack(tracks[0]!, 0)).toEqual([0, 0]);
  expect(editedKeysCode(tracks[0]!)).toContain(
    'c.timeline(layer.property("transform.position").keys(',
  );
});

it("does not interpret provider parameters as native key properties", () => {
  const document = source();
  document.layers.push({
    id: "opaque",
    type: "provider",
    provider: "opaque@1.0.0",
    params: {
      keys: [{ frame: 0, value: 7 }],
      transform: { position: { keys: [{ frame: 0, value: [1, 2] }] } },
    },
  });
  const history = new CompositionDocument(document);
  expect(compositionTracks(history.document)).toHaveLength(2);
  history.commit(
    history.propose("Name", (d) => {
      d.layers[0]!.name = "Changed";
    })!,
  );
  expect(history.document.layers[1]).toEqual(document.layers[1]);
});

it.each(["smooth", "interpolation"] as const)(
  "preserves the opposite segment when replacing a %s temporal handle",
  (mode) => {
    const document = source();
    const keys = [
      { frame: 0, value: 0 },
      {
        frame: 10,
        value: 10,
        ...(mode === "smooth"
          ? { smooth: true }
          : { interpolation: "smooth" as const }),
      },
      { frame: 20, value: 40 },
    ];
    document.layers[0]!.transform = { rotation: { keys } };
    const track = compositionTracks(document).find(
      (t) => t.property === "transform.rotation",
    )!;
    const beforeLeft = [1, 5, 9].map((frame) => sampleTrack(track, frame));
    const beforeRight = [11, 15, 19].map((frame) => sampleTrack(track, frame));
    const out = structuredClone(document);
    editTemporalHandle(out, track, 1, "out", 0.6, 2);
    const outTrack = compositionTracks(out)[0]!;
    expect([1, 5, 9].map((frame) => sampleTrack(outTrack, frame))).toEqual(
      beforeLeft,
    );
    expect(sampleTrack(outTrack, 15)).not.toEqual(beforeRight[1]);
    const incoming = structuredClone(document);
    editTemporalHandle(incoming, track, 1, "in", 0.6, 2);
    const inTrack = compositionTracks(incoming)[0]!;
    expect([11, 15, 19].map((frame) => sampleTrack(inTrack, frame))).toEqual(
      beforeRight,
    );
    expect(sampleTrack(inTrack, 5)).not.toEqual(beforeLeft[1]);
    const history = new CompositionDocument(document);
    history.commit(
      history.propose("out", (d) =>
        editTemporalHandle(d, track, 1, "out", 0.6, 2),
      )!,
    );
    history.commit(history.undo()!);
    expect(history.document).toEqual(document);
    history.commit(history.redo()!);
    expect(sampleTrack(compositionTracks(history.document)[0]!, 5)).toEqual(
      beforeLeft[1],
    );
  },
);
