import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { parsePassageTemplate } from "../../packages/renderer-core/src/story-template.ts";
import { parsePassagePlan } from "../../packages/scene-contract/src/story-authoring.ts";
import { storyComponentVariants } from "../helpers/composition-story-components.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const read = (name: string) =>
  JSON.parse(
    readFileSync(`benchmarks/fixtures/reusable-components/${name}`, "utf8"),
  );
const names = [
  "bracket",
  "detail-sequence",
  "instances",
  "layout",
  "leader",
  "mask",
  "outline",
  "pin",
  "sequence",
  "stagger",
  "state",
  "supply-sequence",
  "supply",
  "text-fit",
  "tour",
  "transform",
  "travel",
  "underline",
  "value",
  "visibility",
];

describe("CE4b components in story contexts", () => {
  it.each(names)(
    "compiles %s with immutable input and every reverse-frame state preserved",
    (name) => {
      const input = StorySceneSchema.parse(read(`story-${name}.json`));
      const source = structuredClone(input);
      for (const variant of storyComponentVariants(
        `component/story-${name}`,
        input,
      )) {
        const variantScene = StorySceneSchema.parse(variant.scene);
        assertCompositionAdapterState(
          compileStoryScene(variantScene),
          storyToComposition(variantScene),
        );
      }
      const composition = storyToComposition(input);
      expect(validateComposition(composition).ok).toBe(true);
      expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
      assertCompositionAdapterState(compileStoryScene(input), composition);
      expect(input).toEqual(source);
    },
  );

  it.each(["components", "behaviors", "timing"])(
    "compiles every resolved %s passage beat after parameter and cue binding",
    (name) => {
      const plan = parsePassagePlan(read(`story-${name}.passage.json`));
      const templates = new Map(
        plan.beats.map((beat) => [
          beat.template,
          parsePassageTemplate(read(beat.template)),
        ]),
      );
      const passage = compileStoryPassage(plan, templates, {
        validateSafeZones: false,
      });
      for (const beat of passage.beats) {
        const composition = storyToComposition(beat.scene);
        expect(composition.frameCount).toBe(beat.scene.frameCount);
        assertCompositionAdapterState(
          compileStoryScene(beat.scene),
          composition,
        );
      }
    },
  );
});
