import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  nodeMatrix,
  multiplyMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";
import { COMMERCE_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/commerce-providers.ts";

const fixture = (name: string) =>
  CommerceSceneSchema.parse(
    JSON.parse(
      readFileSync(`benchmarks/fixtures/ecommerce-motion/${name}.json`, "utf8"),
    ),
  );

describe("CE4b commerce adapter first slice", () => {
  it("preserves assets, metadata, measured text and serializable composition data", () => {
    const input = fixture("h01-landscape");
    const original = structuredClone(input);
    const composition = commerceToComposition(input, { id: "hero" });
    expect(composition.id).toBe("hero");
    expect(validateComposition(composition).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
    expect(input).toEqual(original);
    expect(composition.metadata?.commerce).toEqual(input.metadata);
    expect(composition.assets).toHaveLength(
      input.assets.length + input.fonts.length,
    );
    expect(
      composition.layers.find((l) => l.id === "product-name"),
    ).toMatchObject({ type: "provider", provider: "commerce.text@1.0.0" });
  });

  it.each([
    "instances",
    "layout",
    "pin",
    "sequence",
    "stagger",
    "state",
    "transform",
    "travel",
    "visibility",
  ])("preserves reusable component state and motion: %s", (name) => {
    const input = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          `benchmarks/fixtures/reusable-components/commerce-${name}.json`,
          "utf8",
        ),
      ),
    );
    assertCompositionAdapterState(
      compileCommerceScene(input),
      commerceToComposition(input),
    );
  });

  it.each([
    "h01-landscape",
    "atoms/detail",
    "atoms/drift",
    "atoms/parallax",
    "atoms/overshoot",
    "atoms/path",
    "atoms/shadow",
  ])(
    "preserves every integer-frame matrix and opacity for %s, including reverse seeks",
    (name) => {
      const input = fixture(name);
      const scene = compileCommerceScene(input);
      const composition = commerceToComposition(input);
      for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
        const actual = new Map(
          evaluateComp(composition, frame).layers.map((l) => [l.id, l]),
        );
        const expected = new Map<string, { matrix: Matrix; opacity: number }>();
        const visit = (id: string): { matrix: Matrix; opacity: number } => {
          const cached = expected.get(id);
          if (cached) return cached;
          const node = scene.nodes.find((n) => n.id === id)!;
          const state = evaluatePreparedNode(scene, node, frame);
          const parent = node.parent ? visit(node.parent) : undefined;
          const result = {
            matrix: multiplyMatrix(
              parent?.matrix ?? [1, 0, 0, 1, 0, 0],
              nodeMatrix(node, state),
            ),
            opacity: (parent?.opacity ?? 1) * state.opacity,
          };
          result.matrix.forEach((value, i) =>
            expect(actual.get(id)!.screenMatrix[i]).toBeCloseTo(value, 8),
          );
          expect(actual.get(id)!.opacity).toBeCloseTo(result.opacity, 10);
          expected.set(id, result);
          return result;
        };
        scene.nodes.forEach((n) => visit(n.id));
      }
    },
  );

  it.each([
    ["atoms/glow", "effects[0]"],
    ["atoms/motion-blur", "effects[0]"],
    ["atoms/attachment", "attachments"],
    ["atoms/layout", "textFits"],
    ["atoms/matte", "mattes"],
  ])("rejects unsupported %s with a source path", (name, path) => {
    expect.assertions(1);
    try {
      commerceToComposition(fixture(name!));
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({ code: "comp-adapter-unsupported", path }),
      );
    }
  });

  it("rejects oversized baking before allocating frame samples", () => {
    const input = fixture("atoms/float");
    input.frameCount = 2001;
    expect(() => commerceToComposition(input)).toThrow(/2000 frames/);
  });

  it.each(["payload", "font"])(
    "rejects invalid measured-text provider %s before rendering",
    (kind) => {
      const composition = commerceToComposition(fixture("h01-landscape"));
      const layer = composition.layers.find(
        (layer) =>
          layer.type === "provider" && layer.provider === "commerce.text@1.0.0",
      )!;
      if (layer.type !== "provider") throw new Error("expected text provider");
      if (kind === "payload") layer.params = {};
      expect.assertions(1);
      try {
        COMMERCE_CONTENT_PROVIDERS[0]!.prepare(
          layer,
          { fonts: new Map(), images: new Map() },
          "layers[0]",
        );
      } catch (error) {
        expect(passageDiagnostics(error)).toContainEqual(
          expect.objectContaining({
            code:
              kind === "payload"
                ? "comp-provider-params"
                : "comp-provider-asset",
            path: kind === "payload" ? "layers[0].params" : "layers[0].assets",
          }),
        );
      }
    },
  );

  it.each(["native", "component"])(
    "maps %s visibility to exclusive layer in/out points",
    (kind) => {
      const input = fixture("atoms/float");
      if (kind === "native")
        input.visibility = [{ target: "product", start: 20, end: 30 }];
      else
        input.componentData = {
          schemaVersion: "scene-components-3",
          annotations: [],
          values: [],
          bindings: [],
          states: [],
          travels: [],
          pins: [],
          masks: [],
          textFits: [],
          visibility: [
            { id: "gate", target: "product", window: { start: 20, end: 30 } },
          ],
        };
      const composition = commerceToComposition(input);
      expect(composition.layers.find((l) => l.id === "product")).toMatchObject({
        inPoint: 20,
        outPoint: 30,
      });
      for (const frame of [19, 20, 29, 30]) {
        const tree = evaluateComp(composition, frame);
        expect(tree.layers.find((l) => l.id === "product")!.visible).toBe(
          frame >= 20 && frame < 30,
        );
        expect(tree.layers.find((l) => l.id === "product-art")!.visible).toBe(
          frame >= 20 && frame < 30,
        );
      }
    },
  );
});
