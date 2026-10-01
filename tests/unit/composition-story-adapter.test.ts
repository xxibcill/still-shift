import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  multiplyMatrix,
  nodeMatrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { storyCameraTransform } from "../../packages/renderer-core/src/story-camera.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const fixture = () =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/story-motion-continuous/access-constraint.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

describe("CE4a story adapter first slice", () => {
  it("compiles an inspectable composition with camera, clips, providers and cue markers", () => {
    const composition = storyToComposition(fixture(), {
      id: "access-constraint",
    });
    expect(validateComposition(composition).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
    expect(composition.camera2d?.keys).toEqual(fixture().camera?.keys);
    expect(composition.layers.find((l) => l.id === "side-a")).toMatchObject({
      type: "group",
      clip: true,
    });
    expect(composition.layers.find((l) => l.id === "route-a")).toMatchObject({
      type: "provider",
      provider: "story.path@1.0.0",
    });
    expect(composition.markers).toContainEqual(
      expect.objectContaining({ id: "access-constrained", frame: 104 }),
    );
  });

  it("preserves every node matrix and inherited opacity at every integer frame, including reverse seeks", () => {
    const scene = compileStoryScene(fixture());
    const composition = storyToComposition(fixture());
    for (let frame = scene.frameCount - 1; frame >= 0; frame--) {
      const states = new Map(
        evaluateComp(composition, frame).layers.map((l) => [l.id, l]),
      );
      const expected = new Map<
        string,
        { matrix: ReturnType<typeof nodeMatrix>; opacity: number }
      >();
      const visit = (
        id: string,
      ): { matrix: ReturnType<typeof nodeMatrix>; opacity: number } => {
        if (expected.has(id)) return expected.get(id)!;
        const node = scene.nodes.find((n) => n.id === id)!;
        const state = evaluatePreparedNode(scene, node, frame);
        const parent = node.parent ? visit(node.parent) : undefined;
        const camera = storyCameraTransform(scene, id, frame);
        const matrix = multiplyMatrix(
          parent?.matrix ?? [
            camera.scale,
            0,
            0,
            camera.scale,
            camera.x,
            camera.y,
          ],
          nodeMatrix(node, state),
        );
        const result = {
          matrix,
          opacity: (parent?.opacity ?? 1) * state.opacity,
        };
        expected.set(id, result);
        return result;
      };
      for (const node of scene.nodes) {
        const target = visit(node.id),
          actual = states.get(node.id)!;
        actual.screenMatrix.forEach((value, i) =>
          expect(value).toBeCloseTo(target.matrix[i]!, 8),
        );
        expect(actual.opacity).toBeCloseTo(target.opacity, 10);
      }
    }
  });

  it("rejects unsupported features with a path instead of dropping them", () => {
    const scene = fixture();
    scene.nodes.push({
      id: "box",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      origin: [0, 0],
      opacity: 1,
      rotation: 0,
      fill: "#ffffff",
      radius: 10,
      lineWidth: 0,
    });
    try {
      storyToComposition(scene);
      throw new Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-adapter-unsupported",
          path: `nodes[${scene.nodes.length - 1}].type`,
        }),
      );
    }
  });
});
