import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  PreparedNodeSchema,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { prepareCommerceTextFits } from "../../packages/renderer-core/src/commerce-layout.ts";
import { evaluateComponentAnnotation } from "../../packages/renderer-core/src/component-annotations.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const layout = () =>
  CommerceSceneSchema.parse(
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/ecommerce-motion/atoms/layout.json",
        "utf8",
      ),
    ),
  );
function measurement() {
  return {
    font: "400 40px Test",
    measureText(text: string) {
      const size = Number(this.font.match(/([\d.]+)px/)![1]);
      const width = text.length * size * 0.5;
      return {
        width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
      };
    },
  } as CanvasRenderingContext2D;
}
const fonts = new Map([["commerce-font", { family: "Test", weight: "400" }]]);

describe("CE4b fitted panel compilation", () => {
  it("requires explicit pinned-font measurement before baking panel geometry", () => {
    expect.assertions(1);
    try {
      commerceToComposition(layout());
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-adapter-layout-required",
          path: "textFits[0].panel",
        }),
      );
    }
  });

  it.each([false, true])(
    "preserves measured geometry and precompiled event tracks (animated=%s)",
    (animated) => {
      const input = layout();
      const fit = input.textFits![0]!;
      const panel = input.nodes.find((node) => node.id === fit.panel)!;
      const text = input.nodes.find((node) => node.id === fit.target)!;
      panel.parent = text.parent = "layout-parent";
      input.nodes.push(
        PreparedNodeSchema.parse({
          id: "layout-parent",
          type: "group",
          width: 1080,
          height: 1350,
          x: 17,
          y: -11,
          rotation: 7,
          opacity: 0.7,
        }),
      );
      if (animated)
        input.events.push({
          node: panel.id,
          property: "y",
          start: 0,
          end: 239,
          to: panel.y + 70,
          easing: "linear",
        });
      const original = structuredClone(input);
      const expected = prepareCommerceTextFits(
        compileCommerceScene(input),
        measurement(),
        fonts,
      );
      const fitted = expected.nodes.find((node) => node.id === fit.panel)!;
      expect(fitted.height).toBeLessThan(panel.height);
      const composition = commerceToComposition(input, {
        textLayout: { context: measurement(), fonts },
      });
      const layer = composition.layers.find((layer) => layer.id === panel.id)!;
      expect(layer).toMatchObject({
        type: "provider",
        params: {
          node: {
            x: fitted.x,
            y: fitted.y,
            width: fitted.width,
            height: fitted.height,
          },
        },
      });
      const fittedText = expected.nodes.find((node) => node.id === fit.target)!;
      if (fittedText.type !== "text") throw new Error("Expected fitted text");
      expect(
        composition.layers.find((node) => node.id === fit.target),
      ).toMatchObject({
        params: {
          fit: { minSize: fittedText.fontSize, maxSize: fittedText.fontSize },
        },
      });
      assertCompositionAdapterState(expected, composition);
      expect(input).toEqual(original);
      expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
    },
  );

  it("bakes annotation anchors after panel fitting", () => {
    const input = layout();
    const panel = input.nodes.find(
      (node) => node.id === input.textFits![0]!.panel,
    )!;
    const path = PreparedNodeSchema.parse({
      id: "panel-leader",
      type: "path",
      points: [
        [0, 0],
        [1, 1],
      ],
      stroke: "#123456",
      lineWidth: 3,
    });
    input.nodes.push(path);
    input.componentData = {
      schemaVersion: "scene-components-1",
      values: [],
      bindings: [],
      annotations: [
        {
          path: path.id,
          points: [
            { node: panel.id, point: [0, 0], space: "node", offset: [0, 0] },
            {
              node: panel.id,
              point: [100, 30],
              space: "node",
              offset: [2, -3],
            },
          ],
          protect: [],
        },
      ],
    };
    const expected = prepareCommerceTextFits(
      compileCommerceScene(input),
      measurement(),
      fonts,
    );
    const composition = commerceToComposition(input, {
      textLayout: { context: measurement(), fonts },
    });
    const layer = composition.layers.find((layer) => layer.id === path.id)!;
    if (layer.type !== "provider" || path.type !== "path")
      throw new Error("Expected path");
    expect((layer.params.geometry as { points: unknown[] }).points[0]).toEqual(
      evaluateComponentAnnotation(expected, path, 0).points,
    );
  });

  it("rejects measurement without the declared font", () => {
    expect(() =>
      commerceToComposition(layout(), {
        textLayout: { context: measurement(), fonts: new Map() },
      }),
    ).toThrow(/loaded pinned font/);
  });
});
