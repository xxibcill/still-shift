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
import { sampleCurveGraph } from "../../apps/lab/src/composition-graph-sample.ts";
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
it.each(["root", "null"])(
  "keeps top-level keys distinct from a precomp named %s",
  (id) => {
    const document = source(),
      original = structuredClone(document.layers[0]!);
    document.precomps = [
      {
        id,
        width: 64,
        height: 64,
        fps: 50,
        frameCount: 24,
        layers: [structuredClone(original)],
      },
    ];
    document.layers.push({ id: "nested", type: "precomp", comp: id });
    const tracks = compositionTracks(document),
      top = tracks.find(
        (track) =>
          track.scope === null && track.property === "transform.position",
      )!,
      nested = tracks.find(
        (track) =>
          track.scope === id && track.property === "transform.position",
      )!;
    expect(top.path).toEqual(["layers", 0, "transform", "position"]);
    expect(nested.path).toEqual([
      "precomps",
      0,
      "layers",
      0,
      "transform",
      "position",
    ]);
    expect(resolvedTrackRoutes(document, top)).toEqual([
      { path: "box.transform.position", fps: 24 },
    ]);
    expect(resolvedTrackRoutes(document, nested)).toEqual([
      { path: "nested/box.transform.position", fps: 50 },
    ]);
    editTemporalHandle(document, nested, 0, "out", 0.8, [4, 5]);
    expect(document.layers[0]).toEqual(original);
    expect(document.precomps[0]!.layers[0]).not.toEqual(original);
    expect(new CompositionDocument(document).document).toEqual(document);
  },
);

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

it("discovers and samples native xyz/POI/optical tracks without truncating z", () => {
  const doc: Composition = {
    schemaVersion: "composition-1",
    id: "main",
    width: 100,
    height: 100,
    fps: 24,
    frameCount: 24,
    assets: [],
    layers: [
      {
        id: "camera",
        type: "camera",
        model: "two-node",
        pointOfInterest: {
          keys: [
            { frame: 0, value: [50, 50, 0] },
            { frame: 20, value: [50, 50, 100], interpolation: "linear" },
          ],
        },
        zoom: {
          keys: [
            { frame: 0, value: 100 },
            { frame: 20, value: 200, interpolation: "linear" },
          ],
        },
        transform: {
          position: {
            x: 50,
            y: 50,
            z: {
              keys: [
                { frame: 0, value: -100 },
                { frame: 20, value: -200, interpolation: "linear" },
              ],
            },
          },
          orientation: {
            keys: [
              { frame: 0, value: [0, 0, 0] },
              { frame: 20, value: [10, 20, 30], interpolation: "linear" },
            ],
          },
        },
      },
    ],
  };
  const tracks = compositionTracks(doc);
  expect(tracks.map((track) => track.property)).toEqual([
    "transform.position.z",
    "transform.orientation",
    "pointOfInterest",
    "zoom",
  ]);
  expect(
    sampleTrack(
      tracks.find((track) => track.property === "pointOfInterest")!,
      10,
    ),
  ).toEqual([50, 50, 50]);
  const orientation = tracks.find(
    (track) => track.property === "transform.orientation",
  )!;
  expect(sampleTrack(orientation, 10)).toEqual([5, 10, 15]);
  expect(() =>
    editSpatialTangent(doc, orientation, 0, "spatialOut", [1, 2]),
  ).toThrow("3 tangent components");
});

it("discovers separated camera POI and spatial constraint-reference z channels", () => {
  const doc = source(),
    z = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 20, value: 10, interpolation: "linear" as const },
      ],
    };
  doc.layers = [
    {
      id: "camera",
      type: "camera",
      pointOfInterest: { x: 32, y: 32, z },
    },
    {
      id: "plane",
      type: "solid",
      threeD: true,
      size: [8, 8],
      color: "#ffffff",
      constraintReference: { x: 0, y: 0, z: structuredClone(z) },
    },
  ];
  const history = new CompositionDocument(doc),
    tracks = compositionTracks(history.document).filter(
      (track) => track.scope === null,
    );
  expect(tracks.map((track) => track.property)).toEqual([
    "pointOfInterest.z",
    "constraintReference.z",
  ]);
  expect(tracks.map((track) => sampleTrack(track, 10))).toEqual([[5], [5]]);
  expect(tracks.map((track) => resolvedTrackRoutes(doc, track))).toEqual([
    [{ path: "camera.pointOfInterest.z", fps: 24 }],
    [{ path: "plane.constraintReference.z", fps: 24 }],
  ]);
  history.commit(
    history.propose("Reference z out", (draft) =>
      editTemporalHandle(draft, tracks[1]!, 0, "out", 0.6, 2),
    )!,
  );
  const edited = compositionTracks(history.document).find(
    (track) => track.id === tracks[1]!.id,
  )!;
  expect(edited.keys[0]!.out).toEqual({ ease: 0.6, speed: 2 });
  expect(history.document.layers[0]).toEqual(doc.layers[0]);
  expect(history.document.layers[1]!.constraintReference).toMatchObject({
    x: 0,
    y: 0,
  });
  history.commit(history.undo()!);
  expect(history.document).toEqual(doc);
  history.commit(history.redo()!);
  expect(
    compositionTracks(history.document).find((track) => track.id === edited.id)!
      .keys,
  ).toEqual(edited.keys);
});

it.each(["camera-position", "camera-poi", "spatial-position"] as const)(
  "edits authored XY tangents without promoting %s keys",
  (mode) => {
    const doc = source(),
      position = {
        keys: [
          {
            frame: 0,
            value: [32, 32] as [number, number],
            spatialOut: [1, 2] as [number, number],
          },
          { frame: 23, value: [40, 36] as [number, number] },
        ],
      };
    doc.layers =
      mode === "camera-poi"
        ? [{ id: "camera", type: "camera", pointOfInterest: position }]
        : mode === "camera-position"
          ? [{ id: "camera", type: "camera", transform: { position } }]
          : [
              {
                id: "plane",
                type: "solid",
                threeD: true,
                size: [8, 8],
                color: "#ffffff",
                transform: { position },
              },
            ];
    const history = new CompositionDocument(doc),
      track = compositionTracks(history.document)[0]!;
    expect(track.dimensions ?? 2).toBe(2);
    history.commit(
      history.propose("XY tangent", (draft) =>
        editSpatialTangent(draft, track, 0, "spatialOut", [10, 3]),
      )!,
    );
    const edited = compositionTracks(history.document)[0]!;
    expect(edited.keys[0]!.spatialOut).toEqual([10, 3]);
    expect(edited.keys[0]!.value).toEqual([32, 32]);
    expect(sampleTrack(edited, 10)).toHaveLength(2);
    expect(() =>
      history.propose("Wrong XYZ tangent", (draft) =>
        editSpatialTangent(draft, edited, 0, "spatialOut", [10, 3, 0]),
      ),
    ).toThrow("2 tangent components");
    history.commit(history.undo()!);
    expect(compositionTracks(history.document)[0]!.keys[0]!.spatialOut).toEqual(
      [1, 2],
    );
    history.commit(history.redo()!);
    expect(
      compositionTracks(JSON.parse(JSON.stringify(history.document)))[0]!
        .keys[0]!.spatialOut,
    ).toEqual([10, 3]);
  },
);

it("discovers audio gain and pan keys on their owning composition clock", () => {
  const document = source();
  document.layers.push({
    id: "sound",
    type: "audio",
    asset: "audio",
    gainDb: {
      keys: [
        { frame: 0, value: -6 },
        { frame: 23, value: 0 },
      ],
    },
    pan: {
      keys: [
        { frame: 0, value: -1 },
        { frame: 23, value: 1 },
      ],
    },
  });
  const tracks = compositionTracks(document).filter(
    (track) => track.owner === "sound",
  );
  expect(tracks.map((track) => track.property)).toEqual(["gainDb", "pan"]);
  expect(sampleTrack(tracks[0]!, 0)).toEqual([-6]);
  expect(sampleTrack(tracks[1]!, 23)).toEqual([1]);
  expect(
    tracks.every((track) => track.fps === 24 && track.kind === "scalar"),
  ).toBe(true);
});

it.each(["position", "pointOfInterest"] as const)(
  "preserves neighboring XYZ spatial segments when replacing a %s Bézier segment",
  (property) => {
    for (const smooth of ["smooth", "interpolation"] as const) {
      const document = source();
      const position = {
        keys: [0, 10, 40, 50].map((z, index) => ({
          frame: index * 10,
          value: [0, 0, z] as [number, number, number],
          ...(index < 3
            ? { spatialOut: [0, 0, 3] as [number, number, number] }
            : {}),
          ...(index > 0
            ? { spatialIn: [0, 0, -3] as [number, number, number] }
            : {}),
          ...(index === 1 || index === 2
            ? smooth === "smooth"
              ? { smooth: true }
              : { interpolation: "smooth" as const }
            : {}),
        })),
      };
      document.frameCount = 31;
      document.layers =
        property === "position"
          ? [
              {
                id: "plane",
                type: "solid",
                threeD: true,
                size: [10, 10],
                color: "#ffffff",
                transform: { position },
              },
            ]
          : [{ id: "camera", type: "camera", pointOfInterest: position }];
      const history = new CompositionDocument(document);
      const track = compositionTracks(history.document)[0]!;
      const untouchedFrames = Array.from({ length: 40 }, (_, index) =>
        index < 20 ? index / 2 : 20.5 + (index - 20) / 2,
      );
      const before = untouchedFrames.map((frame) => sampleTrack(track, frame));
      const selected = sampleTrack(track, 13);
      history.commit(
        history.propose("Middle segment Bézier", (draft) =>
          editSegmentBezier(draft, track, 2, [0.3, 0, 0.7, 1]),
        )!,
      );
      const edited = compositionTracks(history.document)[0]!;
      for (const [index, frame] of untouchedFrames.entries())
        for (const axis of [0, 1, 2])
          expect(sampleTrack(edited, frame)[axis]).toBeCloseTo(
            before[index]![axis]!,
            12,
          );
      expect(sampleTrack(edited, 13)).not.toEqual(selected);
      history.commit(history.undo()!);
      expect(history.document).toEqual(document);
      history.commit(history.redo()!);
      const saved = new CompositionDocument(
        JSON.parse(JSON.stringify(history.document)),
      );
      expect(
        sampleTrack(compositionTracks(saved.document)[0]!, 5)[2],
      ).toBeCloseTo(3.75, 12);
      expect(
        sampleTrack(compositionTracks(saved.document)[0]!, 25)[2],
      ).toBeCloseTo(46.25, 12);
    }
  },
);

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

it("discovers separated constraint-reference channels with native paths, sampling and history", () => {
  const document = source();
  document.layers[0]!.constraintReference = {
    x: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 23, value: 23 },
      ],
    },
    y: {
      keys: [
        { frame: 0, value: 10 },
        { frame: 23, value: 20 },
      ],
    },
  };
  const history = new CompositionDocument(document),
    tracks = compositionTracks(history.document).filter((t) =>
      t.property?.startsWith("constraintReference"),
    );
  expect(tracks.map((t) => t.property)).toEqual([
    "constraintReference.x",
    "constraintReference.y",
  ]);
  expect(tracks.map((t) => t.kind)).toEqual(["scalar", "scalar"]);
  expect(sampleTrack(tracks[0]!, 23)).toEqual([23]);
  expect(resolvedTrackRoutes(document, tracks[0]!)).toEqual([
    { path: "box.constraintReference.x", fps: 24 },
  ]);
  expect(
    resolvedGraph(document, "box.constraintReference.x").at(-1)!.value,
  ).toEqual([23]);
  expect(editedKeysCode(tracks[0]!)).toContain(
    'layer.property("constraintReference.x").keys(',
  );
  history.commit(
    history.propose("Reference out", (d) =>
      editTemporalHandle(d, tracks[0]!, 0, "out", 0.6, 2),
    )!,
  );
  const next = compositionTracks(history.document).find(
    (t) => t.id === tracks[0]!.id,
  )!;
  expect(next.keys[0]!.out).toEqual({ ease: 0.6, speed: 2 });
  expect(history.document.layers[0]!.constraintReference).toMatchObject({
    y: document.layers[0]!.constraintReference.y,
  });
  history.commit(history.undo()!);
  expect(history.document).toEqual(document);
});

it.each(
  ["scalar", "vector", "color", "spatial", "signal"].flatMap((kind) =>
    ["smooth", "interpolation"].flatMap((mode) =>
      [false, true].map((handles) => ({ kind, mode, handles })),
    ),
  ),
)(
  "preserves neighboring $kind motion when Bézier replaces $mode smoothing (handles=$handles)",
  ({ kind, mode, handles }) => {
    const document = source();
    document.frameCount = 31;
    const layer = document.layers[0]!;
    if (layer.type !== "solid") throw new Error("Expected a solid test layer");
    const keys = [0, 10, 20, 30].map((frame, i) => ({
      frame,
      value: [0, 10, 40, 50][i]!,
      ...(i === 1 || i === 2
        ? mode === "smooth"
          ? { smooth: true }
          : { interpolation: "smooth" as const }
        : {}),
      ...(handles && i === 1 ? { in: { ease: 0.2 } } : {}),
      ...(handles && i === 2 ? { out: { ease: 0.6 } } : {}),
    }));
    if (kind === "color")
      layer.color = {
        keys: keys.map((key, i) => ({
          ...key,
          value: ["#000000", "#303050", "#a0b0c0", "#f0ffff"][i]!,
        })),
      };
    else if (kind === "vector" || kind === "spatial")
      document.layers[0]!.transform = {
        position: {
          keys: keys.map((key, i) => ({
            ...key,
            value: [key.value, key.value / 2] as [number, number],
            ...(kind === "spatial"
              ? {
                  ...(i < 3 ? { spatialOut: [5, 10] as [number, number] } : {}),
                  ...(i > 0 ? { spatialIn: [-4, -2] as [number, number] } : {}),
                }
              : {}),
          })),
        },
      };
    else if (kind === "signal") document.signals = [{ id: "slider", keys }];
    else document.layers[0]!.transform = { rotation: { keys } };
    const history = new CompositionDocument(document),
      track = compositionTracks(history.document).find((t) =>
        kind === "signal"
          ? t.owner.startsWith("signal ")
          : t.property ===
            (kind === "color"
              ? "color"
              : kind === "scalar"
                ? "transform.rotation"
                : "transform.position"),
      )!,
      frames = [0.5, 1, 2.5, 5, 7.5, 9.5, 20.5, 21, 22.5, 25, 27.5, 29.5],
      before = frames.map((frame) => sampleTrack(track, frame)),
      changed = sampleTrack(track, 12);
    history.commit(
      history.propose("Bézier segment", (draft) =>
        editSegmentBezier(draft, track, 2, [0.3, 0, 0.7, 1]),
      )!,
    );
    const edited = compositionTracks(history.document).find(
      (t) => t.id === track.id,
    )!;
    expect(sampleTrack(edited, 12)).not.toEqual(changed);
    for (const [i, frame] of frames.entries())
      sampleTrack(edited, frame).forEach((value, axis) =>
        expect(value).toBeCloseTo(before[i]![axis]!, 10),
      );
    if (handles) {
      expect(edited.keys[1]!.in!.ease).toBe(0.2);
      expect(edited.keys[2]!.out!.ease).toBe(0.6);
    }
    history.commit(history.undo()!);
    expect(history.document).toEqual(document);
    history.commit(history.redo()!);
    expect(
      compositionTracks(history.document).find((t) => t.id === track.id)!.keys,
    ).toEqual(edited.keys);
  },
);

it("keeps authored and resolved graph speeds consistent across boundaries and zero-duration ranges", () => {
  const sampled: number[] = [];
  const points = sampleCurveGraph(
    (frame) => {
      sampled.push(frame);
      return [frame * 2 + 5, 30 - frame];
    },
    { start: 10, end: 14, count: 3 },
  );
  expect(points.map((p) => p.frame)).toEqual([10, 12, 14]);
  expect(points.map((p) => p.value)).toEqual([
    [25, 20],
    [29, 18],
    [33, 16],
  ]);
  for (const point of points) {
    expect(point.speed[0]).toBeCloseTo(2, 10);
    expect(point.speed[1]).toBeCloseTo(-1, 10);
  }
  expect(sampled.every((frame) => frame >= 10 && frame <= 14)).toBe(true);
  expect(
    sampleCurveGraph(() => [4, 5], { start: 7, end: 7, count: 2 }),
  ).toEqual([
    { frame: 7, value: [4, 5], speed: [0, 0] },
    { frame: 7, value: [4, 5], speed: [0, 0] },
  ]);
  const document = source();
  document.layers[0]!.transform!.rotation = {
    keys: [
      { frame: 0, value: 0 },
      { frame: 23, value: 46, interpolation: "linear" },
    ],
  };
  const track = compositionTracks(document).find(
    (t) => t.property === "transform.rotation",
  )!;
  const authored = trackGraph(track, document.frameCount),
    resolved = resolvedGraph(document, "box.transform.rotation");
  expect(authored).toEqual(resolved);
  expect(trackGraph(track, 1000)).toHaveLength(512);
});
