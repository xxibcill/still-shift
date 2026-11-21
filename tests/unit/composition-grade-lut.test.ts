/**
 * CG5: the `lut` composition asset and `grade.lut`. A LUT is a pinned `.cube`
 * asset with declared input and output spaces; `grade.lut` binds it through
 * the effect's `assets` slots, validated with the composition.
 */
import { describe, expect, it } from "vitest";
import {
  COMPOSITION_DIAGNOSTICS,
  compositionEffectDefinition,
  isFloatGradeEffect,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  floatGradeOp,
  lutTexel,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import {
  EFFECT_LUTS,
  LUT_TEXTURE_WIDTH,
  preparedLut,
} from "../../packages/renderer-core/src/composition/render/luts.ts";
import { bakeCubeLut, type Rgb } from "@still-shift/color-science";

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
  it("registers its diagnostic codes for the composition reference", () => {
    for (const code of [
      "comp-effect-asset",
      "comp-lut-unreadable",
      "comp-lut-invalid",
      "comp-lut-checksum",
      "comp-lut-not-ready",
    ])
      expect(COMPOSITION_DIAGNOSTICS, code).toHaveProperty(code);
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

describe("grade.lut texture offsets (GPU)", () => {
  it("passes each table's offset as an exact texel row and column", () => {
    const shaped = {
      ...bakeCubeLut((v: Rgb) => v, 2),
      shaper: {
        kind: "1d" as const,
        size: 2,
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number],
        data: Float64Array.from([0, 0, 0, 1, 1, 1]),
      },
    };
    const op = floatGradeOp(
      "grade.lut",
      { intensity: 0.5, interpolation: 1 },
      { [EFFECT_LUTS]: { lut: preparedLut(SHA, shaped) } },
    )!;
    // Odd offsets above 2^23 and above 2^24: `x + 0.5` in float32 rounds the
    // first to x + 1, and a float32 cannot hold the second at all.
    for (const lutBase of [0, 4095, 4096, 12_892_425, 19_320_201]) {
      const { uniforms } = op.glsl((name) => name, { rows: [], lutBase });
      const at = uniforms.LutAt as number[];
      for (const value of at) expect(Math.fround(value)).toBe(value);
      const offset = (row: number, column: number) =>
        Math.trunc(row) * LUT_TEXTURE_WIDTH + Math.trunc(column);
      // The shaper's six floats come first, then the main table.
      expect(offset(at[2]!, at[3]!)).toBe(lutBase);
      expect(offset(at[0]!, at[1]!)).toBe(lutBase + 6);
      expect(at[1]).toBeLessThan(LUT_TEXTURE_WIDTH);
      expect(uniforms.Lut).toEqual([2, 1, 1, 0.5]);
      expect(uniforms.ShaperSize).toBe(2);
    }
    expect(lutTexel(4096 * 8191 + 4095)).toEqual([8191, 4095]);
  });
});
