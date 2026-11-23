/**
 * CG6: the `grade.key` contract (optional matte slot, parameter invariants)
 * and its place in float grade runs.
 */
import { describe, expect, it } from "vitest";
import {
  compositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  effectStages,
  floatGradeOp,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { keyMatteViews } from "../../packages/animation-engine/src/composition-render.ts";

const comp = (effect: Record<string, unknown>): Composition =>
  ({
    schemaVersion: "composition-1",
    id: "cg6",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 4,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "matte",
        type: "solid",
        enabled: false,
        size: [64, 64],
        color: "#ffffff",
      },
      {
        id: "plate",
        type: "solid",
        size: [64, 64],
        color: "#c05030",
        effects: [{ id: "key", effect: "grade.key", ...effect }],
      },
    ],
  }) as unknown as Composition;
const codes = (c: Composition) =>
  validateComposition(c).diagnostics.map((d) => d.code);

describe("grade.key contract", () => {
  it("declares the matte as an optional layer slot", () => {
    const definition = compositionEffectDefinition("grade.key")!;
    expect(definition.optionalLayers).toEqual(["matte"]);
    expect(definition.requiresLayers).toBeUndefined();
    expect(definition.usesLayerSpace).toBe(true);
    expect(validateComposition(comp({})).ok).toBe(true);
    expect(validateComposition(comp({ inputs: { matte: "matte" } })).ok).toBe(
      true,
    );
  });
  it("rejects undeclared slots (the window slot is the renderer's own)", () => {
    expect(codes(comp({ inputs: { window: "matte" } }))).toContain(
      "comp-effect-layer",
    );
    expect(codes(comp({ inputs: { matte: "missing" } }))).toContain(
      "comp-effect-layer",
    );
  });
  it("checks clip and matte level invariants (after drivers, at evaluation)", () => {
    const definition = compositionEffectDefinition("grade.key")!;
    const check = (params: Record<string, number>) => () =>
      definition.validateParams!({
        clipBlack: 0,
        clipWhite: 1,
        matteLow: 0,
        matteHigh: 1,
        ...params,
      });
    expect(check({ clipBlack: 0.6, clipWhite: 0.4 })).toThrow(/clipBlack/);
    expect(check({ matteLow: 0.5, matteHigh: 0.5 })).toThrow(/matteLow/);
    expect(check({ matteLow: 0.8, matteHigh: 0.2 })).not.toThrow();
  });
  it("defaults select everything", () => {
    const definition = compositionEffectDefinition("grade.key")!;
    const d = Object.fromEntries(
      Object.entries(definition.properties).map(([k, p]) => [k, p.default]),
    );
    expect(d).toMatchObject({
      qualifier: 0,
      hueWidth: 360,
      window: 0,
      gradient: 0,
      gain: 1,
      offset: 0,
      view: 0,
    });
  });
});

describe("grade.key matte views at export", () => {
  it("finds enabled keys whose view is set, in the root and precomps", () => {
    expect(keyMatteViews(comp({ params: { view: 0 } }))).toEqual([]);
    expect(keyMatteViews(comp({ params: { view: 2 } }))).toEqual([
      "layers.1.effects.0.params.view",
    ]);
    expect(
      keyMatteViews(comp({ enabled: false, params: { view: 1 } })),
    ).toEqual([]);
    const root = comp({});
    const nested = {
      ...root,
      precomps: [{ ...comp({ params: { view: 3 } }), id: "inner" }],
    } as unknown as Composition;
    expect(keyMatteViews(nested)).toEqual([
      "precomps.0.layers.1.effects.0.params.view",
    ]);
  });
});

describe("grade.key in float grade runs", () => {
  const effect = (
    id: string,
    name: string,
    params: Record<string, unknown> = {},
  ): RenderEffect =>
    ({
      id,
      effect: name,
      version: compositionEffectDefinition(name)!.version,
      enabled: true,
      params: {
        ...Object.fromEntries(
          Object.entries(compositionEffectDefinition(name)!.properties).map(
            ([k, p]) => [k, p.default],
          ),
        ),
        ...params,
      },
    }) as unknown as RenderEffect;
  it("joins the run and a lone key is a run of one", () => {
    const stack = [
      effect("a", "grade.primary", { gainMaster: 1.2 }),
      effect("k", "grade.key", { qualifier: 3 }),
      effect("b", "grade.primary", { saturation: 0.5 }),
      effect("c", "color.invert"),
      effect("k2", "grade.key", { view: 1 }),
    ];
    const stages = [...effectStages(stack)];
    expect(stages.map((s) => [s.effect.id, Boolean(s.run)])).toEqual([
      ["a", true],
      ["c", false],
      ["k2", true],
    ]);
  });
  it("is not an operator", () => {
    expect(() => floatGradeOp("grade.key", {})).toThrow(/not an operator/);
  });
});
