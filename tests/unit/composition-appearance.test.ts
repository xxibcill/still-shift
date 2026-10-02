import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  CommerceSceneSchema,
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { evaluateMotionAppearance } from "../../packages/renderer-core/src/motion-appearance.ts";
import {
  AppearanceSchema,
  appearanceAt,
  paintNode,
} from "../../packages/renderer-core/src/composition/adapters/appearance.ts";
import { RICH_TYPOGRAPHY_PROVIDER } from "../../packages/renderer-core/src/composition/adapters/numeric-typography.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { appearanceVariants } from "../helpers/composition-appearance.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

describe("CE4b compiled appearance", () => {
  it.each([
    ["commerce/atom-path", "ecommerce-motion/atoms/path.json"],
    ["commerce/atom-panel", "ecommerce-motion/atoms/panel.json"],
    ["component/story-leader", "reusable-components/story-leader.json"],
    ["component/story-state", "reusable-components/story-state.json"],
    ["typography/editorial", "typography/editorial.json"],
  ])(
    "preserves %s paint, stroke and trim samples in reverse order",
    (id, file) => {
      const json = JSON.parse(
        readFileSync(`benchmarks/fixtures/${file}`, "utf8"),
      );
      const source =
        json.schemaVersion === "commerce-scene-1"
          ? CommerceSceneSchema.parse(json)
          : StorySceneSchema.parse(json);
      for (const { scene: input } of appearanceVariants(id!, source)) {
        const before = structuredClone(input);
        const composition =
          input.schemaVersion === "commerce-scene-1"
            ? commerceToComposition(input)
            : storyToComposition(input);
        const scene =
          input.schemaVersion === "commerce-scene-1"
            ? compileCommerceScene(input)
            : compileStoryScene(input);
        expect(input).toEqual(before);
        expect(validateComposition(composition).ok).toBe(true);
        assertCompositionAdapterState(scene, composition);
        let painted = 0;
        for (const layer of composition.layers) {
          if (layer.type !== "provider" || !layer.params.appearance) continue;
          painted++;
          const node = scene.nodes.find((node) => node.id === layer.id)!;
          const appearance = AppearanceSchema.parse(layer.params.appearance);
          for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
            const expected = evaluateMotionAppearance(scene, node, frame);
            const actual = paintNode(node, appearance, frame);
            const state = evaluatePreparedNode(scene, node, frame);
            for (const key of ["fill", "stroke", "color"] as const)
              if (key in node)
                expect(
                  (actual as unknown as Record<string, unknown>)[key],
                ).toBe((expected as unknown as Record<string, unknown>)[key]);
            if (state.strokeWidth !== undefined && "lineWidth" in actual)
              expect(actual.lineWidth).toBe(state.strokeWidth);
            const sample = appearanceAt(appearance, frame);
            if (node.type === "path")
              for (const key of ["trimStart", "trimEnd", "trimOffset"] as const)
                expect(sample[key]).toBe(state[key]);
          }
          if (layer.provider === RICH_TYPOGRAPHY_PROVIDER.id) {
            const broken = structuredClone(layer);
            broken.state = 99;
            try {
              RICH_TYPOGRAPHY_PROVIDER.prepare(
                broken,
                { images: new Map(), fonts: new Map() },
                "layers[0]",
              );
              throw new Error("Expected state validation");
            } catch (error) {
              expect(passageDiagnostics(error)).toContainEqual(
                expect.objectContaining({
                  code: "comp-provider-params",
                  path: "layers[0].state",
                }),
              );
            }
          }
        }
        expect(painted).toBeGreaterThan(0);
      }
    },
  );

  it("bakes height-shadow motion instead of requiring a pixel effect", () => {
    const input = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/ecommerce-motion/atoms/height-shadow.json",
          "utf8",
        ),
      ),
    );
    const composition = commerceToComposition(input);
    expect(validateComposition(composition).ok).toBe(true);
    assertCompositionAdapterState(compileCommerceScene(input), composition);
    expect(composition.layers.every((layer) => !layer.effects?.length)).toBe(
      true,
    );
  });
});
