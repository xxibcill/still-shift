import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  buildRenderGraph,
  type DrawOp,
  type IsolateOp,
  type RenderOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";

const comp = (
  layers: CompositionLayer[],
  extra: Partial<Composition> = {},
): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 200,
  height: 100,
  fps: 30,
  frameCount: 60,
  background: "#000000",
  assets: [],
  layers,
  ...extra,
});
const solid = (
  id: string,
  extra: Partial<Extract<CompositionLayer, { type: "solid" }>> = {},
): CompositionLayer => ({
  id,
  type: "solid",
  size: [20, 10],
  color: "#ffffff",
  transform: { position: [50, 30] },
  ...extra,
});
const graph = (doc: Composition, time = 0) =>
  buildRenderGraph(doc, evaluateComp(doc, time));
const summary = (ops: RenderOp[]): unknown[] =>
  ops.map((op) =>
    op.kind === "isolate"
      ? {
          isolate: op.layer,
          blend: op.blend,
          ops: summary(op.ops),
          ...(op.masks.length ? { masks: op.masks.map((m) => m.id) } : {}),
          ...(op.matte
            ? { matte: op.matte.mode, matteOps: summary(op.matte.ops) }
            : {}),
        }
      : op.kind === "adjust"
        ? { adjust: op.layer, blend: op.blend }
        : { draw: op.layer, content: op.content.type },
  );

describe("render graph", () => {
  it("paints the first slice bottom to top with isolation only where needed", () => {
    const doc = JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/composition/ce1/first-slice.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Composition;
    const tree = evaluateComp(doc, 20, {
      textBounds: { title: [{ left: 0, top: 0, right: 700, bottom: 100 }] },
    });
    const result = buildRenderGraph(doc, tree);
    expect(summary(result.root.ops)).toEqual([
      { draw: "badge-layer", content: "surface" },
      {
        isolate: "store",
        blend: "normal",
        ops: [{ draw: "store", content: "image" }],
        matte: "alpha",
        matteOps: [{ draw: "store-matte", content: "solid" }],
      },
      {
        isolate: "shade",
        blend: "multiply",
        ops: [{ draw: "shade", content: "solid" }],
      },
      { draw: "title", content: "text" },
    ]);
    const badge = result.root.ops[0] as DrawOp;
    expect(badge.content.type === "surface" && badge.content.surface).toEqual(
      expect.objectContaining({ id: "badge", width: 600, height: 440 }),
    );
    // Isolated content draws at full opacity; the composite carries the layer's.
    const shade = result.root.ops[2] as IsolateOp;
    expect(shade.opacity).toBeCloseTo(0.6);
    expect((shade.ops[0] as DrawOp).opacity).toBe(1);
    expect(result.culled).toEqual([]);
  });

  it("culls layers whose bounds miss the surface and skips transparent ones", () => {
    const doc = comp([
      solid("off", { transform: { position: [500, 30] } }),
      solid("clear", { transform: { opacity: 0 } }),
      solid("on"),
    ]);
    const result = graph(doc);
    expect(summary(result.root.ops)).toEqual([
      { draw: "on", content: "solid" },
    ]);
    expect(result.culled).toEqual(["off"]);
  });

  it("inlines collapsed precomps with combined transforms and opacity", () => {
    const doc = comp(
      [
        {
          id: "host",
          type: "precomp",
          comp: "inner",
          collapseTransforms: true,
          transform: { position: [100, 50], opacity: 0.5 },
        },
      ],
      {
        precomps: [
          {
            id: "inner",
            width: 40,
            height: 20,
            frameCount: 60,
            layers: [solid("child", { transform: { position: [10, 5] } })],
          },
        ],
      },
    );
    const [op] = graph(doc).root.ops as DrawOp[];
    expect(op).toEqual(
      expect.objectContaining({
        kind: "draw",
        layer: "host/child",
        opacity: 0.5,
      }),
    );
    // Host: position (100, 50) − centre anchor (20, 10); the child's own anchor
    // (10, 5) cancels its position, so its origin lands at (80, 40).
    expect(op!.matrix).toEqual([1, 0, 0, 1, 80, 40]);
  });

  it.each(["normal", "multiply"] as const)(
    "keeps visible overflow of an offscreen collapsed precomp (%s)",
    (blendMode) => {
      const doc = comp(
        [
          {
            id: "host",
            type: "precomp",
            comp: "inner",
            collapseTransforms: true,
            blendMode,
            transform: { anchor: [0, 0], position: [300, 50] },
          },
        ],
        {
          precomps: [
            {
              id: "inner",
              width: 40,
              height: 20,
              frameCount: 60,
              layers: [
                solid("child", {
                  transform: { anchor: [0, 0], position: [-250, 0] },
                }),
                solid("off", { transform: { position: [500, 0] } }),
              ],
            },
          ],
        },
      );
      const result = graph(doc);
      expect(result.culled).toEqual(["host/off"]);
      const host = result.root.ops[0]!;
      const child = (host.kind === "isolate" ? host.ops[0] : host) as DrawOp;
      expect(child.layer).toBe("host/child");
      expect(child.matrix).toEqual([1, 0, 0, 1, 50, 50]);
      const offscreenHost = doc.layers[0]!;
      if (offscreenHost.type === "precomp")
        offscreenHost.collapseTransforms = false;
      expect(graph(doc).root.ops).toEqual([]);
    },
  );

  it("renders uncollapsed precomps into their own surface", () => {
    const doc = comp(
      [{ id: "host", type: "precomp", comp: "inner", blendMode: "screen" }],
      {
        precomps: [
          {
            id: "inner",
            width: 40,
            height: 20,
            frameCount: 60,
            layers: [solid("child")],
          },
        ],
      },
    );
    expect(summary(graph(doc).root.ops)).toEqual([
      {
        isolate: "host",
        blend: "screen",
        ops: [{ draw: "host", content: "surface" }],
      },
    ]);
  });

  it("keeps disabled matte sources and drops mattes outside their in/out points", () => {
    const layers = (outPoint?: number): CompositionLayer[] => [
      solid("matte", {
        enabled: false,
        ...(outPoint !== undefined ? { outPoint } : {}),
      }),
      solid("target", { trackMatte: { layer: "matte", mode: "luma" } }),
    ];
    const [live] = graph(comp(layers())).root.ops as IsolateOp[];
    expect(summary(live!.matte!.ops)).toEqual([
      { draw: "matte", content: "solid" },
    ]);
    const [ended] = graph(comp(layers(1)), 2).root.ops as IsolateOp[];
    expect(ended!.matte).toEqual(
      expect.objectContaining({ mode: "luma", ops: [] }),
    );
  });

  it("evaluates disabled precomps that serve as track mattes", () => {
    const doc = comp(
      [
        { id: "matte", type: "precomp", comp: "inner", enabled: false },
        solid("target", { trackMatte: { layer: "matte", mode: "alpha" } }),
      ],
      {
        precomps: [
          {
            id: "inner",
            width: 40,
            height: 20,
            frameCount: 60,
            layers: [solid("child")],
          },
        ],
      },
    );
    const tree = evaluateComp(doc, 0);
    expect(tree.layers[0]!.visible).toBe(false);
    expect(tree.layers[0]!.precomp?.layers.map((l) => l.id)).toEqual(["child"]);
    const [target] = buildRenderGraph(doc, tree).root.ops as IsolateOp[];
    expect(summary(target!.matte!.ops)).toEqual([
      { draw: "matte", content: "surface" },
    ]);
  });

  it("chains mattes and ignores the matte source's blend mode", () => {
    const doc = comp([
      solid("outer"),
      solid("inner", {
        blendMode: "multiply",
        trackMatte: { layer: "outer", mode: "alpha" },
      }),
      solid("target", { trackMatte: { layer: "inner", mode: "alpha" } }),
    ]);
    const [target] = graph(doc).root.ops as IsolateOp[];
    expect(summary(target!.matte!.ops)).toEqual([
      {
        isolate: "inner",
        blend: "normal",
        ops: [{ draw: "inner", content: "solid" }],
        matte: "alpha",
        matteOps: [{ draw: "outer", content: "solid" }],
      },
    ]);
  });

  it("drops `none` masks and isolates masked layers", () => {
    const path = {
      closed: true,
      vertices: [
        [0, 0],
        [10, 0],
        [10, 10],
      ] as [number, number][],
    };
    const doc = comp([
      solid("plain", { masks: [{ id: "off", mode: "none", path }] }),
      solid("masked", { masks: [{ id: "cut", mode: "subtract", path }] }),
    ]);
    expect(summary(graph(doc).root.ops)).toEqual([
      {
        isolate: "masked",
        blend: "normal",
        ops: [{ draw: "masked", content: "solid" }],
        masks: ["cut"],
      },
      { draw: "plain", content: "solid" },
    ]);
  });

  it("clips descendants of clipping groups", () => {
    const doc = comp([
      solid("child", { parent: "frame", transform: { position: [0, 0] } }),
      {
        id: "frame",
        type: "group",
        size: [30, 20],
        clip: true,
        transform: { position: [60, 40] },
      },
    ]);
    const [op] = graph(doc).root.ops as DrawOp[];
    expect(op!.clips).toEqual([
      { matrix: [1, 0, 0, 1, 45, 30], width: 30, height: 20 },
    ]);
  });

  it("skips normal adjustment layers without effects and keeps blended ones", () => {
    const doc = comp([
      { id: "pass", type: "adjustment" },
      { id: "burn", type: "adjustment", blendMode: "color-burn" },
      solid("below"),
    ]);
    expect(summary(graph(doc).root.ops)).toEqual([
      { draw: "below", content: "solid" },
      { adjust: "burn", blend: "color-burn" },
    ]);
  });
});
