import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

const raw = () =>
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  );
const compile = (recipe: object) =>
  compileStoryScene(
    StorySceneSchema.parse({
      ...raw(),
      motionGrammar: "v2",
      recipe: { ...raw().recipe, ...recipe },
    }),
  );
const pose = (scene: ReturnType<typeof compile>, id: string, frame: number) =>
  evaluatePreparedNode(scene, scene.nodes.find((n) => n.id === id)!, frame);

describe("story choreography", () => {
  it("expands set-down, attach, wipe, draw, stamp and exits", () => {
    const scene = compile({
      entrances: [
        { node: "house-a", verb: "set-down", window: { start: 4, end: 28 } },
        { node: "reference", verb: "wipe", window: { start: 0, end: 18 } },
        { node: "pressure-a", verb: "draw", window: { start: 20, end: 40 } },
        { node: "qualifier", verb: "stamp", window: { start: 40, end: 60 } },
      ],
      exits: [
        { node: "question", verb: "lift", window: { start: 160, end: 180 } },
      ],
    });
    expect(pose(scene, "house-a", 4).y).toBe(374);
    expect(pose(scene, "house-a", 28).y).toBe(402);
    expect(pose(scene, "reference", 0).reveal).toBe(0);
    expect(pose(scene, "reference", 18).reveal).toBe(1);
    expect(pose(scene, "pressure-a", 30).reveal).toBeGreaterThan(0);
    expect(pose(scene, "qualifier", 40).scaleX).toBe(1.06);
    expect(pose(scene, "question", 180).opacity).toBe(0);
    expect(pose(scene, "room", 86).y).toBe(878);
    expect(pose(scene, "room", 106).y).toBe(854);
  });
  it("interpolates multi-key moves without changing the pose before their first key", () => {
    const scene = compile({
      moves: [
        {
          node: "house-b",
          keys: [
            { frame: 88, scaleY: 1, rotation: 0 },
            { frame: 100, scaleY: 0.975, rotation: -1.4, easing: "in-quad" },
            {
              frame: 116,
              scaleY: 0.985,
              rotation: -0.8,
              easing: "out-back-soft",
            },
          ],
        },
      ],
    });
    expect(pose(scene, "house-b", 87).scaleY).toBe(1);
    expect(pose(scene, "house-b", 94).scaleY).toBeCloseTo(0.99375);
    expect(pose(scene, "house-b", 100).rotation).toBe(-1.4);
    expect(pose(scene, "house-b", 116).scaleY).toBe(0.985);
    expect(pose(scene, "house-b", 94)).toEqual(pose(scene, "house-b", 94));
  });
  it("rejects ambiguous moves and conflicting explicit entrances", () => {
    const scene = raw();
    scene.recipe.moves = [
      {
        node: "house-b",
        window: { start: 40, end: 60 },
        to: { scale: 0.8, scaleX: 0.9 },
      },
    ];
    expect(StorySceneSchema.safeParse(scene).success).toBe(false);
    expect(() =>
      compile({
        entrances: [
          { node: "reference", verb: "wipe", window: { start: 0, end: 18 } },
          { node: "reference", verb: "wipe", window: { start: 10, end: 30 } },
        ],
      }),
    ).toThrow(/Conflicting story events/);
  });
  it("preserves v1 implicit fades and version", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(raw()));
    expect(scene.rendererVersion).toBe("story-canvas-0.13.3");
    expect(pose(scene, "room", 90).y).toBe(854);
  });
});

it("expands rise, assemble, wipe-out, retract and default fade exits", () => {
  const input = raw();
  input.motionGrammar = "v2";
  input.nodes.push(
    { id: "parts", type: "group", width: 100, height: 100 },
    {
      id: "piece",
      type: "rect",
      parent: "parts",
      x: 20,
      y: 10,
      width: 50,
      height: 50,
      fill: "#211F1B",
    },
  );
  input.recipe.entrances = [
    { node: "question", verb: "rise", window: { start: 0, end: 20 } },
    {
      node: "parts",
      verb: "assemble",
      window: { start: 20, end: 50 },
      parts: [{ node: "piece", from: "left", distance: 20, offset: 4 }],
    },
  ];
  input.recipe.exits = [
    { node: "question", verb: "wipe-out", window: { start: 150, end: 180 } },
    {
      node: "common-ground",
      verb: "retract",
      window: { start: 140, end: 160 },
    },
    { node: "parts", window: { start: 160, end: 180 } },
  ];
  const scene = compileStoryScene(StorySceneSchema.parse(input));
  expect(pose(scene, "question", 0).y).toBe(262);
  expect(pose(scene, "question", 20).y).toBe(246);
  expect(pose(scene, "piece", 24).x).toBe(0);
  expect(pose(scene, "piece", 50).x).toBe(20);
  expect(pose(scene, "question", 180).reveal).toBe(0);
  expect(pose(scene, "common-ground", 160).reveal).toBe(0);
  expect(pose(scene, "parts", 180).opacity).toBe(0);
});

it("starts a repeated stamp at its own window instead of changing earlier scale", () => {
  const scene = compile({
    entrances: [
      { node: "qualifier", verb: "fade", window: { start: 0, end: 18 } },
      { node: "qualifier", verb: "stamp", window: { start: 100, end: 120 } },
    ],
  });
  expect(pose(scene, "qualifier", 90).scaleX).toBe(1);
  expect(pose(scene, "qualifier", 100).scaleX).toBe(1.06);
  expect(pose(scene, "qualifier", 120).scaleX).toBe(1);
});

it("settles an Action stamp without crossing its target scale", () => {
  const scene = compile({
    entrances: [
      { node: "qualifier", verb: "stamp", window: { start: 40, end: 60 } },
    ],
  });

  for (let frame = 40; frame <= 60; frame++) {
    const { scaleX, scaleY } = pose(scene, "qualifier", frame);
    expect(scaleX).toBeGreaterThanOrEqual(1);
    expect(scaleY).toBeGreaterThanOrEqual(1);
  }
});
