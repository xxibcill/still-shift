import { expect, it } from "vitest";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { prepareGraphSources } from "../../packages/renderer-core/src/composition/render/source-preparation.ts";
import type { Composition } from "@still-shift/scene-contract";

const composition: Composition = {
  schemaVersion: "composition-1",
  id: "main",
  width: 64,
  height: 64,
  fps: 60,
  frameCount: 8,
  background: null,
  assets: [],
  layers: [
    { id: "inside", type: "precomp", comp: "nested" },
    { id: "matte", type: "text", text: "mask", fontSize: 18, color: "#ffffff" },
    {
      id: "effect",
      type: "text",
      text: "blur",
      fontSize: 18,
      color: "#ffffff",
      effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 1 } }],
      trackMatte: { layer: "matte", mode: "alpha" },
    },
  ],
  precomps: [
    {
      id: "nested",
      width: 64,
      height: 64,
      fps: 60,
      frameCount: 8,
      layers: [
        {
          id: "caption",
          type: "text",
          text: "nested",
          fontSize: 18,
          color: "#ffffff",
        },
        {
          id: "provider",
          type: "provider",
          provider: "test@1.0.0",
          params: {},
          bounds: [0, 0, 10, 10],
        },
      ],
    },
  ],
};
it("prepares evaluated text and provider sources through original nested/effect/matte graphs", () => {
  const graph = buildRenderGraph(composition, evaluateComp(composition, 3));
  const texts: string[] = [],
    providers: string[] = [];
  prepareGraphSources(
    graph,
    (content) => texts.push(content.key),
    (content) => providers.push(content.key),
  );
  expect(new Set(texts)).toEqual(
    new Set(["nested/caption", "effect", "matte"]),
  );
  expect(providers).toEqual(["nested/provider"]);
});
it("preserves an original non-Error preparation failure", () => {
  const graph = buildRenderGraph(composition, evaluateComp(composition, 0));
  let caught: unknown = "not thrown";
  try {
    prepareGraphSources(
      graph,
      () => {
        throw null;
      },
      () => {},
    );
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(null);
});

it("rejects a recursive surface source before any parent lease can be requested", () => {
  const graph = buildRenderGraph(composition, evaluateComp(composition, 0));
  const first = graph.root.ops.find(
    (op) => op.kind === "draw" && op.content.type === "surface",
  )!;
  if (first.kind !== "draw" || first.content.type !== "surface")
    throw Error("Expected nested surface fixture");
  first.content.surface.ops = graph.root.ops;
  expect(() =>
    prepareGraphSources(
      graph,
      () => {},
      () => {},
    ),
  ).toThrow("source operation dependency cycle");
});
