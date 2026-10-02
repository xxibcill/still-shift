import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  validateComposition,
  resolvePropertyPath,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "effects",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 60,
  background: "#000000",
  assets: [],
  layers: [
    {
      id: "box",
      type: "solid",
      size: [20, 20],
      color: "#ffffff",
      transform: { anchor: [0, 0], position: [-25, 30] },
      effects: [
        {
          id: "soft",
          effect: "blur.gaussian",
          params: {
            radius: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 10, value: 10 },
              ],
            },
          },
        },
      ],
    },
  ],
});

describe("composition effect stack", () => {
  it("validates registered parameters, key order, stack ids and active intervals", () => {
    expect(validateComposition(fixture()).ok).toBe(true);
    for (const update of [
      { params: { radius: -1 } },
      { params: { radius: 1001 } },
      { params: { radius: Infinity } },
      {
        params: {
          radius: {
            keys: [
              { frame: 2, value: 4 },
              { frame: 1, value: 3 },
            ],
          },
        },
      },
      { params: { raduis: 4 } },
      { effect: "unknown" },
      { inPoint: 10, outPoint: 3 },
    ]) {
      const comp = fixture();
      Object.assign(comp.layers[0]!.effects![0]!, update);
      expect(validateComposition(comp).ok, JSON.stringify(update)).toBe(false);
    }
    const duplicate = fixture();
    duplicate.layers[0]!.effects!.push(
      structuredClone(duplicate.layers[0]!.effects![0]!),
    );
    expect(validateComposition(duplicate).ok).toBe(false);
  });

  it("samples effect paths with layer clocks, accepts drivers and clamps their overshoot", () => {
    const comp = fixture();
    Object.assign(comp.layers[0]!, { startFrame: 2, stretch: 2 });
    const path = "box.effects[soft].radius";
    expect(resolvePropertyPath(comp, path)).toMatchObject({
      type: "scalar",
      readOnly: false,
    });
    expect(resolvePropertyPath(comp, "box.effects[soft].typo")).toMatchObject({
      code: "comp-path-property",
    });
    expect(evaluateProperty(comp, path, 12)).toBe(5);
    const driven = structuredClone(comp);
    driven.signals = [
      {
        id: "amount",
        keys: [
          { frame: 0, value: -4 },
          { frame: 10, value: 2000 },
        ],
      },
    ];
    driven.drivers = [{ target: path, signal: "amount", blend: "replace" }];
    expect(validateComposition(driven).ok).toBe(true);
    expect(evaluateProperty(driven, path, 0)).toBe(0);
    expect(evaluateProperty(driven, path, 22)).toBe(1000);
    expect(evaluateProperty(comp, path, 12)).toBe(5);
  });

  it("keeps offscreen pixels that blur into view and skips inactive stacks", () => {
    const comp = fixture();
    expect(buildRenderGraph(comp, evaluateComp(comp, 0)).culled).toEqual([
      "box",
    ]);
    const active = buildRenderGraph(comp, evaluateComp(comp, 10));
    expect(active.culled).toEqual([]);
    expect(active.root.ops[0]).toMatchObject({
      kind: "isolate",
      effects: [{ params: { radius: 10 } }],
    });
    const gated = structuredClone(comp);
    Object.assign(gated.layers[0]!.effects![0]!, { inPoint: 3, outPoint: 10 });
    expect(buildRenderGraph(gated, evaluateComp(gated, 10)).culled).toEqual([
      "box",
    ]);
    const group = fixture();
    group.layers.push({
      id: "group",
      type: "group",
      size: [100, 100],
      transform: { anchor: [0, 0] },
      effects: group.layers[0]!.effects!,
    });
    delete group.layers[0]!.effects;
    group.layers[0]!.parent = "group";
    expect(buildRenderGraph(group, evaluateComp(group, 10)).culled).toEqual([]);
  });

  it("bakes focus blur around painted root opacity without changing source state", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/ecommerce-motion/atoms/focus-blur.json",
          "utf8",
        ),
      ),
    );
    const before = structuredClone(source);
    const comp = commerceToComposition(source);
    expect(source).toEqual(before);
    assertCompositionAdapterState(compileCommerceScene(source), comp);
    const effect = source.effects!.find((e) => e.type === "focus-blur")!;
    if (effect.type !== "focus-blur") throw new Error("fixture");
    const group = comp.layers.find((layer) =>
      layer.effects?.some((e) => e.id === "effect0"),
    )!;
    expect(group.type).toBe("group");
    for (let frame = source.frameCount - 1; frame >= 0; frame--) {
      const p = Math.max(
        0,
        Math.min(1, (frame - effect.start) / (effect.end - effect.start)),
      );
      expect(
        evaluateProperty(comp, `${group.id}.effects[effect0].radius`, frame),
      ).toBe(
        effect.radius +
          (effect.endRadius - effect.radius) * (p * p * (3 - 2 * p)),
      );
    }
  });
});
