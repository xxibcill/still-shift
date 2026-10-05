import { describe, expect, it } from "vitest";
import {
  compositionEffectDefinition,
  defineCompositionEffect,
  registerCompositionEffectDefinition,
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { compileComposition } from "../../packages/renderer-core/src/composition/evaluate/compile.ts";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  compositionScene,
  assertCompositionEffectVersions,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { comp as buildComp, solid } from "@still-shift/motion";
import { compositionTracks } from "../../apps/lab/src/composition-keys.ts";

const definition = (version = "1.0.0", x = 3) =>
  defineCompositionEffect({
    version,
    properties: {
      amount: { type: "scalar", default: 1, min: 0, max: 2 },
      point: { type: "vec2", default: [x, 5], min: -10, max: 10 },
    },
    expandBounds: (bounds, params) => ({
      left: bounds.left - 10 * (params.amount as number),
      top: bounds.top - 10 * (params.amount as number),
      right: bounds.right + 10 * (params.amount as number),
      bottom: bounds.bottom + 10 * (params.amount as number),
    }),
  });
const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "plugin",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 30,
  assets: [],
  layers: [
    {
      id: "box",
      type: "solid",
      color: "#ffffff",
      size: [20, 20],
      transform: { anchor: [0, 0], position: [-25, 30] },
      effects: [{ id: "shift", effect: "test.offset" }],
    },
  ],
});

describe("composition effect contract registry", () => {
  it("validates joint and separated animated points without silently dropping z", () => {
    const spec = definition();
    for (const point of [
      [1, 2],
      { x: 1, y: 2 },
      {
        keys: [
          { frame: 0, value: [1, 2] },
          { frame: 10, value: [3, 4] },
        ],
      },
      { x: { keys: [{ frame: 0, value: 1 }] }, y: 2 },
    ])
      expect(spec.params.safeParse({ point }).success).toBe(true);
    for (const point of [
      [1, 2, 3],
      { x: 1, y: 2, z: 3 },
      [11, 0],
      { keys: [{ frame: 0, value: [1, 2, 3] }] },
      {
        keys: [
          { frame: 0, value: [1, 2] },
          { frame: 10, value: [3, 4], in: { ease: 0.5, speed: [1, 2, 3] } },
        ],
      },
    ])
      expect(spec.params.safeParse({ point }).success).toBe(false);
  });
  it("samples points in the local clock and clamps driven component overshoot", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      definition(),
    );
    try {
      const comp = fixture(),
        path = "box.effects[shift].point";
      Object.assign(comp.layers[0]!, { startFrame: 2, stretch: 2 });
      comp.layers[0]!.effects![0]!.params = {
        point: {
          keys: [
            { frame: 0, value: [0, 1] },
            { frame: 10, value: [8, 9], interpolation: "linear" },
          ],
        },
      };
      expect(validateComposition(comp).ok).toBe(true);
      expect(resolvePropertyPath(comp, path)).toMatchObject({ type: "vec2" });
      expect(resolvePropertyPath(comp, `${path}.x`)).toMatchObject({
        type: "scalar",
      });
      expect(resolvePropertyPath(comp, `${path}.z`)).toMatchObject({
        code: "comp-path-property",
      });
      expect(evaluateProperty(comp, path, 12)).toEqual([4, 5]);
      const driven = structuredClone(comp);
      driven.signals = [
        {
          id: "over",
          keys: [
            { frame: 0, value: 100 },
            { frame: 10, value: 100 },
          ],
        },
      ];
      driven.drivers = [
        { target: `${path}.x`, signal: "over", blend: "replace" },
      ];
      expect(evaluateProperty(driven, path, 12)).toEqual([10, 5]);
      expect(evaluateProperty(comp, path, 12)).toEqual([4, 5]);
    } finally {
      release();
    }
  });
  it("uses plugin bounds to retain offscreen content and includes the version in evaluated stacks", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      definition(),
    );
    try {
      const comp = fixture(),
        tree = evaluateComp(comp, 0);
      expect(tree.layers[0]!.effects[0]!.version).toBe("1.0.0");
      expect(buildRenderGraph(comp, tree).culled).toEqual([]);
      comp.layers[0]!.effects![0]!.params = { amount: 0 };
      const changed = structuredClone(comp);
      expect(
        buildRenderGraph(changed, evaluateComp(changed, 0)).culled,
      ).toEqual(["box"]);
    } finally {
      release();
    }
  });
  it("invalidates compiled validation when definitions are removed or replaced", () => {
    const comp = fixture(),
      release = registerCompositionEffectDefinition(
        "test.offset",
        definition(),
      );
    const original = compileComposition(comp);
    release();
    expect(() => compileComposition(comp)).toThrow(/test.offset/);
    const next = registerCompositionEffectDefinition(
      "test.offset",
      definition("1.1.0", 7),
    );
    try {
      expect(compileComposition(comp)).not.toBe(original);
      expect(evaluateProperty(comp, "box.effects[shift].point", 0)).toEqual([
        7, 5,
      ]);
      expect(evaluateComp(comp, 0).layers[0]!.effects[0]!.version).toBe(
        "1.1.0",
      );
      release();
      expect(compositionEffectDefinition("test.offset")?.version).toBe("1.1.0");
    } finally {
      next();
    }
  });
  it("rejects collisions and malformed registration identifiers", () => {
    const spec = definition(),
      release = registerCompositionEffectDefinition("test.offset", spec);
    try {
      for (const id of [
        "test.offset",
        "blur.gaussian",
        "Bad Name",
        "constructor",
        "a".repeat(65),
      ])
        expect(() => registerCompositionEffectDefinition(id, spec)).toThrow(
          /comp-effect-registration/,
        );
    } finally {
      release();
    }
    expect(compositionEffectDefinition("test.offset")).toBeUndefined();
    expect(compositionEffectDefinition("blur.gaussian")?.version).toBe("1.0.0");
  });
  it("captures kernel versions and rejects a stale export snapshot", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      definition(),
    );
    const scene = compositionScene(fixture());
    expect(scene.effectVersions).toEqual({ "test.offset": "1.0.0" });
    expect(() => assertCompositionEffectVersions(scene)).not.toThrow();
    release();
    const next = registerCompositionEffectDefinition(
      "test.offset",
      definition("1.1.0"),
    );
    try {
      expect(() => assertCompositionEffectVersions(scene)).toThrow(
        /captured export versions/,
      );
      expect(() =>
        assertCompositionEffectVersions(compositionScene(fixture())),
      ).not.toThrow();
    } finally {
      next();
    }
  });
  it("preserves point defaults while authoring individual components", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      definition(),
    );
    try {
      const result = buildComp(
        { width: 100, height: 100, fps: 30, frames: 30 },
        (c) => {
          const layer = c.add(
            solid("box", { size: [20, 20], color: "#ffffff" }).with({
              effects: [{ id: "shift", effect: "test.offset" }],
            }),
          );
          c.timeline(
            layer.property<number>("effects[shift].point.x").to(9, 10),
          );
        },
      );
      expect(evaluateProperty(result, "box.effects[shift].point", 0)).toEqual([
        3, 5,
      ]);
      expect(evaluateProperty(result, "box.effects[shift].point", 5)).toEqual([
        6, 5,
      ]);
      expect(evaluateProperty(result, "box.effects[shift].point", 10)).toEqual([
        9, 5,
      ]);
    } finally {
      release();
    }
  });
  it("compares captured versions independently of object entry order", () => {
    const composition = fixture();
    composition.layers[0]!.effects = [
      { id: "blur", effect: "blur.gaussian" },
      { id: "glow", effect: "light.glow" },
    ];
    const scene = compositionScene(composition);
    scene.effectVersions = Object.fromEntries(
      Object.entries(scene.effectVersions!).reverse(),
    );
    expect(() => assertCompositionEffectVersions(scene)).not.toThrow();
  });
  it("rejects incomplete callback bounds rather than silently culling the layer", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      defineCompositionEffect({
        ...definition(),
        expandBounds: () => ({ left: 0, top: 0, right: 1 }) as never,
      }),
    );
    try {
      expect(() => evaluateComp(fixture(), 0)).toThrow(/bounds must be finite/);
    } finally {
      release();
    }
  });
  it("exposes joint and separated point keys in the native inspector", () => {
    const release = registerCompositionEffectDefinition(
      "test.offset",
      definition(),
    );
    try {
      const comp = fixture();
      comp.layers[0]!.effects![0]!.params = {
        point: {
          x: {
            keys: [
              { frame: 0, value: 1 },
              { frame: 10, value: 2 },
            ],
          },
          y: 3,
        },
      };
      expect(
        compositionTracks(comp).map((track) => [track.property, track.kind]),
      ).toEqual([["effects[shift].point.x", "scalar"]]);
      comp.layers[0]!.effects![0]!.params = {
        point: {
          keys: [
            { frame: 0, value: [1, 2] },
            { frame: 10, value: [3, 4] },
          ],
        },
      };
      expect(
        compositionTracks(comp).map((track) => [track.property, track.kind]),
      ).toEqual([["effects[shift].point", "vector"]]);
    } finally {
      release();
    }
  });
  it("reports invalid callback bounds with the owning layer and root frame", () => {
    const spec = defineCompositionEffect({
      ...definition(),
      expandBounds: () => ({ left: NaN, top: 0, right: 1, bottom: 1 }),
    });
    const release = registerCompositionEffectDefinition("test.offset", spec);
    try {
      expect(() => evaluateComp(fixture(), 4)).toThrow(/bounds must be finite/);
      try {
        evaluateComp(fixture(), 4);
      } catch (error) {
        expect(error).toMatchObject({
          diagnostics: [
            {
              code: "comp-effect-bounds",
              node: "box",
              frame: 4,
              path: "box.effects[shift]",
            },
          ],
        });
      }
    } finally {
      release();
    }
  });
  it("rejects invalid descriptors and defaults before accepting a definition", () => {
    for (const point of [
      { type: "vec2", default: [11, 0], min: -10, max: 10 },
      { type: "vec2", default: [0, 0], min: 10, max: -10 },
      { type: "vec2", default: [NaN, 0], min: -10, max: 10 },
    ] as const)
      expect(() =>
        defineCompositionEffect({ version: "1.0.0", properties: { point } }),
      ).toThrow(/comp-effect-definition/);
    expect(() =>
      defineCompositionEffect({ version: "", properties: {} }),
    ).toThrow(/comp-effect-definition/);
  });
});
