import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  buildRenderGraph,
  type AdjustOp,
  type DrawOp,
  type IsolateOp,
  type RenderOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "adjust-history",
  width: 64,
  height: 48,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [
    { id: "above", type: "solid", size: [4, 4], color: "#00ff00" },
    {
      id: "adjust",
      type: "adjustment",
      effects: [
        {
          id: "trail",
          effect: "time.echo",
          params: { count: 2, spacing: 2, decay: 0.5 },
        },
      ],
    },
    {
      id: "below",
      type: "solid",
      size: [4, 4],
      color: "#ffffff",
      transform: {
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 0, interpolation: "linear" },
              { frame: 20, value: 40, interpolation: "linear" },
            ],
          },
          y: 8,
        },
      },
    },
  ],
});
const graph = (comp: Composition, time = 10) =>
  buildRenderGraph(comp, evaluateComp(comp, time));
const adjustment = (comp: Composition) =>
  graph(comp).root.ops.find((op) => op.kind === "adjust") as AdjustOp;

describe("adjustment backdrop history", () => {
  it("accepts echo and primitive blur on adjustments while rejecting nulls and duplicates", () => {
    const comp = fixture();
    expect(validateComposition(comp).ok).toBe(true);
    comp.layers[1]!.effects!.push({
      id: "soft",
      effect: "blur.primitive",
      params: { radius: 2 },
    });
    expect(validateComposition(comp).ok).toBe(true);
    comp.layers[1]!.effects!.push({ id: "second", effect: "time.echo" });
    expect(validateComposition(comp).ok).toBe(false);
    comp.layers[1]!.effects!.pop();
    comp.layers[1] = {
      id: "adjust",
      type: "null",
      effects: comp.layers[1]!.effects,
    };
    expect(validateComposition(comp).ok).toBe(false);
  });
  it("replays only preceding paint at oldest-first historical clocks and remains random-access stable", () => {
    const comp = fixture(),
      before = structuredClone(comp);
    const op = adjustment(comp);
    expect(op.history!.map((sample) => sample.opacity)).toEqual([0.25, 0.5]);
    expect(
      op.history!.map((sample) => (sample.ops[0] as DrawOp).matrix[4]),
    ).toEqual([12, 16]);
    expect(op.history!.every((sample) => sample.ops.length === 1)).toBe(true);
    const stable = graph(comp);
    graph(comp, 1);
    graph(comp, 23);
    expect(graph(comp)).toEqual(stable);
    expect(comp).toEqual(before);
  });
  it("maps primitive blur to a captured-backdrop Gaussian without altering drawable paint blur", () => {
    const comp = fixture();
    comp.layers[1]!.effects = [
      { id: "soft", effect: "blur.primitive", params: { radius: 3 } },
    ];
    expect(adjustment(comp).effects).toEqual([
      expect.objectContaining({
        id: "soft",
        effect: "blur.gaussian",
        params: { radius: 3 },
      }),
    ]);
    comp.layers[2]!.effects = [
      { id: "paint", effect: "blur.primitive", params: { radius: 4 } },
    ];
    expect((graph(comp).root.ops[0] as DrawOp).paintBlur).toBe(4);
  });
  it("keeps upstream echoes in historical snapshots", () => {
    const comp = fixture();
    comp.layers[2]!.effects = [
      {
        id: "prior-trail",
        effect: "time.echo",
        params: { count: 1, spacing: 1, decay: 0.5 },
      },
    ];
    const prior = adjustment(comp).history![0]!.ops[0]!;
    expect(prior.kind).toBe("isolate");
    if (prior.kind !== "isolate") throw Error("Expected upstream echo");
    expect(prior.ops).toHaveLength(2);
  });
  it("skips declared unchanged revisions and clamps history at zero", () => {
    const comp = fixture();
    Object.assign(comp.layers[1]!.effects![0]!.params!, {
      skipUnchanged: 1,
      sourceRevision: 7,
    });
    expect(adjustment(comp)).toBeUndefined();
    comp.layers[1]!.effects![0]!.params!.skipUnchanged = 0;
    const op = graph(comp, 1).root.ops.find(
      (op) => op.kind === "adjust",
    ) as AdjustOp;
    expect(
      op.history!.map((sample) => (sample.ops[0] as DrawOp).matrix[4]),
    ).toEqual([0, 0]);
  });
  it("rewinds only the remapped precomp clock and captures its transparent surface", () => {
    const comp = fixture();
    const layers = comp.layers;
    comp.layers = [
      {
        id: "inset",
        type: "precomp",
        comp: "source",
        timeRemap: 12,
        transform: { position: [20, 0], anchor: [0, 0] },
      },
    ];
    comp.precomps = [
      { id: "source", width: 64, height: 48, frameCount: 24, layers },
    ];
    const outer = graph(comp).root.ops[0] as DrawOp;
    if (outer.content.type !== "surface") throw Error("Expected precomp");
    const op = outer.content.surface.ops.find(
      (op) => op.kind === "adjust",
    ) as AdjustOp;
    expect(
      op.history!.map((sample) => (sample.ops[0] as DrawOp).matrix[4]),
    ).toEqual([16, 20]);
    expect(op.history!.map((sample) => sample.background)).toEqual([
      null,
      null,
    ]);
  });
  it.each(["group", "precomp", "collapsed"])(
    "retains history in hidden captured %s sources",
    (kind) => {
      const comp = fixture(),
        children = comp.layers.slice(1);
      const owner: Composition["layers"][number] = {
        id: "owner",
        type: "solid",
        size: [64, 48],
        color: "#ffffff",
        effects: [
          {
            id: "map",
            effect: "distort.displacement-map",
            inputs: { map: "source" },
          },
        ],
      };
      if (kind === "group")
        comp.layers = [
          owner,
          ...children.map((layer) => ({ ...layer, parent: "source" })),
          {
            id: "source",
            type: "group",
            size: [64, 48],
            enabled: false,
            transform: { anchor: [0, 0] },
          },
        ];
      else {
        comp.layers = [
          owner,
          {
            id: "source",
            type: "precomp",
            comp: "child",
            enabled: false,
            collapseTransforms: kind === "collapsed",
            transform: { anchor: [0, 0] },
          },
        ];
        comp.precomps = [
          {
            id: "child",
            width: 64,
            height: 48,
            frameCount: 24,
            layers: children,
          },
        ];
      }
      const root = graph(comp).root.ops[0] as IsolateOp;
      const inputs = root.effects[0]!.layerInputs!.map!;
      const find = (ops: RenderOp[]): AdjustOp | undefined => {
        for (const op of ops) {
          if (op.kind === "adjust") return op;
          const nested =
            op.kind === "isolate"
              ? find(op.ops)
              : op.kind === "draw" && op.content.type === "surface"
                ? find(op.content.surface.ops)
                : undefined;
          if (nested) return nested;
        }
        return undefined;
      };
      expect(find(inputs)?.history).toHaveLength(2);
    },
  );
  it("fails explicitly when chained backdrop histories exceed their replay budget", () => {
    const comp = fixture();
    comp.layers = Array.from({ length: 8 }, (_, i) => ({
      id: `adjust${i}`,
      type: "adjustment" as const,
      effects: [
        {
          id: "trail",
          effect: "time.echo",
          params: { count: 8, spacing: 1, decay: 0.5 },
        },
      ],
    })).concat(comp.layers[2] as never);
    expect(() => graph(comp)).toThrow(/comp-effect-budget/);
  });
});
