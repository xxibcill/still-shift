import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MotionEasingSchema } from "../../packages/scene-contract/src/motion-easing.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";
import { easeMotion } from "../../packages/renderer-core/src/motion-easing.ts";
import { inkStrokeOutline } from "../../packages/renderer-core/src/ink-path.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
  sampleTrack,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  evaluateStoryPath,
  storyAnchorPosition,
} from "../../packages/renderer-core/src/story-geometry.ts";

const input = () =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion/relationship-build.json",
        "utf8",
      ),
    ),
  );

describe("story stroke and timing", () => {
  it("keeps easing bounded, monotonic and exact while preserving legacy smoothstep", () => {
    for (const easing of MotionEasingSchema.options.filter(
      (easing) => easing !== "out-back-soft",
    )) {
      const values = Array.from({ length: 101 }, (_, i) =>
        easeMotion(i / 100, easing),
      );
      expect(values[0]).toBe(0);
      expect(values[100]).toBe(1);
      expect(
        values.every(
          (v, i) => v >= 0 && v <= 1 && (i === 0 || v >= values[i - 1]!),
        ),
      ).toBe(true);
    }
    expect(
      sampleTrack(
        [
          { time: 0, value: 0 },
          { time: 100, value: 1 },
        ],
        25,
      ),
    ).toBe(0.15625);
    expect(
      sampleTrack(
        [
          { time: 0, value: 0 },
          { time: 100, value: 1, easing: "out-cubic" },
        ],
        25,
      ),
    ).toBe(0.578125);
    expect(easeMotion(0.25, "in-out-quint")).toBeLessThan(easeMotion(0.25));
    expect(
      sampleTrack(
        [
          { time: 0, value: 0 },
          { time: 72, value: 1, step: true, easing: "out-cubic" },
        ],
        71,
      ),
    ).toBe(0);
    expect(
      sampleTrack(
        [
          { time: 0, value: 0 },
          { time: 72, value: 1, step: true, easing: "out-cubic" },
        ],
        72,
      ),
    ).toBe(1);
  });

  it("draws before the destination arrives, then holds both exact end states", () => {
    const scene = compilePreparedScene(input());
    if (scene.recipe.preset !== "relationship_build")
      throw new Error("Wrong scene");
    const branch = scene.recipe.branches[0]!;
    const path = scene.nodes.find((n) => n.id === branch.path)!;
    const destination = scene.nodes.find((n) => n.id === branch.destination)!;
    const arrival = branch.arrival!;
    expect(
      evaluatePreparedNode(scene, path, arrival.start).reveal,
    ).toBeGreaterThan(0.8);
    expect(
      evaluatePreparedNode(scene, destination, arrival.start).opacity,
    ).toBe(0);
    expect(evaluatePreparedNode(scene, path, branch.window.end).reveal).toBe(1);
    expect(evaluatePreparedNode(scene, destination, arrival.end).opacity).toBe(
      1,
    );
    expect(evaluatePreparedNode(scene, destination, arrival.end).y).toBe(285);
  });

  it("keeps bowed connectors attached throughout staggered movement and backward seeks", () => {
    const scene = compilePreparedScene(input());
    for (const frame of [0, 24, 32, 42, 70, 140, 166, 32]) {
      for (const binding of scene.connectors) {
        const path = scene.nodes.find((n) => n.id === binding.path)!;
        if (path.type !== "path") throw new Error("Not a path");
        const points = evaluateStoryPath(scene, path, frame).points;
        const a = storyAnchorPosition(
          scene,
          binding.from.node,
          binding.from.point,
          frame,
        );
        const b = storyAnchorPosition(
          scene,
          binding.to.node,
          binding.to.point,
          frame,
        );
        expect(points[0]).toEqual(a);
        expect(points.at(-1)).toEqual(b);
        expect(points[32]).not.toEqual([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        expect(points.flat().every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps ink inside the declared route width and leaves fracture gaps empty", () => {
    const path = PreparedNodeSchema.parse({
      id: "route",
      type: "path",
      points: [
        [0, 0],
        [1000, 0],
      ],
      stroke: "#59664D",
      lineWidth: 10,
      lineStyle: "ink",
    });
    if (path.type !== "path") throw new Error("Not a path");
    const full = inkStrokeOutline(path, 0, 1);
    expect(
      full.every(([x, y]) => x >= 0 && x <= 1000 && Math.abs(y) <= 5),
    ).toBe(true);
    const before = inkStrokeOutline(path, 0, 0.4),
      after = inkStrokeOutline(path, 0.6, 1);
    expect(Math.max(...before.map(([x]) => x))).toBeLessThanOrEqual(400);
    expect(Math.min(...after.map(([x]) => x))).toBeGreaterThanOrEqual(600);
    expect(inkStrokeOutline(path, 0, 0)).toEqual([]);
    expect(inkStrokeOutline(path, 0, 0.6)).toEqual(
      inkStrokeOutline(path, 0, 0.6),
    );
  });

  it("rejects invalid timing, curve and line-style authoring", () => {
    const scene = input();
    if (scene.recipe.preset !== "relationship_build")
      throw new Error("Wrong scene");
    scene.recipe.branches[0]!.arrival!.start = 0;
    expect(StorySceneSchema.safeParse(scene).success).toBe(false);
    expect(
      StorySceneSchema.safeParse({
        ...input(),
        connectors: [{ ...input().connectors[0], bend: 121 }],
      }).success,
    ).toBe(false);
    expect(MotionEasingSchema.safeParse("elastic").success).toBe(false);
    const path = input().nodes.find((node) => node.type === "path")!;
    expect(
      PreparedNodeSchema.safeParse({ ...path, lineStyle: "glow" }).success,
    ).toBe(false);
    const access = StorySceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/story-motion/access-constraint.json",
          "utf8",
        ),
      ),
    );
    if (access.recipe.preset !== "access_constraint")
      throw new Error("Wrong scene");
    const routeId = access.recipe.route;
    const route = access.nodes.find((node) => node.id === routeId)!;
    if (route.type !== "path") throw new Error("Not a path");
    route.endArrow = true;
    expect(StorySceneSchema.safeParse(access).success).toBe(false);
  });
});
