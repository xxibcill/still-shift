import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { bakeExpressions } from "../../packages/renderer-core/src/composition/bake.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";

const referenceEcho = (
  reverse: boolean,
  x = "7",
  readY = false,
): Composition => {
  const result = validateComposition({
    schemaVersion: "composition-1",
    id: "main",
    width: 200,
    height: 200,
    fps: 30,
    frameCount: 16,
    assets: [],
    layers: [
      {
        id: "p",
        type: "precomp",
        comp: "clip",
        ...(reverse ? { startFrame: 15, stretch: -1 } : {}),
      },
    ],
    precomps: [
      {
        id: "clip",
        width: 200,
        height: 200,
        frameCount: 16,
        layers: [
          { id: "leader", type: "null" },
          {
            id: "hero",
            type: "solid",
            size: [10, 10],
            color: "#FFFFFF",
            effects: [
              {
                id: "echo",
                effect: "time.echo",
                params: { count: 1, spacing: 1, decay: 0.5 },
              },
            ],
          },
        ],
      },
    ],
    expressions: {
      "p/leader.transform.anchor.x": { source: x },
      "p/leader.transform.anchor.y": { source: "frame * 10 + 1" },
    },
    drivers: (readY ? ["x", "y"] : ["x"]).map((axis) => ({
      target: `p/hero.transform.position.${axis}`,
      source: `p/leader.constraintReference.${axis}`,
    })),
    periodic: [
      {
        target: "p/leader.constraintReference.x",
        start: 0,
        end: 5,
        blend: "replace",
        oscillate: { period: 10, amplitude: 0 },
      },
    ],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.composition;
};

describe("component dependencies in echo baking", () => {
  it.each([false, true])(
    "preserves an unrelated animated axis while baking required history (reverse=%s)",
    (reverse) => {
      const source = referenceEcho(reverse);
      const baked = bakeExpressions(source);
      expect(baked.ok).toBe(true);
      if (!baked.ok) throw new Error(JSON.stringify(baked.diagnostics));
      expect(baked.diagnostics).toEqual([]);

      for (let frame = 0; frame < source.frameCount; frame++) {
        const original = evaluateComp(source, frame);
        const output = evaluateComp(baked.composition, frame);
        // Include the undrawn leader: its current values must survive ghost sampling.
        expect(output.layers[0]!.precomp!.layers[0]!.transform).toEqual(
          original.layers[0]!.precomp!.layers[0]!.transform,
        );
        expect(buildRenderGraph(baked.composition, output)).toEqual(
          buildRenderGraph(source, original),
        );
      }
    },
  );

  it("still refuses conflicting values on the historically read axis", () => {
    expect(bakeExpressions(referenceEcho(false, "frame * 10"))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-bake-time" })],
    });
  });

  it("still requires both animated axes when both references are read", () => {
    expect(bakeExpressions(referenceEcho(false, "7", true))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-bake-time" })],
    });
  });
});
