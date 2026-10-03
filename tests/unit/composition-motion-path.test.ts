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
import { evaluateMotionAppearance } from "../../packages/renderer-core/src/motion-appearance.ts";
import {
  MotionPathParamsSchema,
  motionPathBounds,
  sampleCompositionMotionPath,
  MOTION_PATH_PROVIDERS,
} from "../../packages/renderer-core/src/composition/adapters/motion-path.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { motionPathVariants } from "../helpers/composition-motion-path.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const inputs = [
  ["commerce/atom-path", "ecommerce-motion/atoms/path.json"],
  ["component/story-leader", "reusable-components/story-leader.json"],
] as const;

describe("CE4b compiled motion paths", () => {
  it.each(inputs)(
    "preserves %s geometry, follower matrices and portable authored keys",
    (id, file) => {
      const json = JSON.parse(
        readFileSync(`benchmarks/fixtures/${file}`, "utf8"),
      );
      const source =
        json.schemaVersion === "commerce-scene-1"
          ? CommerceSceneSchema.parse(json)
          : StorySceneSchema.parse(json);
      for (const { scene: input } of motionPathVariants(id, source)) {
        const before = structuredClone(input);
        const composition =
          input.schemaVersion === "commerce-scene-1"
            ? commerceToComposition(input)
            : storyToComposition(input);
        const scene =
          input.schemaVersion === "commerce-scene-1"
            ? compileCommerceScene(input)
            : compileStoryScene(input);
        expect(validateComposition(composition).ok).toBe(true);
        expect(input).toEqual(before);
        expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
        assertCompositionAdapterState(scene, composition);
        const layer = composition.layers.find(
          (layer) =>
            layer.type === "provider" &&
            layer.provider === "component.path@1.0.0",
        )!;
        if (layer.type !== "provider") throw new Error("Expected path");
        const data = MotionPathParamsSchema.parse(layer.params);
        const bounds = motionPathBounds(data, 27)!;
        expect(bounds).toBeDefined();
        for (let time = 0; time < scene.frameCount; time += 0.25) {
          expect(
            sampleCompositionMotionPath(
              data,
              time,
              Math.floor(time),
            ).points.every(
              ([x, y]) =>
                x >= bounds.left + 27 &&
                x <= bounds.right - 27 &&
                y >= bounds.top + 27 &&
                y <= bounds.bottom - 27,
            ),
          ).toBe(true);
        }
        if (data.motion.morph) {
          const overshoot = structuredClone(data);
          overshoot.motion.morph!.keys[1]!.easing = { overshoot: 5 };
          expect(motionPathBounds(overshoot, 27)).toBeUndefined();
          overshoot.motion.morph!.keys[1]!.easing = {
            bezier: [0.2, -1, 0.8, 2],
          };
          expect(motionPathBounds(overshoot, 27)).toBeUndefined();
        }
        const shadow = structuredClone(layer);
        (shadow.params.samples as { pulse: number }[])[0]!.pulse = 1;
        expect(
          MOTION_PATH_PROVIDERS[0]!.prepare(
            shadow,
            { images: new Map(), fonts: new Map() },
            "layers[0]",
          ).bounds,
        ).toBeUndefined();
        const node = scene.nodes.find((node) => node.id === layer.id)!;
        expect(data.motion.spatial).toEqual(input.spatialPaths?.[0]);
        expect(data.motion.morph).toEqual(input.pathMorphs?.[0]);
        for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
          const expected = evaluateMotionAppearance(scene, node, frame);
          if (expected.type !== "path") throw new Error("Expected path");
          expect(sampleCompositionMotionPath(data, frame).points).toEqual(
            expected.points,
          );
        }
        const broken = structuredClone(layer);
        const motion = broken.params.motion as {
          spatial?: { node: string };
          morph?: { node: string };
        };
        (motion.spatial ?? motion.morph)!.node = "wrong";
        try {
          MOTION_PATH_PROVIDERS[0]!.prepare(
            broken,
            { images: new Map(), fonts: new Map() },
            "layers[0]",
          );
          throw new Error("Expected ownership diagnostic");
        } catch (error) {
          expect(passageDiagnostics(error)).toContainEqual(
            expect.objectContaining({
              code: "comp-provider-params",
              path: "layers[0].params.motion",
            }),
          );
        }
      }
    },
  );
});
