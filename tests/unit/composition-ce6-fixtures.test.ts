import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateComposition } from "@still-shift/scene-contract";
import { COMPOSITION_EFFECTS } from "../../packages/scene-contract/src/composition/effects.ts";
import {
  CE6_LUT_FILE,
  CE6_LUT_SHA256,
  ce6LutText,
  ce6NativeFixtures,
} from "../../benchmarks/fixtures/composition/ce6/catalogue.ts";

describe("CE6 native catalogue acceptance", () => {
  it("covers every registered builtin in validated standalone compositions", () => {
    const fixtures = ce6NativeFixtures();
    const effects = new Set<string>();
    for (const [id, composition] of fixtures) {
      const stored = JSON.parse(
        readFileSync(
          new URL(
            `../../benchmarks/fixtures/composition/ce6/${id}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
      expect(stored).toEqual(composition);
      const validation = validateComposition(composition);
      expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
      for (const layer of composition.layers)
        for (const effect of layer.effects ?? []) effects.add(effect.effect);
    }
    expect([...effects].sort()).toEqual(
      Object.keys(COMPOSITION_EFFECTS).sort(),
    );
    expect(fixtures.some(([, comp]) => comp.colorSpace === "linear-srgb")).toBe(
      true,
    );
  });
  it("pins the generated CG5 LUT that the lut-grade cell uses", () => {
    const text = readFileSync(
      new URL(
        `../../benchmarks/fixtures/composition/ce6/${CE6_LUT_FILE}`,
        import.meta.url,
      ),
      "utf8",
    );
    expect(text).toBe(ce6LutText());
    expect(`sha256:${createHash("sha256").update(text).digest("hex")}`).toBe(
      CE6_LUT_SHA256,
    );
  });
});
