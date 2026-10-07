import { expect, it } from "vitest";
import {
  compositionEffectDefinition,
  defineCompositionEffect,
  registerCompositionEffectDefinition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "@still-shift/renderer-core";
import { warpMapping } from "../../packages/renderer-core/src/composition/render/warp-effects.ts";
it("maps transform pixels with independent translation and scale references", () => {
  const mapping = warpMapping(
    "distort.transform",
    { offset: [8, -4], anchor: [0, 0], scale: [2, 1], rotation: 0 },
    64,
    48,
  );
  expect(mapping.sourcePoint(24, 16)).toEqual([8, 20]);
  const definition = compositionEffectDefinition("distort.transform")!;
  const defaults = Object.fromEntries(
    Object.entries(definition.properties).map(([name, p]) => [name, p.default]),
  );
  expect(
    warpMapping(
      "distort.transform",
      defaults as Record<string, number | readonly number[]>,
      64,
      48,
    ).sourcePoint(12.5, 30.5),
  ).toEqual([12.5, 30.5]);
});
it("maps a convex corner-pin quad and rejects folded or singular controls", () => {
  const params = {
    topLeft: [0.25, 0.25],
    topRight: [0.75, 0.25],
    bottomRight: [0.75, 0.75],
    bottomLeft: [0.25, 0.75],
  };
  const mapping = warpMapping("distort.corner-pin", params, 64, 48);
  expect(mapping.sourcePoint(32, 24)).toEqual([32, 24]);
  expect(mapping.sourcePoint(16, 12)).toEqual([0, 0]);
  expect(() =>
    warpMapping(
      "distort.corner-pin",
      { ...params, topRight: [0.25, 0.75] },
      64,
      48,
    ),
  ).toThrow();
});
it("rejects singular animated mappings after drivers with an owning frame diagnostic", () => {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "warp",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 12,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        size: [64, 48],
        color: "#ffffff",
        effects: [
          {
            id: "warp",
            effect: "distort.transform",
            params: { scale: [0, 1] },
          },
        ],
      },
    ],
  };
  try {
    evaluateComp(comp, 4);
    expect.fail("Singular transform must fail");
  } catch (error) {
    expect(error).toMatchObject({
      diagnostics: [
        {
          code: "comp-effect-params",
          node: "art",
          frame: 4,
          path: "art.effects[warp]",
        },
      ],
    });
  }
});

it("preserves affine cancellation at minimum scale and a centered destination sample", () => {
  const mapping = warpMapping(
    "distort.transform",
    {
      offset: [14.5, -7.5],
      anchor: [0.5, 0.5],
      scale: [1 / 256, 1],
      rotation: 0,
    },
    1920,
    1080,
  );
  expect(mapping.sourcePoint(974.5, 532.5)).toEqual([960, 540]);
});

it("validates the final expression result and ignores disabled singular mappings", () => {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "warp",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 12,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        size: [64, 48],
        color: "#ffffff",
        effects: [
          {
            id: "warp",
            effect: "distort.transform",
            params: { scale: [0, 1] },
          },
        ],
      },
    ],
  };
  comp.expressions = { "art.effects[warp].scale.x": { source: "1" } };
  expect(evaluateComp(comp, 4).layers[0]!.effects[0]!.params.scale).toEqual([
    1, 1,
  ]);
  delete comp.expressions;
  comp.layers[0]!.effects![0]!.enabled = false;
  expect(() => evaluateComp(comp, 4)).not.toThrow();
});
it("protects evaluated parameter arrays from custom validation mutation", () => {
  const release = registerCompositionEffectDefinition(
    "test.guard",
    defineCompositionEffect({
      version: "1.0.0",
      properties: { point: { type: "vec2", default: [0, 0], min: -1, max: 1 } },
      validateParams: (p) => {
        (p.point as number[])[0] = 1;
      },
    }),
  );
  try {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "guard",
      width: 64,
      height: 48,
      fps: 24,
      frameCount: 12,
      assets: [],
      layers: [
        {
          id: "art",
          type: "solid",
          size: [64, 48],
          color: "#ffffff",
          effects: [{ id: "guard", effect: "test.guard" }],
        },
      ],
    };
    try {
      evaluateComp(comp, 2);
      expect.fail("mutation must fail");
    } catch (error) {
      expect(error).toMatchObject({
        diagnostics: [
          {
            code: "comp-effect-params",
            node: "art",
            frame: 2,
            path: "art.effects[guard]",
          },
        ],
      });
    }
  } finally {
    release();
  }
});
