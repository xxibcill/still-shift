import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STORY_PRESETS,
  StorySceneSchema,
} from "../../packages/scene-contract/src/story.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  evaluateStoryPath,
  storyAnchorPosition,
} from "../../packages/renderer-core/src/story-geometry.ts";

const fixture = (preset: string) =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        `benchmarks/fixtures/story-motion/${preset.replaceAll("_", "-")}.json`,
        "utf8",
      ),
    ),
  );

describe("story motion", () => {
  it.each([24, 30] as const)(
    "renders every recipe deterministically at %i fps",
    (fps) => {
      for (const preset of STORY_PRESETS) {
        const scene = compilePreparedScene(
          StorySceneSchema.parse({ ...fixture(preset), fps }),
        );
        const sample = (frame: number) =>
          scene.nodes.map((node) => evaluatePreparedNode(scene, node, frame));
        const first = sample(0);
        const last = sample(scene.frameCount - 1);
        expect(last).not.toEqual(first);
        expect(sample(0)).toEqual(first);
        expect(sample(scene.frameCount - 1)).toEqual(last);
      }
    },
  );
  it("keeps the exact 646-frame proof without rounding milliseconds", () => {
    const scene = compilePreparedScene(
      StorySceneSchema.parse({
        ...fixture("unequal_margins"),
        frameCount: 646,
        episodeStartFrame: 4748,
      }),
    );
    expect(scene.timeline.frameCount).toBe(646);
    expect(scene.timeline.durationMs).toBe((646 * 1000) / 24);
    expect(scene.episodeStartFrame).toBe(4748);
    expect(() => evaluatePreparedNode(scene, scene.nodes[0]!, 646)).toThrow();
  });
  it("keeps access open and the source fixed at every frame", () => {
    const scene = compilePreparedScene(fixture("access_constraint"));
    const recipe = scene.recipe;
    if (recipe.preset !== "access_constraint") throw new Error("Wrong fixture");
    const find = (id: string) => scene.nodes.find((node) => node.id === id)!;
    const source = evaluatePreparedNode(scene, find(recipe.source), 0);
    for (let f = 0; f < scene.frameCount; f++) {
      expect(evaluatePreparedNode(scene, find(recipe.source), f)).toEqual(
        source,
      );
      expect(evaluatePreparedNode(scene, find(recipe.route), f).gap).toBe(0);
      const a = evaluatePreparedNode(scene, find(recipe.sides[0]), f);
      const b = evaluatePreparedNode(scene, find(recipe.sides[1]), f);
      const clear =
        Math.hypot(b.x - a.x, b.y - a.y) -
        (find(recipe.sides[0]).height + find(recipe.sides[1]).height) / 2;
      expect(clear).toBeGreaterThanOrEqual(recipe.constrainedWidth - 0.001);
    }
    const closed = structuredClone(scene);
    if (closed.recipe.preset === "access_constraint")
      closed.recipe.constrainedWidth = 1;
    expect(
      StorySceneSchema.safeParse({
        ...fixture("access_constraint"),
        recipe: closed.recipe,
      }).success,
    ).toBe(false);
  });
  it("performs discrete replacement and context reset on exact frames", () => {
    const category = compilePreparedScene(fixture("category_swap"));
    if (category.recipe.preset !== "category_swap")
      throw new Error("Wrong fixture");
    const subjectId = category.recipe.subject;
    const subject = category.nodes.find((node) => node.id === subjectId)!;
    const at = category.recipe.swapFrame;
    for (const [frame, state] of [
      [at, 1],
      [at - 1, 0],
      [at + 1, 1],
      [0, 0],
    ])
      expect(evaluatePreparedNode(category, subject, frame!).state).toBe(state);
    const crisis = compilePreparedScene(fixture("dated_system_break"));
    if (crisis.recipe.preset !== "dated_system_break" || !crisis.recipe.reset)
      throw new Error("Wrong fixture");
    const recipe = crisis.recipe;
    const before = recipe.reset!.atFrame - 1,
      after = before + 1;
    for (const [id, previous, next] of [
      [recipe.system, 1, 0],
      [recipe.reset!.group, 0, 1],
    ] as const) {
      const node = crisis.nodes.find((node) => node.id === id)!;
      expect(evaluatePreparedNode(crisis, node, before).opacity).toBe(previous);
      expect(evaluatePreparedNode(crisis, node, after).opacity).toBe(next);
    }
  });
  it("rejects a break before readable context and invalid categories", () => {
    const crisis = fixture("dated_system_break");
    if (crisis.recipe.preset !== "dated_system_break")
      throw new Error("Wrong fixture");
    crisis.recipe.contextReadyFrame = crisis.recipe.breaks[0]!.window.start + 1;
    expect(StorySceneSchema.safeParse(crisis).success).toBe(false);
    const swap = fixture("category_swap");
    if (swap.recipe.preset !== "category_swap")
      throw new Error("Wrong fixture");
    swap.recipe.toState = 90;
    expect(StorySceneSchema.safeParse(swap).success).toBe(false);
  });
  it("keeps independently regrouping connectors attached through parent transforms", () => {
    const input = fixture("relationship_build");
    input.nodes.push({
      id: "wrapper",
      type: "group",
      width: 1920,
      height: 1080,
      x: 15,
      y: 25,
      rotation: 8,
      origin: [0.5, 0.5],
      opacity: 1,
      clip: false,
    });
    for (const node of input.nodes)
      if (["resources", "claims"].includes(node.id)) node.parent = "wrapper";
    const scene = compilePreparedScene(StorySceneSchema.parse(input));
    for (const f of [0, 108, 120, 144, 191, 120]) {
      for (const binding of scene.connectors) {
        const node = scene.nodes.find((node) => node.id === binding.path)!;
        if (node.type !== "path") throw new Error("Expected path");
        const path = evaluateStoryPath(scene, node, f);
        expect(path.points.at(-1)).toEqual(
          storyAnchorPosition(scene, binding.to.node, binding.to.point, f),
        );
        expect(path.points.every((point) => point.every(Number.isFinite))).toBe(
          true,
        );
      }
    }
    const from = storyAnchorPosition(scene, "store", [390, 120], 120);
    const store = scene.nodes.find((node) => node.id === "store")!;
    expect(from).toEqual([store.x + 390, store.y + 120]);
    expect(storyAnchorPosition(scene, "resources", [0, 125], 166)).not.toEqual(
      storyAnchorPosition(scene, "resources", [0, 125], 0),
    );
  });
  it("accumulates successive emphasis events and rejects overlapping writes", () => {
    const input = fixture("relationship_build");
    if (input.recipe.preset !== "relationship_build")
      throw new Error("Wrong fixture");
    const scene = compilePreparedScene(input);
    const resource = scene.nodes.find((node) => node.id === "resources-art")!;
    expect(evaluatePreparedNode(scene, resource, 55).opacity).toBe(1);
    expect(evaluatePreparedNode(scene, resource, 97).opacity).toBe(0.65);
    expect(evaluatePreparedNode(scene, resource, 166).opacity).toBe(1);
    input.recipe.emphasis.push({
      node: "resources-art",
      window: { start: 80, end: 110 },
      opacity: 0.5,
    });
    expect(() => compilePreparedScene(input)).toThrow(/Conflicting/);
  });
  it("rejects hidden qualifiers, out-of-range events and dependent evidence roles", () => {
    const input = fixture("evidence_boundary");
    if (input.recipe.preset !== "evidence_boundary")
      throw new Error("Wrong fixture");
    const qualifier = input.recipe.qualifier;
    input.nodes.find((node) => node.id === qualifier)!.opacity = 0;
    expect(StorySceneSchema.safeParse(input).success).toBe(false);
    input.nodes.find((node) => node.id === qualifier)!.opacity = 1;
    const originalEnd = input.recipe.unknown.window.end;
    input.recipe.unknown.window.end = input.frameCount;
    expect(StorySceneSchema.safeParse(input).success).toBe(false);
    input.recipe.unknown.window.end = originalEnd;
    input.recipe.composite.node = input.recipe.unknown.node;
    expect(StorySceneSchema.safeParse(input).success).toBe(false);
  });
});
