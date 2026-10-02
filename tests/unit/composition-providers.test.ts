import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  prepareCompositionProviders,
  loadProviderFonts,
  preparedProvider,
} from "../../packages/renderer-core/src/composition/render/providers.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { STORY_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/story-providers.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [
    {
      id: "mark",
      type: "provider",
      provider: "test.mark@1.0.0",
      params: {},
      transform: { position: [500, 0] },
    },
  ],
});
describe("composition content providers", () => {
  it("retains both transition states and the source clock in prepared visual keys", () => {
    const comp = fixture();
    const layer = comp.layers[0]!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    const prepared = prepareCompositionProviders(
      comp,
      { images: new Map(), fonts: new Map() },
      [
        {
          id: layer.provider,
          prepare: () =>
            preparedProvider(() => {}, {
              visualKey: (time, state, sourceTime) =>
                JSON.stringify([Math.floor(time), state, sourceTime]),
              bounds: { left: -2, top: -3, right: 10, bottom: 20 },
            }),
        },
      ],
    );
    const content = {
      type: "provider" as const,
      key: "mark",
      layer,
      time: 1.1,
      state: 1,
      stateFrom: 0,
      sourceTime: 4,
    };
    expect(prepared.contentKey(content)).toBe(
      prepared.contentKey({ ...content, time: 1.2 }),
    );
    expect(prepared.contentKey(content)).not.toBe(
      prepared.contentKey({ ...content, stateFrom: 2 }),
    );
    expect(prepared.contentKey(content)).not.toBe(
      prepared.contentKey({ ...content, sourceTime: 5 }),
    );
    expect(prepared.contentBounds(content)).toEqual({
      left: -2,
      top: -3,
      right: 10,
      bottom: 20,
    });
    const unknown = prepareCompositionProviders(
      comp,
      { images: new Map(), fonts: new Map() },
      [{ id: layer.provider, prepare: () => () => {} }],
    );
    expect(unknown.contentKey(content)).toBeUndefined();
    expect(unknown.contentBounds(content)).toBeUndefined();
  });
  it("keeps asynchronously prepared font variants local to each provider and scope", async () => {
    const doc = fixture();
    const layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    layer.assets = ["allowed"];
    doc.precomps = [
      {
        id: "nested",
        frameCount: 24,
        width: 100,
        height: 100,
        layers: [structuredClone(layer)],
      },
    ];
    const fonts = new Map([
      ["allowed", { family: "Allowed", weight: "400" }],
      ["hidden", { family: "Hidden", weight: "400" }],
    ]);
    const seen: string[][] = [];
    const provider = {
      id: layer.provider,
      async loadFonts(_layer: unknown, local: typeof fonts) {
        seen.push([...local.keys()]);
        local.set("variant", { family: "Variant", weight: "600" });
      },
      prepare(
        _layer: unknown,
        resources: { fonts: ReadonlyMap<string, unknown> },
      ) {
        seen.push([...resources.fonts.keys()]);
        return () => {};
      },
    };
    const providerFonts = await loadProviderFonts(doc, fonts, [provider]);
    prepareCompositionProviders(
      doc,
      { images: new Map(), fonts, providerFonts },
      [provider],
    );
    expect(seen).toEqual([
      ["allowed"],
      ["allowed"],
      ["allowed", "variant"],
      ["allowed", "variant"],
    ]);
    expect([...fonts.keys()]).toEqual(["allowed", "hidden"]);
    expect(providerFonts.get("mark")).not.toBe(
      providerFonts.get("nested/mark"),
    );
  });
  it("requires a versioned provider id and bounds JSON payloads", () => {
    const doc = fixture();
    expect(validateComposition(doc).ok).toBe(true);
    const layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    layer.provider = "test.mark";
    expect(validateComposition(doc).ok).toBe(false);
    layer.provider = "test.mark@1.0.0";
    layer.params = { text: "x".repeat(65536) };
    expect(validateComposition(doc).diagnostics).toContainEqual(
      expect.objectContaining({ code: "comp-json-size" }),
    );
  });
  it("keeps unbounded content drawable and only culls declared conservative bounds", () => {
    const doc = fixture();
    expect(buildRenderGraph(doc, evaluateComp(doc, 0)).root.ops).toHaveLength(
      1,
    );
    const layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    layer.bounds = [0, 0, 10, 10];
    expect(buildRenderGraph(doc, evaluateComp(doc, 0)).culled).toEqual([
      "mark",
    ]);
  });
  it("reports an unknown provider before drawing, with its contract path", () => {
    try {
      prepareCompositionProviders(
        fixture(),
        { images: new Map(), fonts: new Map() },
        [],
      );
      throw new Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-provider-unavailable",
          path: "layers[0].provider",
        }),
      );
    }
  });
  it("validates provider asset references and bound ordering", () => {
    const doc = fixture(),
      layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    layer.assets = ["missing"];
    expect(validateComposition(doc).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "comp-asset-missing",
        path: "layers[0].assets[0]",
      }),
    );
    delete layer.assets;
    layer.bounds = [10, 0, 0, 10];
    expect(validateComposition(doc).diagnostics).toContainEqual(
      expect.objectContaining({ code: "comp-provider-bounds" }),
    );
  });
  it("prepares a provider once with only its declared resource dependencies", () => {
    const doc = fixture(),
      layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    layer.assets = ["allowed"];
    const prepared: string[][] = [],
      times: number[] = [];
    const draw = prepareCompositionProviders(
      doc,
      {
        images: new Map([
          ["allowed", {} as CanvasImageSource],
          ["hidden", {} as CanvasImageSource],
        ]),
        fonts: new Map(),
      },
      [
        {
          id: layer.provider,
          prepare(_layer, resources) {
            prepared.push([...resources.images.keys()]);
            return (_ctx, time) => {
              times.push(time);
            };
          },
        },
      ],
    );
    const ctx = {} as CanvasRenderingContext2D;
    draw(ctx, { type: "provider", key: "mark", layer, time: 12 });
    draw(ctx, { type: "provider", key: "mark", layer, time: 3.5 });
    expect(prepared).toEqual([["allowed"]]);
    expect(times).toEqual([12, 3.5]);
  });
  it("retains provider clocks inside reused precomps and supports isolation", () => {
    const doc = fixture();
    const layer = doc.layers[0]!;
    layer.transform = { position: [0, 0] };
    const precomp = {
      id: "source",
      width: 100,
      height: 100,
      frameCount: 24,
      layers: [layer],
    };
    doc.precomps = [precomp];
    doc.layers = [
      { id: "slow", type: "precomp", comp: "source", stretch: 2 },
      {
        id: "later",
        type: "precomp",
        comp: "source",
        startFrame: 2,
        collapseTransforms: true,
      },
    ];
    const tree = evaluateComp(doc, 8);
    expect(tree.layers.map((state) => state.precomp!.layers[0]!.time)).toEqual([
      4, 6,
    ]);
    layer.blendMode = "multiply";
    const changed = structuredClone(doc);
    const graph = buildRenderGraph(changed, evaluateComp(changed, 8));
    expect(graph.root.ops[0]).toMatchObject({
      kind: "isolate",
      layer: "later/mark",
      ops: [{ content: { type: "provider", key: "source/mark", time: 6 } }],
    });
  });
  it("reports duplicate registrations and invalid built-in payloads", () => {
    const doc = fixture(),
      layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    const resources = { images: new Map(), fonts: new Map() };
    const definition = { id: layer.provider, prepare: () => () => {} };
    expect(() =>
      prepareCompositionProviders(doc, resources, [definition, definition]),
    ).toThrow("registered twice");
    layer.provider = "story.path@1.0.0";
    try {
      prepareCompositionProviders(doc, resources, STORY_CONTENT_PROVIDERS);
      throw new Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-provider-params",
          path: "layers[0].params",
        }),
      );
    }
  });
  it("warns when a provider declares generic fonts", () => {
    const doc = fixture(),
      layer = doc.layers[0]!;
    if (layer.type !== "provider") throw new Error("provider required");
    layer.usesSystemFonts = true;
    expect(validateComposition(doc).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "comp-text-system-font",
        severity: "warning",
        path: "layers[0].usesSystemFonts",
      }),
    );
  });
});
