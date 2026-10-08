import { afterEach, expect, it } from "vitest";
import {
  defineCompositionEffect,
  registerCompositionEffectDefinition,
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { bakeExpressions, evaluateComp } from "@still-shift/renderer-core";
import {
  compositionTracks,
  sampleTrack,
} from "../../apps/lab/src/composition-keys.ts";
import {
  readProperty,
  writeProperty,
} from "../../packages/motion-builder/src/property-access.ts";

const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));
function fixture(): Composition {
  const definition = defineCompositionEffect({
    version: "1.0.0",
    properties: {
      points: {
        type: "points",
        default: [[0, 0]],
        min: -100,
        max: 100,
        minCount: 0,
        maxCount: 64,
      },
    },
  });
  releases.push(registerCompositionEffectDefinition("test.points", definition));
  return {
    schemaVersion: "composition-1",
    id: "points",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 12,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        color: "#ffffff",
        size: [64, 64],
        effects: [
          {
            id: "mesh",
            effect: "test.points",
            params: { points: Array.from({ length: 64 }, (_, i) => [i, -i]) },
          },
        ],
      },
    ],
  };
}
it("validates finite point lists and stable topology without color-curve restrictions", () => {
  const comp = fixture();
  expect(validateComposition(comp).ok).toBe(true);
  const params = comp.layers[0]!.effects![0]!.params!;
  for (const points of [
    [],
    [
      [2, -3],
      [2, -3],
    ],
    {
      keys: [
        { frame: 0, value: [[0, 0]] },
        { frame: 10, value: [[4, -3]] },
      ],
    },
  ]) {
    params.points = points;
    expect(validateComposition(comp).ok).toBe(true);
  }
  for (const points of [
    Array.from({ length: 65 }, () => [0, 0]),
    [[101, 0]],
    [[0, 0, 1]],
    {
      keys: [
        { frame: 0, value: [[0, 0]] },
        {
          frame: 10,
          value: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    },
  ]) {
    params.points = points;
    expect(validateComposition(comp).ok).toBe(false);
  }
});
it("resolves the 64th point, applies component expressions, and bakes identical samples", () => {
  const comp = fixture();
  const path = "art.effects[mesh].points[p63].y";
  expect(resolvePropertyPath(comp, path)).toMatchObject({ type: "scalar" });
  expect(
    resolvePropertyPath(comp, "art.effects[mesh].points[p64]"),
  ).toHaveProperty("code");
  comp.expressions = { [path]: { source: "1 + time * 24" } };
  const baked = bakeExpressions(comp);
  expect(baked.ok).toBe(true);
  if (!baked.ok) return;
  for (const frame of [0, 5, 11]) {
    const evaluated = evaluateComp(comp, frame).layers[0]!.effects[0]!.params
      .points;
    expect(evaluated).toEqual(
      evaluateComp(baked.composition, frame).layers[0]!.effects[0]!.params
        .points,
    );
    expect((evaluated as number[][])[63]).toEqual([63, frame + 1]);
  }
});
it("edits point components through builder paths and exposes keyed timeline samples", () => {
  const comp = fixture();
  const layer = comp.layers[0]!;
  writeProperty(layer, "effects[mesh].points[p63].y", {
    keys: [
      { frame: 0, value: -5 },
      { frame: 10, value: 5 },
    ],
  });
  expect(readProperty(layer, "effects[mesh].points[p62]")).toEqual([62, -62]);
  expect(validateComposition(comp).ok).toBe(true);
  const tracks = compositionTracks(comp);
  const track = tracks.find(
    (track) => track.property === "effects[mesh].points[p63].y",
  );
  expect(track).toBeDefined();
  if (track) expect(sampleTrack(track, 5)).toEqual([0]);
});
it("rejects whole-list expressions and accepts individual point expressions", () => {
  const comp = fixture();
  comp.expressions = { "art.effects[mesh].points": { source: "[1, 2]" } };
  expect(validateComposition(comp).ok).toBe(false);
  comp.expressions = { "art.effects[mesh].points[p63]": { source: "[1, 2]" } };
  expect(validateComposition(comp).ok).toBe(true);
});

it("samples whole-list keys and clamps expression output to the declared coordinate range", () => {
  const comp = fixture();
  comp.layers[0]!.effects![0]!.params = {
    points: {
      keys: [
        {
          frame: 0,
          value: [
            [-5, 0],
            [4, 10],
          ],
        },
        {
          frame: 10,
          value: [
            [5, 20],
            [8, 30],
          ],
        },
      ],
    },
  };
  expect(evaluateComp(comp, 5).layers[0]!.effects[0]!.params.points).toEqual([
    [0, 10],
    [6, 20],
  ]);
  const track = compositionTracks(comp).find(
    (track) => track.kind === "points",
  )!;
  expect(sampleTrack(track, 5)).toEqual([0, 10, 6, 20]);
  comp.expressions = { "art.effects[mesh].points[p1].y": { source: "200" } };
  expect(
    evaluateComp(structuredClone(comp), 5).layers[0]!.effects[0]!.params.points,
  ).toEqual([
    [0, 10],
    [6, 100],
  ]);
});
it("rejects invalid descriptor bounds and invalid defaults", () => {
  for (const override of [
    { maxCount: 65 },
    { minCount: -1 },
    { max: Infinity },
    { min: 2, max: 1 },
    { default: [[200, 0]] as const },
  ])
    expect(() =>
      defineCompositionEffect({
        version: "1.0.0",
        properties: {
          points: {
            type: "points",
            min: -100,
            max: 100,
            minCount: 0,
            maxCount: 64,
            default: [],
            ...override,
          },
        },
      }),
    ).toThrow();
});
