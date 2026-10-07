import { expect, it } from "vitest";
import {
  defineCompositionEffect,
  registerCompositionEffectDefinition,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "inputs",
  width: 32,
  height: 32,
  fps: 24,
  frameCount: 12,
  assets: [],
  layers: [
    {
      id: "art",
      type: "solid",
      size: [32, 32],
      color: "#ffffff",
      effects: [
        { id: "input", effect: "test.input", inputs: { map: "source" } },
      ],
    },
    {
      id: "source",
      type: "solid",
      size: [16, 16],
      color: "#ff0000",
      enabled: false,
    },
  ],
});
it("validates declared scoped input slots and samples their stable identity", () => {
  const release = registerCompositionEffectDefinition(
    "test.input",
    defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
  );
  try {
    const c = fixture();
    expect(validateComposition(c).ok).toBe(true);
    expect(evaluateComp(c, 0).layers[0]!.effects[0]!.inputs).toEqual({
      map: "source",
    });
    const graph = buildRenderGraph(c, evaluateComp(c, 0));
    expect(JSON.stringify(graph.root.ops)).toContain('"layerInputs":{"map":');
    c.layers[0]!.effects![0]!.inputs = { map: "missing" };
    expect(
      validateComposition(c).diagnostics.some(
        (i) => i.code === "comp-effect-layer",
      ),
    ).toBe(true);
    c.layers[0]!.effects![0]!.inputs = {};
    expect(
      validateComposition(c).diagnostics.some(
        (i) => i.code === "comp-effect-layer",
      ),
    ).toBe(true);
  } finally {
    release();
  }
});
it("rejects self, combined matte/input and group-descendant cycles", () => {
  const release = registerCompositionEffectDefinition(
    "test.input",
    defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
  );
  try {
    let c = fixture();
    c.layers[0]!.effects![0]!.inputs = { map: "art" };
    expect(
      validateComposition(c).diagnostics.some(
        (i) => i.code === "comp-effect-cycle",
      ),
    ).toBe(true);
    c = fixture();
    c.layers[1]!.trackMatte = { layer: "art", mode: "alpha" };
    expect(
      validateComposition(c).diagnostics.some(
        (i) => i.code === "comp-effect-cycle",
      ),
    ).toBe(true);
    c = fixture();
    c.layers.push({ id: "group", type: "group", size: [32, 32] });
    c.layers[0]!.parent = "group";
    c.layers[0]!.effects![0]!.inputs = { map: "group" };
    expect(
      validateComposition(c).diagnostics.some(
        (i) => i.code === "comp-effect-cycle",
      ),
    ).toBe(true);
  } finally {
    release();
  }
});
it("freezes unique bounded input slot declarations", () => {
  const spec = defineCompositionEffect({
    version: "1.0.0",
    properties: {},
    requiresLayers: ["map"],
  });
  expect(Object.isFrozen(spec.requiresLayers)).toBe(true);
  for (const slots of [
    ["map", "map"],
    ["constructor"],
    Array.from({ length: 9 }, (_, i) => `input${i}`),
  ])
    expect(() =>
      defineCompositionEffect({
        version: "1.0.0",
        properties: {},
        requiresLayers: slots,
      }),
    ).toThrow(/input slots/);
});
it("retains inactive input identity with an empty source graph", () => {
  const release = registerCompositionEffectDefinition(
    "test.input",
    defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
  );
  try {
    const c = fixture();
    c.layers[1]!.outPoint = 2;
    const graph = buildRenderGraph(c, evaluateComp(c, 5));
    expect(JSON.stringify(graph.root.ops)).toContain(
      '"layerInputs":{"map":[]}',
    );
  } finally {
    release();
  }
});
it("diagnoses an excessive acyclic input chain before exhausting the JavaScript stack", () => {
  const release = registerCompositionEffectDefinition(
    "test.input",
    defineCompositionEffect({
      version: "1.0.0",
      properties: {},
      requiresLayers: ["map"],
    }),
  );
  try {
    const c = fixture();
    c.layers = [
      ...Array.from({ length: 70 }, (_, i) => ({
        id: `node${i}`,
        type: "solid" as const,
        size: [16, 16] as [number, number],
        color: "#ffffff",
        ...(i ? { enabled: false } : {}),
        ...(i < 69
          ? {
              effects: [
                {
                  id: "input",
                  effect: "test.input",
                  inputs: { map: `node${i + 1}` },
                },
              ],
            }
          : {}),
      })),
    ];
    expect(validateComposition(c).ok).toBe(true);
    expect(() => buildRenderGraph(c, evaluateComp(c, 0))).toThrow(
      /comp-effect-budget/,
    );
  } finally {
    release();
  }
});
