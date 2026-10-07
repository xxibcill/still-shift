import { expect, it, vi } from "vitest";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import {
  buildRenderGraph,
  type IsolateOp,
  type ProjectOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  executeGraph,
  type RenderBackend,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import { renderCompositionExposure } from "../../packages/renderer-core/src/composition/render/exposure.ts";
import {
  flatLightingUniforms,
  validateFlatLighting,
} from "../../packages/renderer-core/src/composition/render/flat-lighting.ts";
const lamp = (
  id = "light",
  fields: Partial<Extract<CompositionLayer, { type: "light" }>> = {},
): CompositionLayer => ({
  id,
  type: "light",
  lightType: "spot",
  range: 300,
  falloffStart: 50,
  innerCone: 30,
  outerCone: 60,
  transform: { position: [50, 50, -100] },
  ...fields,
});
const plane = (
  fields: Partial<Extract<CompositionLayer, { type: "solid" }>> = {},
): CompositionLayer => ({
  id: "plane",
  type: "solid",
  size: [100, 100],
  color: "#808080",
  threeD: true,
  receivesLight: true,
  transform: { position: [50, 50, 0] },
  ...fields,
});
const doc = (layers: CompositionLayer[] = [lamp(), plane()]): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers,
});
const local = (d: Composition, frame = 5) =>
  (buildRenderGraph(d, evaluateComp(d, frame)).root.ops[0] as ProjectOp).surface
    .ops[0] as IsolateOp;
it("settles implicit XYZ lights in fixed authored order and preserves input", () => {
  const d = doc([
      lamp("a", {
        lightType: "point",
        innerCone: undefined,
        outerCone: undefined,
      }),
      lamp("b"),
      plane(),
    ]),
    before = JSON.stringify(d);
  const tree = evaluateComp(d, 5);
  expect(tree.lights!.map((x) => x.id)).toEqual(["a", "b"]);
  // Evaluated tree is painter order, but illumination must retain source authored order.
  expect(tree.layers.find((x) => x.id === "a")!.transform.position).toEqual([
    50, 50, -100,
  ]);
  expect(JSON.stringify(d)).toBe(before);
  expect(evaluateComp(d, 5)).toEqual(tree);
});
it.each([false, true])(
  "ignores drawable solo for light activation, honors group enable and guide %s",
  (solo) => {
    const d = doc([lamp(), plane({ solo })]);
    expect(evaluateComp(d, 5).lights).toHaveLength(1);
    d.layers[0]!.guide = true;
    expect(evaluateComp(structuredClone(d), 5).lights).toHaveLength(0);
    expect(
      evaluateComp(structuredClone(d), 5, { includeGuides: true }).lights,
    ).toHaveLength(1);
    d.layers[0]!.guide = false;
    d.layers[0]!.parent = "group";
    d.layers.push({
      id: "group",
      type: "group",
      size: [100, 100],
      enabled: false,
    });
    expect(evaluateComp(structuredClone(d), 5).lights).toHaveLength(0);
  },
);
it("counts disabled lights per scope, without counting other precomp lights", () => {
  expect(
    validateComposition(
      doc(
        Array.from({ length: 9 }, (_, i) => lamp("l" + i, { enabled: false })),
      ),
    ).diagnostics,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "comp-light-limit" }),
    ]),
  );
  const d = doc(Array.from({ length: 8 }, (_, i) => lamp("l" + i)));
  d.precomps = [
    {
      id: "inner",
      width: 100,
      height: 100,
      frameCount: 24,
      layers: Array.from({ length: 8 }, (_, i) => lamp("l" + i)),
    },
  ];
  expect(validateComposition(d).ok).toBe(true);
});
it.each(["driver", "expression"])(
  "settles paired light writes in either author order: %s",
  (kind) => {
    for (const reverse of [false, true]) {
      const d = doc();
      const values: [string, number][] = [
        ["light.falloffStart", 200],
        ["light.range", 400],
        ["light.innerCone", 80],
        ["light.outerCone", 90],
      ];
      if (reverse) values.reverse();
      if (kind === "driver") {
        d.signals = values.map(([, v], i) => ({
          id: "s" + i,
          keys: [
            { frame: 0, value: v },
            { frame: 23, value: v },
          ],
        }));
        d.drivers = values.map(([target], i) => ({ target, signal: "s" + i }));
      } else
        d.expressions = Object.fromEntries(
          values.map(([target, v]) => [target, { source: String(v) }]),
        );
      expect(evaluateComp(d, 5).lights![0]).toMatchObject({
        range: 400,
        falloffStart: 200,
        innerCone: 80,
        outerCone: 90,
      });
      expect(evaluateProperty(d, "light.range", 5)).toBe(400);
    }
  },
);
it("checks invalid final paired values and scalar overshoot with located errors", () => {
  const d = doc();
  d.expressions = {
    "light.falloffStart": { source: "400" },
    "light.range": { source: "200" },
  };
  expect(() => evaluateComp(d, 5)).toThrow("falloffStart");
  const invalid = doc();
  invalid.expressions = { "light.intensity": { source: "17" } };
  expect(() => evaluateComp(invalid, 5)).toThrow("Light intensity");
});
it("animates colour components and implicit XYZ paths including own keys", () => {
  const d = doc();
  d.expressions = {
    "light.color.r": { source: "0.25" },
    "light.transform.position.z": { source: "-50" },
    "light.intensity": { source: "2" },
  };
  expect(evaluateComp(d, 5).lights![0]).toMatchObject({
    color: [0.25, 1, 1, 1],
    position: [50, 50, -50],
    intensity: 2,
  });
});
it("retains exact unlit graphs when receiving or every active light is disabled", () => {
  const d = doc();
  (d.layers[1] as Extract<CompositionLayer, { type: "solid" }>).receivesLight =
    false;
  const unlit = doc([plane({ receivesLight: false })]);
  expect(buildRenderGraph(d, evaluateComp(d, 5))).toEqual(
    buildRenderGraph(unlit, evaluateComp(unlit, 5)),
  );
  const disabled = doc([lamp("light", { enabled: false }), plane()]);
  expect(buildRenderGraph(disabled, evaluateComp(disabled, 5))).toEqual(
    buildRenderGraph(doc([plane()]), evaluateComp(doc([plane()]), 5)),
  );
  expect(
    local(doc([lamp("light", { intensity: 0 }), plane()])).lighting,
  ).toBeDefined();
});
it("places shading before local effects/masks and screen focus after projection", () => {
  const d = doc([
    lamp(),
    {
      id: "camera",
      type: "camera",
      depthOfField: true,
      aperture: 10,
      focusDistance: 150,
    },
    plane({
      effects: [
        { id: "primitive", effect: "blur.primitive", params: { radius: 2 } },
        { id: "tint", effect: "color.tint" },
      ],
    }),
  ]);
  const tree = evaluateComp(d, 5),
    op = buildRenderGraph(d, tree).root.ops[0] as ProjectOp;
  expect(op.effects[0]!.effect).toBe("blur.lens");
  const isolated = op.surface.ops[0] as IsolateOp;
  expect(isolated.lighting).toMatchObject({
    version: "flat-lighting-1",
    normal: [0, 0, 1],
  });
  expect(isolated.effects.map((x) => x.effect)).toEqual([
    "blur.gaussian",
    "color.tint",
  ]);
  expect(isolated.ops[0]).not.toHaveProperty("paintBlur");
});
it("samples light, receiver and focus from the receiver-selected exposure scope", () => {
  const d = doc();
  d.motionBlur = {
    enabled: true,
    shutterAngle: 360,
    shutterPhase: 0,
    samples: 4,
  };
  d.layers[1]!.motionBlur = true;
  const light = d.layers[0] as Extract<CompositionLayer, { type: "light" }>;
  light.intensity = {
    keys: [
      { frame: 0, value: 0 },
      { frame: 23, value: 2, interpolation: "linear" },
    ],
  };
  const graphs = [...evaluateCompositionExposure(d, 10)].map((tree) =>
    buildRenderGraph(d, tree),
  );
  const intensities = graphs.map(
    (graph) =>
      ((graph.root.ops[0] as ProjectOp).surface.ops[0] as IsolateOp).lighting!
        .lights[0]!.colorWeight[3],
  );
  expect(new Set(intensities).size).toBe(4);
  d.layers[1]!.motionBlur = false;
  light.motionBlur = true;
  const held = [...evaluateCompositionExposure(structuredClone(d), 10)].map(
    (tree) => buildRenderGraph(d, tree),
  );
  expect(held.every((x) => JSON.stringify(x) === JSON.stringify(held[0]))).toBe(
    true,
  );
});
it("preflights lit Canvas graphs before any lifecycle/target mutation, including later shutter samples", () => {
  const clear = vi.fn(),
    beginFrame = vi.fn(),
    createSurface = vi.fn(),
    backend = { clear, beginFrame, createSurface } as unknown as RenderBackend;
  const d = doc(),
    graph = buildRenderGraph(d, evaluateComp(d, 5));
  expect(() =>
    executeGraph(backend, graph, { width: 100, height: 100 }),
  ).toThrow("lighting requires");
  expect(clear).not.toHaveBeenCalled();
  expect(beginFrame).not.toHaveBeenCalled();
  d.motionBlur = {
    enabled: true,
    shutterAngle: 360,
    shutterPhase: 0,
    samples: 4,
  };
  d.layers[1]!.motionBlur = true;
  expect(() =>
    renderCompositionExposure(backend, { width: 100, height: 100 }, d, 5),
  ).toThrow("lighting requires");
  expect(createSurface).not.toHaveBeenCalled();
});
it("rejects float32 coefficient overflow before GPU drawing and packs only active slots", () => {
  const lighting = local(doc()).lighting!;
  expect(flatLightingUniforms(lighting)).toHaveProperty("lightPosition0");
  expect(flatLightingUniforms(lighting)).not.toHaveProperty("lightPosition1");
  lighting.x[0] = 3e38;
  expect(() => validateFlatLighting(lighting, "plane", 100, 100)).toThrow(
    "finite WebGL2",
  );
});

it("keeps illumination in its own precomp scope and isolates parent shading", () => {
  const d = doc([
    lamp("parent"),
    {
      id: "instance",
      type: "precomp",
      comp: "inner",
      threeD: true,
      receivesLight: true,
    },
  ]);
  d.precomps = [
    {
      id: "inner",
      width: 100,
      height: 100,
      frameCount: 24,
      layers: [lamp("child"), plane()],
    },
  ];
  const tree = evaluateComp(d, 5),
    inner = tree.layers.find((l) => l.id === "instance")!.precomp!;
  expect(tree.lights!.map((l) => l.id)).toEqual(["parent"]);
  expect(inner.lights!.map((l) => l.id)).toEqual(["child"]);
  (d.layers[0] as Extract<CompositionLayer, { type: "light" }>).intensity = 12;
  expect(
    evaluateComp(structuredClone(d), 5).layers.find((l) => l.id === "instance")!
      .precomp,
  ).toEqual(inner);
  d.layers[0]!.enabled = false;
  expect(evaluateComp(structuredClone(d), 5).lights).toEqual([]);
  expect(
    evaluateComp(structuredClone(d), 5).layers.find((l) => l.id === "instance")!
      .precomp!.lights,
  ).toEqual(inner.lights);
});
it("does not feed camera movement into the flat-light shading model", () => {
  const d = doc([lamp(), { id: "camera", type: "camera" }, plane()]),
    before = local(d).lighting;
  d.layers[1]!.transform = {
    position: [35, 20, -240],
    orientation: [15, 10, 5],
  };
  const moved = structuredClone(d);
  expect(local(moved).lighting).toEqual(before);
  expect(evaluateComp(moved, 5).camera).not.toEqual(
    evaluateComp(doc([lamp(), { id: "camera", type: "camera" }, plane()]), 5)
      .camera,
  );
});
