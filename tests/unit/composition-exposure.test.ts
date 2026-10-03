import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import {
  buildRenderGraph,
  type DrawOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "exposure",
  width: 160,
  height: 100,
  fps: 30,
  frameCount: 30,
  assets: [],
  motionBlur: { enabled: true, shutterAngle: 360, shutterPhase: 0, samples: 4 },
  layers: [
    {
      id: "moving",
      type: "solid",
      size: [10, 10],
      color: "#ffffff",
      motionBlur: true,
      transform: {
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 29, value: 116, interpolation: "linear" },
            ],
          },
          y: 10,
        },
      },
    },
  ],
});
const samples = (comp: Composition, frame = 10) => [
  ...evaluateCompositionExposure(structuredClone(comp), frame),
];

describe("composition exposure sampling", () => {
  it("spans velocity times shutter width with midpoint endpoints", () => {
    for (const angle of [0, 90, 180, 360, 720]) {
      const comp = fixture();
      comp.motionBlur!.shutterAngle = angle;
      const x = samples(comp).map((tree) => tree.layers[0]!.screenMatrix[4]);
      expect(Math.max(...x) - Math.min(...x)).toBeCloseTo(
        (((4 * angle) / 360) * 3) / 4,
        10,
      );
    }
  });
  it("uses bounded midpoint samples, phase and shot boundaries", () => {
    const comp = fixture();
    expect(validateComposition(comp).ok).toBe(true);
    expect(compositionExposureFrames(comp, 10)).toEqual([
      9.625, 9.875, 10.125, 10.375,
    ]);
    expect(compositionExposureFrames(comp, 0)).toEqual([0, 0, 0.125, 0.375]);
    expect(compositionExposureFrames(comp, 29)).toEqual([
      28.625, 28.875, 29, 29,
    ]);
    comp.motionBlur!.shutterPhase = 90;
    expect(compositionExposureFrames(comp, 10)).toEqual([
      9.875, 10.125, 10.375, 10.625,
    ]);
    comp.motionBlur!.cuts = [10];
    expect(compositionExposureFrames(structuredClone(comp), 10)[0]).toBe(10);
    comp.motionBlur!.inPoint = 10;
    comp.motionBlur!.outPoint = 20;
    expect(compositionExposureFrames(comp, 9)).toEqual([9]);
    comp.motionBlur!.cuts = [10, 10];
    expect(validateComposition(comp).ok).toBe(false);
    comp.motionBlur!.cuts = [30];
    expect(validateComposition(comp).ok).toBe(false);
  });
  it("samples complete constrained poses while freezing opted-out children", () => {
    const comp = fixture();
    comp.layers[0]!.parent = "parent";
    comp.layers.push({
      id: "parent",
      type: "null",
      transform: {
        rotation: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 29, value: 87, interpolation: "linear" },
          ],
        },
      },
    });
    comp.layers.unshift({
      ...structuredClone(comp.layers[0]!),
      id: "frozen",
      motionBlur: false,
    });
    const exposure = samples(comp);
    expect(
      new Set(
        exposure.map((tree) => JSON.stringify(tree.layers[0]!.screenMatrix)),
      ).size,
    ).toBe(1);
    expect(
      new Set(
        exposure.map((tree) => JSON.stringify(tree.layers[1]!.screenMatrix)),
      ).size,
    ).toBe(4);
    for (const tree of exposure) {
      const ops = buildRenderGraph(comp, tree).root.ops as DrawOp[];
      expect(ops.find((op) => op.layer === "frozen")!.transforms[0]).toEqual(
        exposure[0]!.layers[0]!.exposure!.tree.layers[2]!.localMatrix,
      );
    }
    expect(samples(comp)).toEqual(exposure);
  });
  it("inherits through groups and precomps and clamps remapped scope cuts", () => {
    const comp = fixture(),
      child = comp.layers[0]!;
    delete child.motionBlur;
    comp.precomps = [
      {
        id: "nested",
        width: 160,
        height: 100,
        frameCount: 30,
        layers: [child],
      },
    ];
    child.inPoint = 10;
    comp.layers = [
      {
        id: "host",
        type: "precomp",
        comp: "nested",
        motionBlur: true,
        transform: { anchor: [0, 0] },
      },
    ];
    const trees = samples(comp);
    expect(
      trees.map((tree) => tree.layers[0]!.precomp!.layers[0]!.time),
    ).toEqual([10, 10, 10.125, 10.375]);
    child.motionBlur = false;
    expect(
      samples(comp).map((tree) => tree.layers[0]!.precomp!.layers[0]!.time),
    ).toEqual([10, 10, 10, 10]);
    comp.layers[0]!.motionBlur = false;
    child.motionBlur = true;
    expect(samples(comp)[3]!.layers[0]!.precomp!.layers[0]!.time).toBe(10.375);
    comp.layers[0] = {
      id: "group",
      type: "group",
      size: [160, 100],
      motionBlur: true,
    };
    child.parent = "group";
    delete child.motionBlur;
    delete child.inPoint;
    comp.layers.unshift(child);
    delete comp.precomps;
    expect(samples(comp)[0]!.layers[0]!.time).toBe(9.625);
  });
  it("clamps content, visibility and effect switches without treating transform keys as cuts", () => {
    const comp = fixture();
    comp.layers.push({
      id: "states",
      type: "text",
      fontSize: 20,
      color: "#ffffff",
      text: "A",
      states: ["A", "B"],
      state: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 1 },
        ],
      },
      startFrame: 2,
      stretch: 2,
    });
    expect(compositionExposureFrames(comp, 22)[0]).toBe(22);
    comp.layers[0]!.effects = [
      { id: "blur", effect: "blur.gaussian", inPoint: 10, outPoint: 11 },
    ];
    expect(compositionExposureFrames(structuredClone(comp), 10)[0]).toBe(10);
    expect(compositionExposureFrames(structuredClone(comp), 11)[0]).toBe(11);
    comp.layers[0]!.motionBlur = false;
    expect(compositionExposureFrames(comp, 10)).toEqual([10]);
  });
  it("does not cut first or repeated state keys in forward, reversed and nested clocks", () => {
    for (const channel of ["state", "stateFrom"] as const)
      for (const sampleTimes of [undefined, [0, 10, 20]])
        for (const reversed of [false, true])
          for (const nested of [false, true])
            for (const firstOnly of [false, true]) {
              const comp = fixture();
              const frame = sampleTimes ? 1 : 10;
              const keyed = {
                keys: firstOnly
                  ? [{ frame, value: 0 }]
                  : [
                      { frame: 0, value: 0 },
                      { frame, value: 0 },
                    ],
              };
              const stationary: CompositionLayer = {
                id: "stationary",
                type: "text",
                text: "A",
                states: ["A", "B"],
                fontSize: 20,
                color: "#ffffff",
                ...(sampleTimes ? { sampleTimes } : {}),
                ...(reversed ? { stretch: -1, startFrame: 20 } : {}),
                state: channel === "state" ? keyed : 1,
                ...(channel === "stateFrom"
                  ? { stateFrom: keyed, stateMix: 0.5 }
                  : {}),
              };
              comp.layers.push(stationary);
              if (nested) {
                comp.precomps = [
                  {
                    id: "nested",
                    width: comp.width,
                    height: comp.height,
                    frameCount: comp.frameCount,
                    layers: comp.layers,
                  },
                ];
                comp.layers = [
                  {
                    id: "host",
                    type: "precomp",
                    comp: "nested",
                    motionBlur: true,
                  },
                ];
              }
              expect(validateComposition(comp).ok).toBe(true);
              const expected = samples(fixture()).map(
                (tree) => tree.layers[0]!.screenMatrix[4],
              );
              expect(
                samples(comp).map(
                  (tree) =>
                    (tree.layers[0]!.precomp?.layers[0] ?? tree.layers[0]!)
                      .screenMatrix[4],
                ),
              ).toEqual(expected);
            }
  });
  it("holds indexed endpoint content without an artificial cut from preceding negative keys", () => {
    for (const channel of ["state", "stateFrom"] as const)
      for (const nested of [false, true])
        for (const reversed of [false, true]) {
          const comp = fixture();
          const keyed = {
            keys: [
              { frame: -1, value: 0 },
              { frame: 0, value: 1 },
            ],
          };
          comp.layers.push({
            id: "stationary",
            type: "text",
            text: "A",
            states: ["A", "B"],
            fontSize: 20,
            color: "#ffffff",
            sampleTimes: [10, 20],
            ...(reversed ? { stretch: -1, startFrame: 20 } : {}),
            state: channel === "state" ? keyed : 0,
            ...(channel === "stateFrom"
              ? { stateFrom: keyed, stateMix: 0.5 }
              : {}),
          });
          if (nested) {
            comp.precomps = [
              {
                id: "nested",
                width: comp.width,
                height: comp.height,
                frameCount: comp.frameCount,
                layers: comp.layers,
              },
            ];
            comp.layers = [
              { id: "host", type: "precomp", comp: "nested", motionBlur: true },
            ];
          }
          expect(validateComposition(comp).ok).toBe(true);
          const trees = samples(comp);
          expect(
            trees.map(
              (tree) =>
                (tree.layers[0]!.precomp?.layers[1] ?? tree.layers[1]!)[
                  channel
                ],
            ),
          ).toEqual([1, 1, 1, 1]);
          expect(
            trees.map(
              (tree) =>
                (tree.layers[0]!.precomp?.layers[0] ?? tree.layers[0]!)
                  .screenMatrix[4],
            ),
          ).toEqual([38.5, 39.5, 40.5, 41.5]);
        }
  });
  it("clamps outgoing content switches with ordinary and indexed sample clocks", () => {
    for (const sampleTimes of [undefined, [0, 10, 20]])
      for (const nested of [false, true])
        for (const state of [undefined, 1]) {
          const comp = fixture();
          const layer: CompositionLayer = {
            id: "crossfade",
            type: "text",
            text: "A",
            states: ["A", "B", "C"],
            fontSize: 20,
            color: "#ffffff",
            motionBlur: true,
            startFrame: 2,
            stretch: 2,
            ...(sampleTimes ? { sampleTimes } : {}),
            ...(state !== undefined ? { state } : {}),
            stateFrom: {
              keys: [
                { frame: 0, value: 0 },
                { frame: sampleTimes ? 1 : 10, value: 2 },
              ],
            },
            stateMix: 0.5,
          };
          comp.layers = [layer];
          if (nested) {
            comp.precomps = [
              {
                id: "nested",
                width: comp.width,
                height: comp.height,
                frameCount: comp.frameCount,
                layers: [layer],
              },
            ];
            comp.layers = [
              { id: "host", type: "precomp", comp: "nested", motionBlur: true },
            ];
          }
          expect(validateComposition(comp).ok).toBe(true);
          for (const frame of [21, 22, 23, 22, 21])
            expect(
              samples(comp, frame).map((tree) => {
                const host = tree.layers[0]!;
                return (host.precomp?.layers[0] ?? host).stateFrom;
              }),
            ).toEqual(Array(4).fill(frame < 22 ? 0 : 2));
        }
  });
  it("retains the authoritative state at reversed content boundaries", () => {
    for (const channel of ["state", "stateFrom"] as const)
      for (const sampleTimes of [undefined, [0, 10, 20]])
        for (const nested of [false, true]) {
          const comp = fixture();
          const keyed = {
            keys: [
              { frame: 0, value: 0 },
              { frame: sampleTimes ? 1 : 10, value: 1 },
            ],
          };
          const layer: CompositionLayer = {
            id: "reverse",
            type: "text",
            text: "A",
            states: ["A", "B", "C"],
            fontSize: 20,
            color: "#ffffff",
            motionBlur: true,
            startFrame: 20,
            stretch: -1,
            ...(sampleTimes ? { sampleTimes } : {}),
            state: channel === "state" ? keyed : 2,
            ...(channel === "stateFrom"
              ? { stateFrom: keyed, stateMix: 0.5 }
              : {}),
          };
          comp.layers = [layer];
          if (nested) {
            comp.precomps = [
              {
                id: "nested",
                width: comp.width,
                height: comp.height,
                frameCount: comp.frameCount,
                layers: [layer],
              },
            ];
            comp.layers = [
              { id: "host", type: "precomp", comp: "nested", motionBlur: true },
            ];
          }
          expect(validateComposition(comp).ok).toBe(true);
          for (const frame of [9, 10, 11, 10, 9])
            expect(
              samples(comp, frame).map((tree) => {
                const host = tree.layers[0]!;
                return (host.precomp?.layers[0] ?? host)[channel];
              }),
            ).toEqual(Array(4).fill(frame <= 10 ? 1 : 0));
        }
  });
  it("retains reversed effect activation at inclusive and exclusive boundaries", () => {
    const comp = fixture();
    Object.assign(comp.layers[0]!, {
      startFrame: 20,
      stretch: -1,
      effects: [
        {
          id: "blur",
          effect: "blur.gaussian",
          params: { radius: 3 },
          inPoint: 10,
          outPoint: 20,
        },
      ],
    });
    expect(validateComposition(comp).ok).toBe(true);
    for (const frame of [0, 1, 9, 10, 11, 10, 0])
      expect(
        samples(comp, frame).map((tree) => tree.layers[0]!.effects[0]!.enabled),
      ).toEqual(Array(4).fill(frame > 0 && frame <= 10));
  });
  it("holds both states where forward and reversed cuts share a boundary", () => {
    const comp = fixture();
    const layer: CompositionLayer = {
      id: "forward",
      type: "text",
      text: "A",
      states: ["A", "B"],
      fontSize: 20,
      color: "#ffffff",
      motionBlur: true,
      state: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 1 },
        ],
      },
    };
    comp.layers = [
      layer,
      { ...structuredClone(layer), id: "reverse", startFrame: 20, stretch: -1 },
    ];
    expect(validateComposition(comp).ok).toBe(true);
    expect(
      samples(comp).map((tree) => tree.layers.map((state) => state.state)),
    ).toEqual(Array.from({ length: 4 }, () => [1, 1]));
  });
});
