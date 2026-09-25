import { describe, expect, it } from "vitest";

import { parseEvaluationPresets } from "../../scripts/evaluation/presets.ts";

describe("evaluation preset selection", () => {
  it("preserves the historical three-preset default", () => {
    expect(parseEvaluationPresets(undefined)).toEqual([
      "slow_push",
      "horizontal_drift",
      "cinematic_float",
    ]);
  });

  it("accepts an explicit ordered subset", () => {
    expect(parseEvaluationPresets("horizontal_drift, slow_push")).toEqual([
      "horizontal_drift",
      "slow_push",
    ]);
  });

  it("rejects empty, automatic, unknown, and repeated selections", () => {
    expect(() => parseEvaluationPresets("")).toThrow("comma-separated");
    expect(() => parseEvaluationPresets("slow_push,")).toThrow(
      "comma-separated",
    );
    expect(() => parseEvaluationPresets("auto")).toThrow("Unknown");
    expect(() => parseEvaluationPresets("orbit")).toThrow("Unknown");
    expect(() => parseEvaluationPresets("slow_push,slow_push")).toThrow(
      "duplicate",
    );
  });
});
