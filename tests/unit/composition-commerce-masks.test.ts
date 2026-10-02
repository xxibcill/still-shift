import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommerceSceneSchema } from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const fixture = (path: string) =>
  CommerceSceneSchema.parse(
    JSON.parse(readFileSync(`benchmarks/fixtures/${path}.json`, "utf8")),
  );

describe("CE4b root masks", () => {
  it.each([
    "ecommerce-motion/atoms/matte",
    "reusable-components/commerce-mask",
    "reusable-components/isolated-mask",
    "reusable-components/commerce-detail-sequence",
    "reusable-components/isolated-detail-sequence",
  ])("maps alpha coverage without changing evaluated state: %s", (path) => {
    const input = fixture(path);
    const original = structuredClone(input);
    const composition = commerceToComposition(input);
    const masks = [
      ...(input.mattes ?? []),
      ...(input.componentData && "masks" in input.componentData
        ? input.componentData.masks
        : []),
    ];
    for (const mask of masks)
      expect(
        composition.layers.find((layer) => layer.id === mask.target)
          ?.trackMatte,
      ).toEqual({
        layer: mask.mask,
        mode: mask.invert ? "alpha-inverted" : "alpha",
      });
    expect(input).toEqual(original);
    expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
    assertCompositionAdapterState(compileCommerceScene(input), composition);
  });

  it("preserves inverted alpha", () => {
    const input = fixture("ecommerce-motion/atoms/matte");
    input.mattes![0]!.invert = true;
    expect(
      commerceToComposition(input).layers.find(
        (layer) => layer.id === "product",
      )?.trackMatte,
    ).toEqual({ layer: "alpha-mask", mode: "alpha-inverted" });
  });
});
