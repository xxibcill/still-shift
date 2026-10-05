import { expect, it } from "vitest";
import {
  compositionEffectDefinition,
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
  bakeExpressions,
} from "@still-shift/renderer-core";
import { comp as buildComp, solid } from "@still-shift/motion";
import {
  compositionTracks,
  sampleTrack,
} from "../../apps/lab/src/composition-keys.ts";
import { colorEffectPixel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import { resolvedGraph } from "../../apps/lab/src/composition-graph.ts";
const base = (): Composition => ({
  schemaVersion: "composition-1",
  id: "curve",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [
    {
      id: "box",
      type: "solid",
      color: "#7799bb80",
      size: [30, 30],
      effects: [{ id: "grade", effect: "color.curves" }],
    },
  ],
});
it("validates bounded ordered curves, fixed keyed topology and point animation", () => {
  const schema = compositionEffectDefinition("color.curves")!.params;
  for (const curve of [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [0, 1],
      [0.5, 0.75],
      [1, 0],
    ],
    {
      keys: [
        {
          frame: 0,
          value: [
            [0, 0],
            [0.5, 0.2],
            [1, 1],
          ],
        },
        {
          frame: 10,
          value: [
            [0, 0],
            [0.5, 0.8],
            [1, 1],
          ],
        },
      ],
    },
    [
      [0, 0],
      {
        x: 0.5,
        y: {
          keys: [
            { frame: 0, value: 0.2 },
            { frame: 10, value: 0.8 },
          ],
        },
      },
      [1, 1],
    ],
  ])
    expect(schema.safeParse({ curve }).success).toBe(true);
  for (const curve of [
    { keys: [] },
    [[0, 0], null, [1, 1]],
    [],
    [[0, 0]],
    Array.from({ length: 17 }, (_, i) => [i / 16, i / 16]),
    [
      [0, 0],
      [0.8, 0.5],
      [0.7, 0.8],
      [1, 1],
    ],
    [
      [0, 0],
      [0, 0.5],
      [1, 1],
    ],
    [
      [0.1, 0],
      [1, 1],
    ],
    [
      [0, 0],
      [0.9, 1],
    ],
    [
      [0, 0],
      [1, 1.1],
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
    ],
    {
      keys: [
        {
          frame: 0,
          value: [
            [0, 0],
            [1, 1],
          ],
        },
        {
          frame: 10,
          value: [
            [0, 0],
            [0.5, 0.5],
            [1, 1],
          ],
        },
      ],
    },
  ])
    expect(schema.safeParse({ curve }).success).toBe(false);
});
it("samples joint and per-point curves in the layer-local clock", () => {
  const composition = base();
  composition.layers[0]!.startFrame = 2;
  composition.layers[0]!.stretch = 2;
  composition.layers[0]!.effects![0]!.params = {
    curve: {
      keys: [
        {
          frame: 0,
          value: [
            [0, 0],
            [0.5, 0.2],
            [1, 1],
          ],
        },
        {
          frame: 10,
          value: [
            [0, 0],
            [0.5, 0.8],
            [1, 1],
          ],
        },
      ],
    },
  };
  expect(evaluateProperty(composition, "box.effects[grade].curve", 12)).toEqual(
    [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ],
  );
  expect(
    resolvePropertyPath(composition, "box.effects[grade].curve[p1].y"),
  ).toMatchObject({ type: "scalar" });
  expect(
    resolvePropertyPath(composition, "box.effects[grade].curve[p1]"),
  ).toMatchObject({ type: "vec2" });
  expect(
    resolvePropertyPath(composition, "box.effects[grade].curve[p3]"),
  ).toMatchObject({ code: "comp-path-property" });
  expect(
    evaluateProperty(composition, "box.effects[grade].curve[p1].y", 12),
  ).toBe(0.5);
  composition.layers[0]!.effects![0]!.params = {
    curve: [
      [0, 0],
      {
        x: 0.5,
        y: {
          keys: [
            { frame: 0, value: 0.2 },
            { frame: 10, value: 0.8 },
          ],
        },
      },
      [1, 1],
    ],
  };
  expect(
    evaluateProperty(
      structuredClone(composition),
      "box.effects[grade].curve",
      12,
    ),
  ).toEqual([
    [0, 0],
    [0.5, 0.5],
    [1, 1],
  ]);
});
it("reports point crossings after drivers with the owning root frame", () => {
  const composition = base();
  composition.layers[0]!.effects![0]!.params = {
    curve: [
      [0, 0],
      [0.3, 0.4],
      [0.7, 0.6],
      [1, 1],
    ],
  };
  composition.signals = [
    {
      id: "cross",
      keys: [
        { frame: 0, value: 0.8 },
        { frame: 10, value: 0.8 },
      ],
    },
  ];
  composition.drivers = [
    {
      target: "box.effects[grade].curve[p1].x",
      signal: "cross",
      blend: "replace",
    },
  ];
  expect(validateComposition(composition).ok).toBe(true);
  try {
    evaluateComp(composition, 4);
    expect.fail("crossed control points must fail");
  } catch (error) {
    expect(error).toMatchObject({
      diagnostics: [
        {
          code: "comp-effect-curve",
          node: "box",
          frame: 4,
          path: "box.effects[grade].curve",
        },
      ],
    });
  }
});
it("preserves defaults and other points through component authoring and expression baking", () => {
  const result = buildComp(
    { width: 64, height: 64, fps: 24, frames: 24 },
    (c) => {
      const layer = c.add(
        solid("box", { size: [30, 30], color: "#ffffff" }).with({
          effects: [{ id: "grade", effect: "color.curves" }],
        }),
      );
      c.timeline(
        layer.property<number>("effects[grade].curve[p0].y").to(0.4, 10),
      );
    },
  );
  expect(evaluateProperty(result, "box.effects[grade].curve", 5)).toEqual([
    [0, 0.2],
    [1, 1],
  ]);
  const source = base();
  source.layers[0]!.effects![0]!.params = {
    curve: {
      keys: [
        {
          frame: 0,
          value: [
            [0, 0],
            [0.5, 0.2],
            [1, 1],
          ],
        },
        {
          frame: 10,
          value: [
            [0, 0],
            [0.5, 0.8],
            [1, 1],
          ],
        },
      ],
    },
  };
  source.expressions = {
    "box.effects[grade].curve[p0].y": { source: "time / 100" },
  };
  const baked = bakeExpressions(source);
  expect(baked.ok).toBe(true);
  if (baked.ok)
    for (let frame = 0; frame < 24; frame++)
      expect(
        evaluateProperty(baked.composition, "box.effects[grade].curve", frame),
      ).toEqual(evaluateProperty(source, "box.effects[grade].curve", frame));
});
it("exposes joint curves and individual point channels to the native inspector", () => {
  const composition = base();
  composition.layers[0]!.effects![0]!.params = {
    curve: {
      keys: [
        {
          frame: 0,
          value: [
            [0, 0],
            [1, 1],
          ],
        },
        {
          frame: 10,
          value: [
            [0, 0.5],
            [1, 1],
          ],
        },
      ],
    },
  };
  const tracks = compositionTracks(composition);
  expect(tracks.map((t) => [t.property, t.kind])).toEqual([
    ["effects[grade].curve", "curve"],
  ]);
  expect(sampleTrack(tracks[0]!, 5)).toEqual([0, 0.25, 1, 1]);
  const graph = resolvedGraph(composition, "box.effects[grade].curve");
  expect(graph[5]!.value).toEqual([0, 0.25, 1, 1]);
  expect(graph[5]!.speed[1]).toBeCloseTo(0.075 - 1e-7, 10);
  composition.layers[0]!.effects![0]!.params = {
    curve: [
      [0, 0],
      {
        x: 0.5,
        y: {
          keys: [
            { frame: 0, value: 0.2 },
            { frame: 10, value: 0.8 },
          ],
        },
      },
      [1, 1],
    ],
  };
  expect(
    compositionTracks(composition).map((t) => [t.property, t.kind]),
  ).toEqual([["effects[grade].curve[p1].y", "scalar"]]);
});
it("interpolates a bounded RGB curve with independent coverage and inversion oracles", () => {
  expect(
    colorEffectPixel(
      "color.curves",
      [0.25, 0.5, 0.75, 0.4],
      {
        curve: [
          [0, 0],
          [0.5, 0.8],
          [1, 1],
        ],
        amount: 1,
      },
      0,
      0,
    ),
  ).toEqual([0.4, 0.8, 0.9, 0.4]);
  expect(
    colorEffectPixel(
      "color.curves",
      [0.25, 0.5, 0.75, 0.4],
      {
        curve: [
          [0, 1],
          [1, 0],
        ],
        amount: 1,
      },
      0,
      0,
    ),
  ).toEqual([0.75, 0.5, 0.25, 0.4]);
});

it("checks curve ordering after all expressions have corrected driver-stage values", () => {
  const composition = base();
  composition.layers[0]!.effects![0]!.params = {
    curve: [
      [0, 0],
      [0.3, 0.4],
      [0.7, 0.6],
      [1, 1],
    ],
  };
  composition.signals = [
    {
      id: "cross",
      keys: [
        { frame: 0, value: 0.8 },
        { frame: 10, value: 0.8 },
      ],
    },
  ];
  composition.drivers = [
    {
      target: "box.effects[grade].curve[p1].x",
      signal: "cross",
      blend: "replace",
    },
  ];
  composition.expressions = {
    "box.effects[grade].curve[p1].x": { source: "0.4" },
  };
  expect(evaluateProperty(composition, "box.effects[grade].curve", 4)).toEqual([
    [0, 0],
    [0.4, 0.4],
    [0.7, 0.6],
    [1, 1],
  ]);
});
it("rejects whole-curve expression arithmetic while permitting individual point targets", () => {
  const composition = base();
  composition.expressions = { "box.effects[grade].curve": { source: "[0,1]" } };
  expect(validateComposition(composition).ok).toBe(false);
  composition.expressions = {
    "box.effects[grade].curve[p0].y": {
      source: 'prop("box.effects[grade].curve")',
    },
  };
  expect(validateComposition(composition).ok).toBe(false);
});
