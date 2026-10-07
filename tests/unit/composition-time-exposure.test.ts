import { describe, expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";

const text = (): Extract<CompositionLayer, { type: "text" }> => ({
  id: "switch",
  type: "text",
  text: "A",
  states: ["A", "B"],
  fontSize: 20,
  color: "#ffffff",
  motionBlur: true,
  state: {
    keys: [
      { frame: 0, value: 0 },
      { frame: 11, value: 1 },
    ],
  },
});
const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "cuts",
  width: 100,
  height: 60,
  fps: 30,
  frameCount: 30,
  assets: [],
  motionBlur: { enabled: true, shutterAngle: 360, shutterPhase: 0, samples: 4 },
  layers: [text()],
});
const states = (doc: Composition, frame: number) =>
  [...evaluateCompositionExposure(doc, frame)].map(
    (tree) => (tree.layers[0]!.precomp?.layers[0] ?? tree.layers[0]!).state,
  );
const nested = (): Composition => {
  const doc = fixture();
  doc.precomps = [
    {
      id: "source",
      width: 100,
      height: 60,
      frameCount: 12,
      layers: doc.layers,
    },
  ];
  doc.layers = [
    {
      id: "host",
      type: "precomp",
      comp: "source",
      loop: "cycle",
      motionBlur: true,
    },
  ];
  return doc;
};

describe("time-control exposure cuts", () => {
  it("cuts a posterized state at the first reachable local grid frame", () => {
    const doc = fixture();
    doc.layers[0]!.posterizeFps = 12;
    expect(states(doc, 12.4)).toEqual([0, 0, 0, 0]);
    expect(states(doc, 12.5)).toEqual([1, 1, 1, 1]);
    expect(states(doc, 12.6)).toEqual([1, 1, 1, 1]);
  });
  it("keeps rounded posterized cuts on the selected side at integer export frames", () => {
    for (const [startFrame, stretch, frame] of [
      [0, 1, 11],
      [24, -1, 13],
      [5, 2, 27],
      [27, -2, 5],
    ]) {
      const doc = fixture();
      doc.fps = 24;
      const layer = doc.layers[0] as ReturnType<typeof text>;
      Object.assign(layer, { posterizeFps: 11, startFrame, stretch });
      layer.state = {
        keys: [
          { frame: 0, value: 0 },
          { frame: 9, value: 1 },
        ],
      };
      expect(evaluateComp(doc, frame!).layers[0]!.state).toBe(1);
      expect(states(doc, frame!)).toEqual([1, 1, 1, 1]);
    }
  });
  it("finds a rounded switch that is already reachable before its nominal cut", () => {
    const doc = fixture();
    doc.fps = 24;
    doc.frameCount = 240;
    const layer = doc.layers[0] as ReturnType<typeof text>;
    Object.assign(layer, { posterizeFps: 13, stretch: 13 });
    layer.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 15, value: 1 },
      ],
    };
    expect(evaluateComp(doc, 216).layers[0]!.state).toBe(1);
    expect(states(doc, 216)).toEqual([1, 1, 1, 1]);
  });
  it("keeps rounded nested posterized state and effect cuts on the selected grid", () => {
    const doc = nested();
    doc.fps = 24;
    const layer = doc.precomps![0]!.layers[0] as ReturnType<typeof text>;
    layer.posterizeFps = 11;
    layer.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 9, value: 1 },
      ],
    };
    layer.effects = [
      {
        id: "blur",
        effect: "blur.gaussian",
        inPoint: 9,
        params: { radius: 1 },
      },
    ];
    expect(states(doc, 11)).toEqual([1, 1, 1, 1]);
    expect(
      [...evaluateCompositionExposure(doc, 11)].every(
        (tree) => tree.layers[0]!.precomp!.layers[0]!.effects[0]!.enabled,
      ),
    ).toBe(true);
  });
  it("cuts visible outgoing-state resets at their reachable posterized clock", () => {
    for (const reverse of [false, true]) {
      const doc = fixture();
      const layer = doc.layers[0] as ReturnType<typeof text>;
      Object.assign(layer, {
        posterizeFps: 12,
        state: 2,
        states: ["A", "B", "C"],
        ...(reverse ? { startFrame: 25, stretch: -1 } : {}),
      });
      layer.stateFrom = {
        keys: [
          { frame: 0, value: 0 },
          { frame: 11, value: 1 },
        ],
      };
      layer.stateMix = {
        keys: [
          { frame: 0, value: 0 },
          { frame: 11, value: 1, interpolation: "linear" },
          { frame: 12, value: 0, interpolation: "linear" },
        ],
      };
      for (const frame of [12.4, 12.5, 12.6]) {
        const base = evaluateComp(doc, frame).layers[0]!;
        expect(
          [...evaluateCompositionExposure(doc, frame)].map(
            (tree) => tree.layers[0]!.stateFrom,
          ),
        ).toEqual(Array(4).fill(base.stateFrom));
      }
    }
  });
  it("checks outgoing-state visibility at the reachable baked sample index", () => {
    const doc = fixture();
    const layer = doc.layers[0] as ReturnType<typeof text>;
    Object.assign(layer, {
      posterizeFps: 12,
      sampleTimes: [0, 11, 12.5],
      state: 2,
      states: ["A", "B", "C"],
    });
    layer.stateFrom = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 1, value: 1 },
      ],
    };
    layer.stateMix = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 1, value: 1, interpolation: "linear" },
        { frame: 2, value: 0, interpolation: "linear" },
      ],
    };
    expect(evaluateComp(doc, 12.5).layers[0]!.stateMix).toBe(0);
    expect(
      [...evaluateCompositionExposure(doc, 12.5)].map(
        (tree) => tree.layers[0]!.stateFrom,
      ),
    ).toEqual([1, 1, 1, 1]);
  });
  it("preserves inclusive-before behavior for a reversed posterized clock", () => {
    const doc = fixture();
    Object.assign(doc.layers[0]!, {
      posterizeFps: 12,
      startFrame: 25,
      stretch: -1,
    });
    expect(states(doc, 12.5)).toEqual([1, 1, 1, 1]);
    expect(states(doc, 12.6)).toEqual([0, 0, 0, 0]);
  });
  it("ignores unreachable held state cuts but retains live visibility gates", () => {
    const doc = fixture();
    doc.layers[0]!.holdFrame = 12;
    doc.layers[0]!.inPoint = 11;
    const before = [...evaluateCompositionExposure(doc, 10.9)];
    expect(before.every((tree) => !tree.layers[0]!.visible)).toBe(true);
    expect(states(doc, 11)).toEqual([1, 1, 1, 1]);
    expect(
      [...evaluateCompositionExposure(doc, 11)].every(
        (tree) => tree.layers[0]!.visible,
      ),
    ).toBe(true);
  });
  it("keeps cycle-wrap exposures on the base cycle before applying child state cuts", () => {
    const doc = nested();
    expect(states(doc, 11.9)).toEqual([1, 1, 1, 1]);
    expect(states(doc, 12)).toEqual([0, 0, 0, 0]);
    expect(states(doc, 12.1)).toEqual([0, 0, 0, 0]);
    expect(states(doc, 11.9)).toEqual(states(structuredClone(doc), 11.9));
  });
  it("holds the finite terminal frame through the last cycle boundary", () => {
    const doc = nested();
    (
      doc.layers[0] as Extract<CompositionLayer, { type: "precomp" }>
    ).loopCount = 2;
    expect(states(doc, 23.9)).toEqual([1, 1, 1, 1]);
    expect(states(doc, 24)).toEqual([1, 1, 1, 1]);
    expect(states(doc, 24.1)).toEqual([1, 1, 1, 1]);
  });
  it("retains explicit caller source-clock overrides across a wrap", () => {
    const doc = nested(),
      options = { scopeTimes: { host: 11 } };
    expect(
      [...evaluateCompositionExposure(doc, 12, options)].map(
        (tree) => tree.layers[0]!.precomp!.layers[0]!.state,
      ),
    ).toEqual([1, 1, 1, 1]);
  });
  it("ignores inherited override names while preserving explicit reused-instance clocks", () => {
    const doc = nested();
    const first = doc.layers[0] as Extract<
      CompositionLayer,
      { type: "precomp" }
    >;
    first.id = "constructor";
    doc.layers.push({
      ...structuredClone(first),
      id: "toString",
      loop: undefined,
    });
    const trees = [
      ...evaluateCompositionExposure(doc, 12, {
        scopeTimes: { constructor: 11 },
      }),
    ];
    for (const tree of trees) {
      expect(tree.layers[0]!.precomp!.layers[0]!.state).toBe(1);
      expect(tree.layers[1]!.precomp!.layers[0]!.state).toBe(1);
      expect(
        Number.isFinite(
          tree.layers[1]!.precomp!.layers[0]!.transform.position[0],
        ),
      ).toBe(true);
    }
    const defaultTrees = [
      ...evaluateCompositionExposure(structuredClone(doc), 12),
    ];
    expect(
      defaultTrees.map((tree) => tree.layers[0]!.precomp!.layers[0]!.state),
    ).toEqual([0, 0, 0, 0]);
  });
});
