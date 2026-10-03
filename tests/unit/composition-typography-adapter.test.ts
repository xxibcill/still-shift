import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";
import {
  numericTypographyVariants,
  typographyVariants,
} from "../helpers/composition-typography.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  NumericTypographyParamsSchema,
  NUMERIC_TYPOGRAPHY_PROVIDER,
} from "../../packages/renderer-core/src/composition/adapters/numeric-typography.ts";
import { componentText } from "../../packages/renderer-core/src/component-values.ts";

const names = [
  "commerce",
  "editorial",
  "variable-thai",
  "transitions",
  "selectors",
  "semantic",
  "vertical",
  "glyph-performance",
];
describe("CE4b typography content", () => {
  it.each(["commerce", "editorial", "variable-thai"])(
    "keeps %s formatted values and rich animation in a portable local provider",
    (name) => {
      const json = JSON.parse(
        readFileSync(`benchmarks/fixtures/typography/${name}.json`, "utf8"),
      );
      const source =
        json.schemaVersion === "commerce-scene-1"
          ? CommerceSceneSchema.parse(json)
          : StorySceneSchema.parse(json);
      const input = numericTypographyVariants(source)[0]!.scene;
      const before = structuredClone(input);
      const scene =
        input.schemaVersion === "commerce-scene-1"
          ? compileCommerceScene(input)
          : compileStoryScene(input);
      const composition =
        input.schemaVersion === "commerce-scene-1"
          ? commerceToComposition(input)
          : storyToComposition(input);
      expect(validateComposition(composition).ok).toBe(true);
      expect(input).toEqual(before);
      const layer = composition.layers.find(
        (layer) =>
          layer.type === "provider" &&
          layer.provider === NUMERIC_TYPOGRAPHY_PROVIDER.id,
      )!;
      if (layer.type !== "provider") throw new Error("Expected provider");
      const data = NumericTypographyParamsSchema.parse(layer.params);
      const node = scene.nodes.find((node) => node.id === layer.id)!;
      for (let frame = scene.frameCount - 1; frame >= 0; frame--)
        expect(
          data.numeric.samples[
            Math.min(frame, data.numeric.samples.length - 1)
          ],
        ).toBe(componentText(scene, node, frame));
      expect(composition.textAnimators?.some((a) => a.node === layer.id)).toBe(
        false,
      );
      expect(data.textAnimators.some((a) => a.node === layer.id)).toBe(true);
      expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
      try {
        NUMERIC_TYPOGRAPHY_PROVIDER.prepare(
          layer,
          { images: new Map(), fonts: new Map() },
          "layers[0]",
        );
        throw new Error("Expected missing declared font");
      } catch (error) {
        expect(passageDiagnostics(error)).toContainEqual(
          expect.objectContaining({
            code: "comp-provider-asset",
            path: "layers[0].assets",
          }),
        );
      }
    },
  );
  it("requires pinned measurement for rich fits before emitting native geometry", () => {
    const source = CommerceSceneSchema.parse(
      JSON.parse(
        readFileSync("benchmarks/fixtures/typography/commerce.json", "utf8"),
      ),
    );
    for (const { scene } of typographyVariants(source)) {
      if (scene.schemaVersion !== "commerce-scene-1")
        throw new Error("Expected commerce");
      try {
        commerceToComposition(scene);
        throw new Error("Expected layout diagnostic");
      } catch (error) {
        expect(passageDiagnostics(error)).toContainEqual(
          expect.objectContaining({
            code: "comp-adapter-layout-required",
          }),
        );
      }
    }
  });

  it("validates correction spans, positive windows and pinned fonts", () => {
    const fixture = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/composition/ce4b/typography.json",
        "utf8",
      ),
    );
    expect(validateComposition(fixture).ok).toBe(true);
    const cases = [
      [{ span: "missing" }, "comp-text-span-missing"],
      [{ end: 10 }, "comp-schema-range"],
      [{ replacement: "" }, "comp-limit"],
    ] as const;
    for (const [patch, code] of cases) {
      const doc = structuredClone(fixture);
      Object.assign(doc.layers[0].corrections[0], patch);
      expect(validateComposition(doc).diagnostics).toContainEqual(
        expect.objectContaining({ code }),
      );
    }
    delete fixture.layers[0].fontAsset;
    expect(validateComposition(fixture).diagnostics).toContainEqual(
      expect.objectContaining({ code: "comp-text-pinned-font" }),
    );
  });
  it.each(names)(
    "compiles %s to native text with immutable, portable content",
    (name) => {
      const json = JSON.parse(
        readFileSync(`benchmarks/fixtures/typography/${name}.json`, "utf8"),
      );
      const source =
        json.schemaVersion === "commerce-scene-1"
          ? CommerceSceneSchema.parse(json)
          : StorySceneSchema.parse(json);
      const before = structuredClone(source);
      const composition =
        source.schemaVersion === "commerce-scene-1"
          ? commerceToComposition(source)
          : storyToComposition(source);
      const scene =
        source.schemaVersion === "commerce-scene-1"
          ? compileCommerceScene(source)
          : compileStoryScene(source);
      expect(validateComposition(composition).ok).toBe(true);
      expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
      expect(source).toEqual(before);
      expect(composition.textStyles).toEqual(scene.textStyles);
      for (const node of scene.nodes.filter((node) => node.type === "text"))
        expect(
          composition.layers.find((layer) => layer.id === node.id)?.type,
        ).toBe("text");
      assertCompositionAdapterState(scene, composition);
    },
  );
});
