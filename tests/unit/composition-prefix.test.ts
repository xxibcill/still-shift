import { describe, expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  buildRenderGraph,
  type SurfaceNode,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { renderBatches } from "../../packages/renderer-core/src/composition/render/batches.ts";
import {
  compositionPrefixLayers,
  compositionRootPrefix,
} from "../../packages/renderer-core/src/composition/render/prefix.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";

const doc = (
  layers: CompositionLayer[],
  extra: Partial<Composition> = {},
): Composition => ({
  schemaVersion: "composition-1",
  id: "prefix",
  width: 32,
  height: 24,
  fps: 60,
  frameCount: 8,
  background: null,
  assets: [],
  layers,
  ...extra,
});
const fixed = (id: string): CompositionLayer => ({
  id,
  type: "solid",
  size: [9, 11],
  color: "#3377bb80",
});
const moving: CompositionLayer = {
  ...fixed("moving"),
  transform: {
    position: {
      keys: [
        { frame: 0, value: [1, 2] },
        { frame: 7, value: [10, 12] },
      ],
    },
  },
};
const root = (composition: Composition): SurfaceNode =>
  buildRenderGraph(composition, evaluateComp(composition, 0)).root;
const backend = (kind: "vectors" | "solids" | "single") =>
  ({
    ...(kind === "vectors"
      ? { drawVectors: () => {}, fillRects: () => {} }
      : {}),
    ...(kind === "solids" ? { fillRects: () => {} } : {}),
  }) as Pick<RenderBackend<Surface>, "drawVectors" | "fillRects">;

describe("closed native prefixes", () => {
  it("keeps vector precedence and every member of a maximal native batch", () => {
    const composition = doc([moving, fixed("floor")]),
      node = root(composition);
    expect(
      [...renderBatches(backend("vectors"), node.ops)].map(
        ({ kind, start, end }) => ({ kind, start, end }),
      ),
    ).toEqual([{ kind: "vectors", start: 0, end: 2 }]);
    expect(
      compositionRootPrefix(
        backend("vectors"),
        node,
        compositionPrefixLayers(composition),
      ),
    ).toBeUndefined();
  });
  it("does not split a Canvas solid batch at an animated member", () => {
    const composition = doc([moving, fixed("floor")]),
      node = root(composition);
    expect(
      [...renderBatches(backend("solids"), node.ops)].map(({ kind, end }) => ({
        kind,
        end,
      })),
    ).toEqual([{ kind: "solids", end: 2 }]);
    expect(
      compositionRootPrefix(
        backend("solids"),
        node,
        compositionPrefixLayers(composition),
      ),
    ).toBeUndefined();
  });
  it("can resume single original draws or linear draws after a fixed prefix", () => {
    for (const colorSpace of ["srgb", "linear-srgb"] as const) {
      const composition = doc([moving, fixed("floor")], { colorSpace }),
        node = root(composition);
      const target = backend(
        colorSpace === "linear-srgb" ? "vectors" : "single",
      );
      expect(
        compositionRootPrefix(
          target,
          node,
          compositionPrefixLayers(composition),
        )?.ops.map((op) => op.layer),
      ).toEqual(["floor"]);
    }
  });
  it("requires the complete upstream closure and rejects a static layer above motion", () => {
    const composition = doc([fixed("top"), moving]),
      node = root(composition);
    expect(
      compositionRootPrefix(
        backend("single"),
        node,
        compositionPrefixLayers(composition),
      ),
    ).toBeUndefined();
  });
  it("lets full roots handle a completely fixed graph", () => {
    const composition = doc([fixed("top"), fixed("floor")]),
      node = root(composition);
    expect(
      compositionRootPrefix(
        backend("single"),
        node,
        compositionPrefixLayers(composition),
      ),
    ).toBeUndefined();
  });
  it("recognizes constant keyed values but retains explicit tangent dependencies", () => {
    const layer = {
      ...fixed("floor"),
      transform: {
        position: {
          keys: [
            { frame: 0, value: [2, 3] },
            { frame: 7, value: [2, 3] },
          ],
        },
      },
    } as CompositionLayer;
    expect([...compositionPrefixLayers(doc([moving, layer]))]).toEqual([
      "floor",
    ]);
    const handled = {
      ...fixed("floor"),
      transform: {
        position: {
          keys: [
            { frame: 0, value: [2, 3], spatialOut: [3, 2] },
            { frame: 7, value: [2, 3] },
          ],
        },
      },
    } as CompositionLayer;
    expect([...compositionPrefixLayers(doc([moving, handled]))]).toEqual([]);
  });
  it("rejects keyed ancestors even when a child has fixed artwork", () => {
    const composition = doc([{ ...fixed("child"), parent: "moving" }, moving]);
    expect([...compositionPrefixLayers(composition)]).toEqual([]);
  });
  it("keeps selection hints with drivers while evaluated closure keys authorize reuse", () => {
    for (const extra of [
      { expressions: { "layers.floor.transform.opacity": { source: "time" } } },
      { camera2d: { position: { keys: [{ frame: 0, value: [0, 0] }] } } },
      {
        constraints: [
          {
            type: "lookAt",
            id: "constraint",
            layer: "floor",
            target: "target",
          },
        ],
      },
      { textAnimators: [{ node: "text", start: 0, end: 8 }] },
    ]) {
      const composition = doc([fixed("floor")], extra as Partial<Composition>);
      expect([...compositionPrefixLayers(composition)]).toEqual(["floor"]);
    }
  });
  it("preserves a one-item solid's original draw and an isolate boundary", () => {
    const composition = doc([
        {
          ...moving,
          effects: [
            { id: "blur", effect: "blur.gaussian", params: { radius: 2 } },
          ],
        },
        fixed("floor"),
      ]),
      node = root(composition);
    expect(
      [...renderBatches(backend("solids"), node.ops)].map(
        ({ kind, start, end }) => ({ kind, start, end }),
      ),
    ).toEqual([
      { kind: "single", start: 0, end: 1 },
      { kind: "single", start: 1, end: 2 },
    ]);
    expect(
      compositionRootPrefix(
        backend("solids"),
        node,
        compositionPrefixLayers(composition),
      )?.ops.map((op) => op.layer),
    ).toEqual(["floor"]);
  });
});
