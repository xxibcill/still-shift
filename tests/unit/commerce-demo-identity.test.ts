import { describe, expect, it } from "vitest";
import matteFixture from "../../benchmarks/fixtures/ecommerce-motion/atoms/matte.json" with { type: "json" };
import {
  CommerceAnimationResultSchema,
  CommerceSceneSchema,
} from "../../packages/scene-contract/src/commerce.ts";
import { defaultComponentDemo } from "../../packages/scene-contract/src/commerce-components.ts";
import { buildCommerceComponentDemo } from "../../packages/renderer-core/src/commerce-component-demos.ts";

const fixture = CommerceSceneSchema.parse(matteFixture);
const assets = {
  product: fixture.assets.find((asset) => asset.id === "product-image")!,
  font: fixture.fonts[0]!,
  shadow: fixture.assets.find((asset) => asset.id === "product-shadow-image")!,
};

describe("commerce component demo identity", () => {
  it("records the actual atomic, effect and spatial treatment", () => {
    for (const kind of [
      "product",
      "effects-studio",
      "matte",
      "sequence",
    ] as const) {
      const scene = buildCommerceComponentDemo(
        defaultComponentDemo(kind),
        assets,
      );
      expect(scene.recipe.preset).toBe(kind);
      expect(scene.metadata.selection).toEqual({
        kind: "component-demo",
        id: kind,
      });
      expect(scene.metadata.registration).toEqual({ status: "experimental" });
      expect(() =>
        CommerceSceneSchema.parse({ ...scene, recipe: { preset: "H03" } }),
      ).toThrow(/demo preset/);
    }
  });

  it("accepts the demo identity in a commerce export result", () => {
    const hash = fixture.assets[0]!.sha256;
    expect(
      CommerceAnimationResultSchema.parse({
        schemaVersion: "commerce-result-1",
        status: "rendered",
        preset: "matte",
        fps: 30,
        durationMs: 8000,
        frameCount: 240,
        outputPath: "matte.mp4",
        sceneManifestPath: "matte.mp4.scene.json",
        checksums: { source: hash, scene: hash, output: hash },
        metrics: {
          frameCount: 240,
          durationMs: 8000,
          width: 1080,
          height: 1350,
          totalWallMs: 0,
        },
      }).preset,
    ).toBe("matte");
  });
});
