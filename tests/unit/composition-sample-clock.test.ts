import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { compositionSampleIndex } from "../../packages/renderer-core/src/composition/evaluate/sample-clock.ts";
import {
  buildRenderGraph,
  type DrawOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "sample-clock",
  width: 128,
  height: 96,
  fps: 30,
  frameCount: 10,
  assets: [],
  layers: [
    {
      id: "sampled",
      type: "solid",
      size: [20, 20],
      color: "#ffffff",
      sampleTimes: [-0.25, 0.25, 4.75, 5.25],
      transform: {
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 5, interpolation: "hold" },
              { frame: 1, value: 10, interpolation: "hold" },
              { frame: 2, value: 20, interpolation: "hold" },
              { frame: 3, value: 40, interpolation: "hold" },
            ],
          },
          y: 10,
        },
      },
      effects: [
        {
          id: "blur",
          effect: "blur.gaussian",
          inPoint: 5,
          params: {
            radius: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 3, value: 3, interpolation: "linear" },
              ],
            },
          },
        },
      ],
    },
  ],
});

describe("indexed layer sample clocks", () => {
  it("holds explicit samples and retains integer keys and bounded clock tables", () => {
    const comp = fixture();
    expect(validateComposition(comp).ok).toBe(true);
    const times = [-1, -0.25, 0, 0.25, 4, 4.75, 5, 5.25, 9];
    expect(
      times.map((time) =>
        compositionSampleIndex(comp.layers[0]!.sampleTimes!, time),
      ),
    ).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3]);
    expect(
      times.map(
        (time) => evaluateComp(comp, time).layers[0]!.transform.position[0],
      ),
    ).toEqual([5, 5, 5, 10, 10, 20, 20, 40, 40]);
    comp.layers[0]!.sampleTimes = [0, 0];
    expect(validateComposition(comp).diagnostics).toContainEqual(
      expect.objectContaining({ code: "comp-sample-time-order" }),
    );
    comp.layers[0]!.sampleTimes = Array.from({ length: 2001 }, (_, i) => i / 4);
    expect(validateComposition(comp).ok).toBe(false);
  });
  it("indexes effect values without moving their activation clock", () => {
    const comp = fixture();
    const at = evaluateComp(comp, 5).layers[0]!;
    expect(at).toMatchObject({ time: 4.75, sampleIndex: 2 });
    expect(at.effects[0]).toMatchObject({
      enabled: true,
      params: { radius: 2 },
    });
    expect(evaluateComp(comp, 4.75).layers[0]!.effects[0]!.enabled).toBe(false);
  });
  it("exposes both sample index and source clock to content providers", () => {
    const comp = fixture();
    comp.layers = [
      {
        id: "source",
        type: "provider",
        provider: "test.clock@1.0.0",
        params: {},
        sampleTimes: [0, 0.25, 4.75, 5.25],
      },
    ];
    const op = buildRenderGraph(comp, evaluateComp(comp, 5)).root
      .ops[0] as DrawOp;
    expect(op.content).toMatchObject({
      type: "provider",
      time: 2,
      sourceTime: 4.75,
    });
  });
});
