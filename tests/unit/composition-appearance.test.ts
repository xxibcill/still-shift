import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  COMPOSITION_LIMITS,
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
import { MOTION_PATH_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/motion-path.ts";
import type { ProviderLayer } from "../../packages/renderer-core/src/composition/render/providers.ts";
import { RICH_TYPOGRAPHY_PROVIDER } from "../../packages/renderer-core/src/composition/adapters/numeric-typography.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { appearanceVariants } from "../helpers/composition-appearance.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

describe("CE4b compiled appearance", () => {
  it.each(["strokeWidth", "trimStart", "trimEnd", "trimOffset"])(
    "bounds %s while retaining finite overshoot",
    (channel) => {
      const limit = COMPOSITION_LIMITS.maxCoordinate;
      expect(
        AppearanceSchema.safeParse({ [channel]: [-limit, -2, 2, limit] })
          .success,
      ).toBe(true);
      for (const value of [-1e308, 1e308, -limit - 1, limit + 1])
        expect(AppearanceSchema.safeParse({ [channel]: [value] }).success).toBe(
          false,
        );
    },
  );

  it("rejects provider widths that overflow painted bounds", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/ecommerce-motion/atoms/path.json",
          "utf8",
        ),
      ),
    );
    const input = appearanceVariants("commerce/atom-path", source)[0]!.scene;
    const layer = commerceToComposition(input).layers.find(
      (layer) =>
        layer.type === "provider" && layer.provider === "component.path@1.1.0",
    ) as ProviderLayer;
    const provider = MOTION_PATH_PROVIDERS.find(
      (provider) => provider.id === layer.provider,
    )!;
    const appearance = layer.params.appearance as Record<string, number[]>;
    for (const width of [1e308, -1e308]) {
      appearance.strokeWidth = [width];
      expect(() =>
        provider.prepare(
          layer,
          { images: new Map(), fonts: new Map() },
          "layers[0]",
        ),
      ).toThrow();
      try {
        provider.prepare(
          layer,
          { images: new Map(), fonts: new Map() },
          "layers[0]",
        );
      } catch (error) {
        expect(passageDiagnostics(error)).toContainEqual(
          expect.objectContaining({
            code: "comp-provider-params",
            path: "layers[0].params",
          }),
        );
      }
    }
    appearance.strokeWidth = [COMPOSITION_LIMITS.maxCoordinate];
    const bounds = provider.prepare(
      layer,
      { images: new Map(), fonts: new Map() },
      "layers[0]",
    ).bounds!;
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
  });

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
