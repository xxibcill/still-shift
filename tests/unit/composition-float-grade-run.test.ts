import { describe, expect, it } from "vitest";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  effectStages,
  floatGradeRun,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type { CompositionEffectPlugin } from "../../packages/renderer-core/src/composition/render/effect-plugins.ts";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";

/**
 * CG2 run splitting: which effects one float stage (one quantization)
 * covers. A wrong split is a precision regression, not a crash.
 */
const defaults = (id: string) =>
  Object.fromEntries(
    Object.entries(compositionEffectDefinition(id)!.properties).map(
      ([key, property]) => [key, property.default as number],
    ),
  );
const effect = (
  id: string,
  kind: string,
  params: Record<string, number> = {},
  extra: Partial<RenderEffect> = {},
): RenderEffect => ({
  id,
  effect: kind,
  enabled: true,
  params: { ...defaults(kind), ...params },
  ...extra,
});
const gain = (id: string, value: number, extra: Partial<RenderEffect> = {}) =>
  effect(id, "grade.primary", { gainMaster: value }, extra);
const stages = (stack: RenderEffect[]) =>
  [...effectStages(stack)].map(
    ({ effect, run }) => `${effect.id}${run ? "+run" : ""}`,
  );
/** The fused shader's operator calls, through a recording GPU context. */
function fusedCalls(plugin: Readonly<CompositionEffectPlugin>) {
  let fragment = "";
  const context = {
    createSurface: () => ({}),
    pass: (shader: string) => {
      fragment = shader;
    },
  };
  plugin.renderGpu!(
    context as never,
    { width: 1, height: 1 } as never,
    {} as never,
  );
  return fragment.match(/v=g\w+\(|v=g\d+Mix\*/g) ?? [];
}

describe("float grade runs", () => {
  it("fuses consecutive grade effects and leaves others alone", () => {
    const stack = [
      gain("a", 2),
      effect("b", "grade.cdl", { slopeR: 1.1 }),
      effect("c", "color.exposure", { exposure: 1 }),
      gain("d", 0.5),
    ];
    expect(stages(stack)).toEqual(["a+run", "c", "d"]);
    expect(floatGradeRun(stack, 0)!.end).toBe(1);
    expect(fusedCalls(floatGradeRun(stack, 0)!.plugin)).toHaveLength(2);
  });

  it("skips disabled effects of any kind inside a run", () => {
    const stack = [
      effect("off0", "grade.primary", {}, { enabled: false }),
      gain("a", 2),
      effect("off1", "color.exposure", { exposure: 1 }, { enabled: false }),
      gain("b", 0.5),
      gain("off2", 3, { enabled: false }),
    ];
    expect(stages(stack)).toEqual(["a+run"]);
    expect(floatGradeRun(stack, 1)!.end).toBe(4);
    expect(fusedCalls(floatGradeRun(stack, 1)!.plugin)).toHaveLength(2);
  });

  it("splits at an effect with a window", () => {
    const window = { left: 0, top: 0, width: 4, height: 4 };
    const stack = [gain("a", 2), gain("b", 0.5, { window }), gain("c", 1.5)];
    expect(stages(stack)).toEqual(["a", "b", "c"]);
    expect(floatGradeRun(stack, 1)).toBeUndefined();
  });

  it("does not fuse a run of one", () => {
    expect(stages([gain("a", 2)])).toEqual(["a"]);
    expect(
      stages([gain("a", 2), effect("b", "color.exposure", { exposure: 1 })]),
    ).toEqual(["a", "b"]);
  });

  it("keeps neutral members in the run but emits no operator for them", () => {
    const stack = [gain("a", 2), effect("b", "grade.cdl"), gain("c", 0.5)];
    expect(stages(stack)).toEqual(["a+run"]);
    expect(fusedCalls(floatGradeRun(stack, 0)!.plugin)).toHaveLength(2);
  });

  it("rejects a member sampled at another definition version", () => {
    const stack = [gain("a", 2), gain("b", 0.5, { version: "0.9.0" })];
    expect(() => floatGradeRun(stack, 0)).toThrow(/comp-effect-version/);
  });
});
