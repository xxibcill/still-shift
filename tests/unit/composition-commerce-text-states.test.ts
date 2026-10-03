import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  validateComposition,
  resolvePropertyPath,
  type Composition,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { commerceTextStateVariants } from "../helpers/composition-commerce-text-states.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";
import { nodeMatrix } from "../../packages/renderer-core/src/node-transform.ts";

const fixture = () =>
  CommerceSceneSchema.parse(
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/ecommerce-motion/atoms/text.json",
        "utf8",
      ),
    ),
  );

describe("CE4b text content states", () => {
  it("exposes provider state paths only after native state control is declared", () => {
    const input = native();
    expect(resolvePropertyPath(input, "provider.stateMix")).toMatchObject({
      type: "scalar",
    });
    const layer = input.layers[1]!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    delete layer.state;
    delete layer.stateFrom;
    delete layer.stateMix;
    expect(resolvePropertyPath(input, "provider.state")).toMatchObject({
      code: "comp-path-property",
    });
  });
  it("bakes both skew axes and compensated moving anchors under a clipped parent", () => {
    const input = commerceTextStateVariants("commerce/atom-text", fixture())[2]!
      .scene;
    const scene = compileCommerceScene(input),
      composition = commerceToComposition(input);
    assertCompositionAdapterState(scene, composition);
    const node = input.nodes.find((node) => node.type === "text")!;
    for (let frame = 0; frame < input.frameCount; frame++)
      expect(
        evaluateComp(composition, frame).layers.find(
          (layer) => layer.id === node.id,
        )!.localMatrix,
      ).toEqual(nodeMatrix(node, evaluatePreparedNode(scene, node, frame)));
  });

  const native = () =>
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/composition/ce4b/text-states.json",
        "utf8",
      ),
    ) as Composition;
  it.each(["text", "provider"])(
    "requires paired state-blend channels for %s",
    (type) => {
      const input = native();
      const layer = input.layers.find((layer) => layer.type === type)!;
      if (layer.type !== "text" && layer.type !== "provider")
        throw new Error("Expected text content");
      delete layer.stateFrom;
      const result = validateComposition(input);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "comp-state-mix" }),
        ]),
      );
    },
  );

  it("uses the outgoing and incoming native text bounds during a crossfade", () => {
    const input = native();
    const bounds = [
      { left: 0, top: 0, right: 40, bottom: 24 },
      { left: 8, top: 4, right: 25, bottom: 18 },
    ];
    const at = (time: number) =>
      evaluateComp(input, time, { textBounds: { native: bounds } }).layers.find(
        (layer) => layer.id === "native",
      )!.bounds;
    expect(at(0)).toEqual({ left: 10, top: 20, right: 50, bottom: 44 });
    expect(at(12)).toEqual(at(0));
    expect(at(24)).toEqual({ left: 18, top: 24, right: 35, bottom: 38 });
    const layer = input.layers[0]!;
    if (layer.type !== "text") throw new Error("Expected text");
    layer.stateFrom = 2;
    expect(validateComposition(input).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "comp-state-range" }),
      ]),
    );
  });
  it("preserves overlapping outgoing/incoming text states through JSON and backward seeks", () => {
    const input = fixture();
    input.motionModel = "curves-1";
    const node = input.nodes.find((node) => node.type === "text")!;
    if (node.type !== "text") throw new Error("Expected text");
    node.states = [node.text, "Second supplied caption"];
    input.componentData = {
      schemaVersion: "scene-components-2",
      values: [],
      bindings: [],
      annotations: [],
      travels: [],
      states: [
        {
          id: "caption-state",
          target: node.id,
          initial: 0,
          cuts: [
            { id: "second", frame: 12, state: 1, ramp: 3 },
            { id: "first", frame: 30, state: 0, ramp: 2 },
          ],
        },
      ],
    };
    const source = structuredClone(input);
    const composition = JSON.parse(
      JSON.stringify(commerceToComposition(input)),
    );
    const scene = compileCommerceScene(input);
    expect(
      composition.layers.find((layer: { id: string }) => layer.id === node.id),
    ).toMatchObject({ type: "provider", provider: "commerce.text@1.2.0" });
    for (let frame = input.frameCount - 1; frame >= 0; frame--) {
      const expected = evaluatePreparedNode(scene, node, frame);
      const actual = evaluateComp(composition, frame).layers.find(
        (layer) => layer.id === node.id,
      )!;
      expect(actual.state).toBe(expected.state);
      expect(actual.stateFrom).toBe(expected.stateFrom ?? expected.state);
      expect(actual.stateMix).toBe(expected.stateMix ?? 1);
    }
    expect(input).toEqual(source);
  });

  it("retains a container and legacy text animator as local content", () => {
    const input = fixture();
    input.motionModel = "curves-1";
    const node = input.nodes.find((node) => node.type === "text")!;
    if (node.type !== "text") throw new Error("Expected text");
    node.container = {
      kind: "caption",
      padding: 12,
      radius: 8,
      fill: "#ffffff",
      stroke: "#234567",
      strokeWidth: 2,
    };
    input.textAnimators = [
      {
        node: node.id,
        unit: "word",
        start: 0,
        end: 24,
        stagger: 2,
        selector: { start: 0, end: 1 },
        from: { opacity: 0, offset: [0, 12] },
      },
    ];
    const composition = commerceToComposition(input);
    expect(
      composition.layers.find((layer) => layer.id === node.id),
    ).toMatchObject({
      type: "provider",
      provider: "commerce.text@1.2.0",
      params: {
        node: { container: node.container },
        animator: { node: node.id },
      },
    });
  });
});
