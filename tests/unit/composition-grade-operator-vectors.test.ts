/**
 * CG4: grade.curves, grade.hue-curves and grade.tonal against the CG0
 * reference vectors (grade-operators.json), an independent NumPy/SciPy
 * implementation of the operators. Parameters go through the effect
 * definitions' defaults and the renderer's own operator table.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compositionEffectDefinition,
  type FloatGradeEffectId,
} from "@still-shift/scene-contract";
import { floatGradeOp } from "../../packages/renderer-core/src/composition/render/float-grade.ts";

type Case = {
  effect: FloatGradeEffectId;
  id: string;
  params: Record<string, unknown>;
  input: [number, number, number][];
  output: [number, number, number][];
};
const vectors = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../benchmarks/fixtures/color/cg0/vectors/grade-operators.json",
    ),
    "utf8",
  ),
) as { tolerances: { float64Port: { absolute: number } }; cases: Case[] };
const tolerance = vectors.tolerances.float64Port.absolute;
const CHANNELS = ["R", "G", "B"];

/** Reference params → effect params (RGB triples become name + R/G/B). */
function effectParams(effect: string, params: Record<string, unknown>) {
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(compositionEffectDefinition(effect)!.properties).map(
      ([key, property]) => [key, property.default],
    ),
  );
  for (const [key, value] of Object.entries(params)) {
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      typeof value[0] === "number"
    )
      CHANNELS.forEach((c, i) => (out[`${key}${c}`] = value[i]));
    else out[key] = value;
  }
  return out;
}

describe("CG4 grade operators (CG0 grade-operators.json)", () => {
  it("covers every CG4 operator", () => {
    expect(new Set(vectors.cases.map((c) => c.effect))).toEqual(
      new Set(["grade.curves", "grade.hue-curves", "grade.tonal"]),
    );
  });
  for (const c of vectors.cases)
    it(`${c.effect} ${c.id}: within ${tolerance} of the reference`, () => {
      const op = floatGradeOp(
        c.effect,
        effectParams(c.effect, c.params) as never,
      );
      expect(op).not.toBeNull();
      let worst = 0;
      c.input.forEach((v, i) => {
        const o = op!.apply(v);
        for (let k = 0; k < 3; k++)
          worst = Math.max(worst, Math.abs(o[k]! - c.output[i]![k]!));
      });
      expect(worst).toBeLessThanOrEqual(tolerance);
    });
});
