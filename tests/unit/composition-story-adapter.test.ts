import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StorySceneSchema,
  validateComposition,
  COMPOSITION_LIMITS,
} from "@still-shift/scene-contract";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import {
  StoryPathParamsSchema,
  StoryFlowParamsSchema,
  StoryTextParamsSchema,
} from "../../packages/renderer-core/src/composition/adapters/story-providers.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  evaluatePreparedNode,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
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

  it("preserves image camera cover declarations through JSON serialization", () => {
    const scene = fixture();
    const composition = JSON.parse(JSON.stringify(storyToComposition(scene)));
    expect(composition.metadata.storyCameraCover).toEqual(scene.camera!.cover);
  });

  it("compiles cameras with an empty cover list", () => {
    const scene = fixture();
    scene.camera!.cover = [];
    const composition = storyToComposition(scene);
    expect(validateComposition(composition).ok).toBe(true);
    expect(composition.camera2d?.keys).toEqual(scene.camera!.keys);
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

  it.each(["access constrained", "การเข้าถึง", "1-access", "a".repeat(129)])(
    "preserves cue labels with valid deterministic marker IDs: %s",
    (cue) => {
      const scene = fixture();
      if (scene.recipe.preset !== "access_constraint")
        throw new Error("access fixture required");
      scene.recipe.narrow.cue = cue;
      const composition = storyToComposition(scene);
      expect(composition.markers).toContainEqual(
        expect.objectContaining({
          label: cue,
          frame: scene.recipe.narrow.start,
          duration: scene.recipe.narrow.end - scene.recipe.narrow.start,
        }),
      );
      expect(validateComposition(composition).ok).toBe(true);
      expect(storyToComposition(scene).markers).toEqual(composition.markers);
    },
  );

  it("reserves authored marker IDs before assigning IDs to other cue labels", () => {
    const scene = fixture();
    if (scene.recipe.preset !== "access_constraint")
      throw new Error("access fixture required");
    scene.recipe.reveal.cue = "cue with spaces";
    scene.recipe.narrow.cue = "cue-1";
    const markers = storyToComposition(scene).markers!;
    expect(markers.find((marker) => marker.label === "cue-1")?.id).toBe(
      "cue-1",
    );
    expect(new Set(markers.map((marker) => marker.id)).size).toBe(
      markers.length,
    );
    expect(
      markers.filter((marker) => marker.label === "cue with spaces"),
    ).toHaveLength(1);
  });

  it("bounds long cue labels without rejecting the story", () => {
    const scene = fixture();
    if (scene.recipe.preset !== "access_constraint")
      throw new Error("access fixture required");
    scene.recipe.narrow.cue = "a".repeat(201);
    expect(storyToComposition(scene).markers).toContainEqual(
      expect.objectContaining({
        label: "a".repeat(200),
        frame: scene.recipe.narrow.start,
      }),
    );
  });

  it("retains schema refusal of typography fields without typography opt-in", () => {
    const input = fixture();
    const node = input.nodes.find((node) => node.type === "text")!;
    Object.assign(node, { locale: "th", anchor: "baseline" });
    expect(() => storyToComposition(input)).toThrow(/typography-opt-in/);
  });

  it("compiles story motion blur using bounded fractional source samples", () => {
    const input = fixture();
    input.motionModel = "curves-1";
    input.effectsVersion = "effects-1";
    input.effects = [
      {
        type: "motion-blur",
        shutterAngle: 180,
        samples: 4,
        active: { start: 40, end: 80 },
      },
    ];
    const scene = compileStoryScene(input);
    const comp = storyToComposition(input);
    expect(comp.motionBlur).toMatchObject({
      enabled: true,
      shutterAngle: 180,
      samples: 4,
      inPoint: 40,
      outPoint: 80,
    });
    expect(validateComposition(comp).ok).toBe(true);
    for (const layer of comp.layers) {
      expect(layer.motionBlur).toBe(true);
      expect(layer.sampleTimes?.length).toBeLessThanOrEqual(
        COMPOSITION_LIMITS.maxKeys,
      );
    }
    const times = comp.layers[0]!.sampleTimes!;
    expect(times.some((time) => time % 1 !== 0)).toBe(true);
    for (const time of [...times].reverse()) {
      const states = new Map(
        evaluateComp(comp, time).layers.map((layer) => [layer.id, layer]),
      );
      for (const node of scene.nodes) {
        const expected = evaluatePreparedNodeAtTime(scene, node, time);
        expect(states.get(node.id)!.transform.opacity).toBeCloseTo(
          expected.opacity,
          10,
        );
        const expectedMatrix = nodeMatrix(node, expected);
        states
          .get(node.id)!
          .localMatrix.forEach((value, index) =>
            expect(value).toBeCloseTo(expectedMatrix[index]!, 10),
          );
      }
    }
    expect(
      comp.layers
        .filter((layer) => layer.type === "provider" && "flow" in layer.params)
        .every(
          (layer) =>
            layer.type === "provider" &&
            layer.provider === "component.flow@1.1.0",
        ),
    ).toBe(true);
  });

  it("does not add an exposure clock for a zero-angle shutter", () => {
    const input = fixture();
    input.motionModel = "curves-1";
    input.effectsVersion = "effects-1";
    input.effects = [{ type: "motion-blur", shutterAngle: 0, samples: 4 }];
    const comp = storyToComposition(input);
    expect(comp.motionBlur).toBeUndefined();
    expect(comp.layers.every((layer) => !layer.sampleTimes)).toBe(true);
  });

  it.each([1500, COMPOSITION_LIMITS.maxKeys])(
    "compacts settled provider samples without changing any source frame: %i frames",
    (frameCount) => {
      const input = fixture();
      input.frameCount = frameCount;
      input.camera!.keys.at(-1)!.frame = frameCount - 1;
      for (const flow of input.flows ?? []) flow.window.end = frameCount - 1;
      const scene = compileStoryScene(input);
      const composition = storyToComposition(input);
      expect(validateComposition(composition).ok).toBe(true);
      for (const layer of composition.layers) {
        if (layer.type !== "provider") continue;
        const params =
          layer.provider === "story.path@1.0.0"
            ? StoryPathParamsSchema.parse(layer.params)
            : layer.provider === "story.text@1.0.0"
              ? StoryTextParamsSchema.parse(layer.params)
              : StoryFlowParamsSchema.parse(layer.params);
        if (layer.provider === "story.flow@1.0.0")
          expect(params.samples).toHaveLength(frameCount);
        else expect(params.samples.length).toBeLessThan(frameCount);
        const node = scene.nodes.find((n) => n.id === params.node.id)!;
        for (let frame = frameCount - 1; frame >= 0; frame--) {
          const expected = evaluatePreparedNode(scene, node, frame);
          const sample =
            params.samples[Math.min(frame, params.samples.length - 1)]!;
          for (const [key, value] of Object.entries(sample))
            expect(value).toBe(expected[key as keyof typeof expected]);
        }
      }
    },
  );

  it("identifies the source node when provider content still exceeds the JSON limit", () => {
    const scene = fixture();
    const index = scene.nodes.findIndex((node) => node.type === "text");
    const node = scene.nodes[index]!;
    if (node.type !== "text") throw new Error("text fixture required");
    node.text = "x".repeat(COMPOSITION_LIMITS.maxJsonBytes);
    try {
      storyToComposition(scene);
      throw new Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-json-size",
          node: node.id,
          path: `nodes[${index}]`,
        }),
      );
    }
  });
});
