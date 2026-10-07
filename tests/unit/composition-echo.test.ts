import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CommerceSceneSchema,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  buildRenderGraph,
  type DrawOp,
  type IsolateOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { commerceEffectVariants } from "../helpers/composition-effects.ts";
import { collectCompositionTextFrames } from "../../packages/renderer-core/src/composition/render/text-frames.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "echo",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 60,
  assets: [],
  layers: [
    {
      id: "box",
      type: "solid",
      size: [20, 20],
      color: "#ffffff",
      transform: {
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 0, interpolation: "linear" },
              { frame: 30, value: 60, interpolation: "linear" },
            ],
          },
          y: 10,
        },
        opacity: 0.6,
      },
      effects: [
        {
          id: "trail",
          effect: "time.echo",
          params: { count: 3, spacing: 2, decay: 0.5 },
        },
      ],
    },
  ],
});
const graph = (comp: Composition, frame = 10) =>
  buildRenderGraph(comp, evaluateComp(comp, frame));

describe("native temporal echo", () => {
  it("prepares historical animated glyphs in a frozen, offscreen matte source", () => {
    const comp = fixture();
    comp.assets = [
      {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: `sha256:${"0".repeat(64)}`,
        weight: "400",
      },
    ];
    comp.layers = [
      { id: "inset", type: "precomp", comp: "source", timeRemap: 12 },
    ];
    comp.precomps = [
      {
        id: "source",
        width: 100,
        height: 100,
        frameCount: 60,
        layers: [
          {
            id: "text",
            type: "text",
            enabled: false,
            text: "Aa",
            fontSize: 30,
            fontAsset: "font",
            color: "#ffffff",
            transform: { position: [-50, 10] },
            effects: [
              {
                id: "trail",
                effect: "time.echo",
                params: { count: 3, spacing: 2, decay: 0.5 },
              },
            ],
          },
          {
            id: "art",
            type: "solid",
            size: [100, 100],
            color: "#ffffff",
            trackMatte: { layer: "text", mode: "alpha" },
          },
        ],
        textAnimators: [
          {
            node: "text",
            unit: "glyph",
            start: 0,
            end: 20,
            stagger: 0,
            selector: { start: 0, end: 1, easing: "linear" },
            from: { strokeWidth: 0 },
            to: { strokeWidth: 10 },
          },
        ],
      },
    ];
    expect(
      collectCompositionTextFrames(comp, {
        "source/text": [{ left: 0, top: 0, right: 20, bottom: 30 }],
      }),
    ).toEqual({ "source/text": [6, 8, 10, 12] });
  });
  it("gates a commerce wrapper when the current image is transparent", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/ecommerce-motion/atoms/echo.json",
          "utf8",
        ),
      ),
    );
    const variant = commerceEffectVariants("commerce/atom-echo", source).find(
      (item) => item.id.endsWith("/image-active-stack"),
    )!;
    const comp = commerceToComposition(variant.scene);
    expect(graph(comp, 21).root.ops).toEqual([]);
    expect(graph(comp, 14).root.ops.length).toBeGreaterThan(0);
    expect(graph(comp, 29).root.ops.length).toBeGreaterThan(0);
  });
  it("samples oldest first, preserves per-sample opacity, and holds random access stable", () => {
    const comp = fixture();
    const before = structuredClone(comp);
    const ops = (graph(comp).root.ops[0] as IsolateOp).ops as DrawOp[];
    expect(ops.map((op) => op.matrix[4])).toEqual([8, 12, 16, 20]);
    expect(ops.map((op) => op.opacity)).toEqual([0.075, 0.15, 0.3, 0.6]);
    const stable = graph(comp);
    graph(comp, 2);
    graph(comp, 59);
    expect(graph(comp)).toEqual(stable);
    expect(comp).toEqual(before);
    comp.layers[0]!.inPoint = 5;
    expect((graph(comp).root.ops[0] as IsolateOp).ops).toHaveLength(3);
    comp.layers[0]!.transform!.opacity = 0;
    expect(graph(comp).root.ops).toEqual([]);
  });

  it("skips matching declared revisions and rejects unbounded or ambiguous histories", () => {
    const comp = fixture();
    const effect = comp.layers[0]!.effects![0]!;
    Object.assign(effect.params!, { skipUnchanged: 1, sourceRevision: 7 });
    expect((graph(comp).root.ops[0] as IsolateOp).ops).toHaveLength(1);
    effect.params!.sourceRevision = {
      keys: [
        { frame: 0, value: 6, interpolation: "hold" },
        { frame: 9, value: 7, interpolation: "hold" },
      ],
    };
    expect((graph(comp).root.ops[0] as IsolateOp).ops).toHaveLength(4);
    effect.params!.count = 9;
    expect(validateComposition(comp).ok).toBe(false);
    effect.params!.count = 3;
    comp.layers[0]!.effects!.push({ ...effect, id: "second" });
    expect(validateComposition(comp).ok).toBe(false);
    comp.layers = [{ id: "adjust", type: "adjustment", effects: [effect] }];
    expect(validateComposition(comp).ok).toBe(true);
    expect(() =>
      evaluateComp(fixture(), 0, { scopeTimes: { inset: Infinity } }),
    ).toThrow(/finite/);
  });

  it("rewinds a remapped precomp locally while retaining its instance transform and scoped drivers", () => {
    const comp = fixture();
    const layers = comp.layers;
    comp.layers = [
      {
        id: "inset",
        type: "precomp",
        comp: "source",
        timeRemap: 12,
        stretch: 2,
        transform: { anchor: [0, 0], position: [30, 5] },
      },
    ];
    comp.precomps = [
      { id: "source", width: 100, height: 100, frameCount: 60, layers },
    ];
    comp.signals = [
      {
        id: "offset",
        keys: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 30, value: 30, interpolation: "linear" },
        ],
      },
    ];
    comp.drivers = [
      {
        target: "inset/box.transform.position.x",
        signal: "offset",
        blend: "add",
      },
    ];
    const outer = graph(comp).root.ops[0] as DrawOp;
    expect(outer.matrix[4]).toBe(30);
    if (outer.content.type !== "surface") throw new Error("Expected precomp");
    const ops = (outer.content.surface.ops[0] as IsolateOp).ops as DrawOp[];
    expect(ops.map((op) => op.matrix[4])).toEqual([22, 26, 30, 34]);
  });
});
