/**
 * CG5: the `lut` composition asset and `grade.lut`. A LUT is a pinned `.cube`
 * asset with declared input and output spaces; `grade.lut` binds it through
 * the effect's `assets` slots, validated with the composition.
 */
import { describe, expect, it } from "vitest";
import {
  compositionEffectDefinition,
  isFloatGradeEffect,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";

const SHA = `sha256:${"a".repeat(64)}`;
const lutAsset = (extra: Record<string, unknown> = {}) => ({
  id: "look",
  type: "lut",
  path: "look.cube",
  sha256: SHA,
  format: "cube",
  inputSpace: "legacy-srgb",
  outputSpace: "legacy-srgb",
  ...extra,
});
const comp = (
  effect: Record<string, unknown>,
  assets: unknown[] = [lutAsset()],
) =>
  ({
    schemaVersion: "composition-1",
    id: "cg5-rules",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 12,
    background: "#000000",
    assets,
    layers: [
      {
        id: "card",
        type: "solid",
        color: "#808080",
        size: [32, 32],
        effects: [{ id: "grade", ...effect }],
      },
    ],
  }) as unknown as Composition;
const diagnostics = (value: unknown) => {
  const result = validateComposition(value);
  return result.ok
    ? []
    : result.diagnostics.map((d) => `${d.code}: ${d.message}`);
};
const lut = { effect: "grade.lut", assets: { lut: "look" } };

describe("grade.lut contract", () => {
  it("is a float grade effect with intensity and interpolation", () => {
    expect(isFloatGradeEffect("grade.lut")).toBe(true);
    const definition = compositionEffectDefinition("grade.lut")!;
    expect(definition.requiresAssets).toEqual({ lut: "lut" });
    expect(Object.keys(definition.properties).sort()).toEqual([
      "intensity",
      "interpolation",
    ]);
  });
  it("accepts a bound LUT asset, animated intensity and trilinear", () => {
    expect(diagnostics(comp(lut))).toEqual([]);
    expect(
      diagnostics(
        comp({
          ...lut,
          params: {
            intensity: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 11, value: 1 },
              ],
            },
            interpolation: 1,
          },
        }),
      ),
    ).toEqual([]);
  });
  it("needs its asset slot, bound to a LUT asset that exists", () => {
    expect(diagnostics(comp({ effect: "grade.lut" }))).toEqual([
      expect.stringMatching(/^comp-effect-asset: .*"lut"/),
    ]);
    expect(
      diagnostics(comp({ effect: "grade.lut", assets: { lut: "other" } })),
    ).toEqual([
      expect.stringMatching(/^comp-effect-asset: No LUT asset "other"/),
    ]);
    expect(
      diagnostics(
        comp(lut, [
          {
            id: "look",
            type: "image",
            path: "a.png",
            sha256: SHA,
            width: 1,
            height: 1,
          },
        ]),
      ),
    ).toEqual([
      expect.stringMatching(/^comp-effect-asset: .*is not a lut asset/),
    ]);
    expect(
      diagnostics(comp({ ...lut, assets: { lut: "look", extra: "look" } })),
    ).toEqual([
      expect.stringMatching(
        /^comp-effect-asset: Undeclared effect asset slot "extra"/,
      ),
    ]);
    expect(
      diagnostics(comp({ effect: "grade.cdl", assets: { lut: "look" } })),
    ).toEqual([
      expect.stringMatching(
        /^comp-effect-asset: Undeclared effect asset slot "lut"/,
      ),
    ]);
  });
  it("bounds intensity and interpolation", () => {
    expect(
      diagnostics(comp({ ...lut, params: { intensity: 1.5 } })).length,
    ).toBe(1);
    expect(
      diagnostics(comp({ ...lut, params: { interpolation: 0.5 } })).length,
    ).toBe(1);
    expect(
      diagnostics(comp({ ...lut, params: { interpolation: 2 } })).length,
    ).toBe(1);
  });
  it("needs the declared format and spaces", () => {
    expect(diagnostics(comp(lut, [lutAsset({ format: "3dl" })])).length).toBe(
      1,
    );
    expect(
      diagnostics(comp(lut, [lutAsset({ inputSpace: "acescct" })])).length,
    ).toBe(1);
    const noOutput: Record<string, unknown> = lutAsset();
    delete noOutput.outputSpace;
    expect(diagnostics(comp(lut, [noOutput])).length).toBe(1);
    expect(diagnostics(comp(lut, [lutAsset({ sha256: "x" })])).length).toBe(1);
  });
  it("evaluates with its asset binding", () => {
    const frame = evaluateComp(comp({ ...lut, params: { intensity: 0.5 } }), 0);
    const effect = frame.layers[0]!.effects[0]!;
    expect(effect.assets).toEqual({ lut: "look" });
    expect(effect.params).toEqual({ intensity: 0.5, interpolation: 0 });
  });
});
