import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "@still-shift/scene-contract";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { storyEffectVariants } from "../helpers/composition-story-effects.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

describe("shared story pixel effects", () => {
  it.each(["state", "leader"])(
    "retains %s root coordinates, masks and immutable source data",
    (name) => {
      const input = StorySceneSchema.parse(
        JSON.parse(
          readFileSync(
            `benchmarks/fixtures/reusable-components/story-${name}.json`,
            "utf8",
          ),
        ),
      );
      for (const item of storyEffectVariants(
        `component/story-${name}`,
        input,
      )) {
        const source = StorySceneSchema.parse(item.scene),
          before = structuredClone(source);
        const comp = storyToComposition(source);
        expect(source).toEqual(before);
        assertCompositionAdapterState(compileStoryScene(source), comp);
        if (name === "leader") {
          const path = comp.layers.find(
            (layer) => layer.id === "annotation__line",
          )!;
          const flow = comp.layers.find((layer) =>
            layer.id.startsWith("annotation__line-flow-"),
          )!;
          expect(path.parent).toBe(flow.parent);
          const owner = comp.layers.find((layer) => layer.id === path.parent)!;
          expect(owner.effects?.map((effect) => effect.effect)).toEqual([
            "blur.directional",
            "light.glow",
            "light.sweep",
          ]);
          expect(owner.effects!.at(-1)!.space).toBe(path.id);
          expect(path.cameraDepth).toBeUndefined();
          if (item.id.endsWith("inverted"))
            expect(owner.trackMatte?.mode).toBe("alpha-inverted");
        } else {
          const adjustment = comp.layers.find(
            (layer) => layer.type === "adjustment",
          );
          if (adjustment) expect(adjustment.cameraDepth).toBe(0);
          for (const layer of comp.layers.filter((layer) =>
            layer.parent?.startsWith("effectGroup"),
          )) {
            expect(layer.cameraDepth).toBeUndefined();
            expect(
              comp.layers.find((owner) => owner.id === layer.parent)!
                .cameraDepth,
            ).toBe(source.camera!.depth[layer.id] ?? 1);
          }
        }
      }
    },
  );
});
