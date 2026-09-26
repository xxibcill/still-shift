import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";

const fixture = (name = "relationship-build") =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(`benchmarks/fixtures/story-motion/${name}.json`, "utf8"),
    ),
  );

it("reports an almost absent hold in seconds without rejecting an exact cut", () => {
  for (const fps of [24, 30] as const) {
    const input = fixture("category-swap");
    input.fps = fps;
    if (input.recipe.preset !== "category_swap")
      throw new Error("Wrong fixture");
    input.recipe.swapFrame = 191;
    const scene = compileStoryScene(input);
    const before = JSON.stringify(scene);
    const result = analyzeStoryQuality(scene);
    expect(result.finalHoldSeconds).toBeCloseTo(1 / fps);
    expect(result.diagnostics.map((d) => d.code)).toContain("short-final-hold");
    expect(JSON.stringify(scene)).toBe(before);
    expect(analyzeStoryQuality(scene)).toEqual(result);
  }
});

it("counts related tracks as one focus and detects simultaneous branches", () => {
  const input = fixture();
  expect(
    analyzeStoryQuality(compileStoryScene(input)).diagnostics.filter(
      (d) => d.code === "competing-focus",
    ),
  ).toEqual([]);
  if (input.recipe.preset !== "relationship_build")
    throw new Error("Wrong fixture");
  input.recipe.branches.forEach((b) => {
    b.window = { start: 12, end: 34 };
    b.arrival = { start: 24, end: 42 };
  });
  input.recipe.moves = [];
  input.recipe.emphasis = [];
  const scene = compileStoryScene(input);
  const warning = analyzeStoryQuality(scene).diagnostics.find(
    (d) => d.code === "competing-focus",
  )!;
  expect(warning.measured).toBe(3);
  expect(warning.frames).toEqual([13, 42]);
  const childPolicy = analyzeStoryQuality(scene, {
    focalGroups: ["resources", "access", "claims"].map((id) => ({
      id,
      nodes: [`${id}-label`],
    })),
  });
  expect(
    childPolicy.diagnostics.find((d) => d.code === "competing-focus")?.measured,
  ).toBe(3);
  const accepted = analyzeStoryQuality(scene, {
    exceptions: [
      {
        code: warning.code,
        frames: warning.frames,
        reason: "Three routes establish one shared context.",
      },
    ],
  });
  expect(
    accepted.diagnostics.find((d) => d.code === "competing-focus")?.exception,
  ).toMatch(/shared context/);
});

it("measures transformed essential type and ignores invisible and no-op motion", () => {
  const input = fixture();
  const essential = input.nodes.find((node) => node.id === "resources-label")!;
  if (essential.type !== "text") throw new Error("Missing text fixture");
  essential.fontSize = 80;
  const scene = compileStoryScene(input);
  scene.nodes.push({
    id: "hidden",
    type: "group",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 0,
    origin: [0.5, 0.5],
    clip: false,
  });
  scene.nodes.push({
    ...scene.nodes.find((n) => n.id === "resources-label")!,
    id: "hidden-label",
    parent: "hidden",
  });
  scene.tracks["hidden-label"] = {
    x: [
      { time: 0, value: 0 },
      { time: 191, value: 800 },
    ],
  };
  scene.tracks.hidden = {
    x: [
      { time: 0, value: 0 },
      { time: 191, value: 0 },
    ],
  };
  scene.tracks.resources!.scaleY = [{ time: 0, value: 0.5 }];
  const result = analyzeStoryQuality(scene, {
    essentialText: ["resources-label", "hidden-label"],
    displayWidth: 350,
  });
  expect(result.finalHoldSeconds).toBe(2.25);
  const small = result.diagnostics.filter(
    (d) => d.code === "small-essential-text",
  );
  expect(small).toHaveLength(1);
  expect(small[0]!.nodes).toEqual(["resources-label"]);
  expect(small[0]!.measured).toBeCloseTo((80 * 0.5 * 350) / 1920);
  // An opaque parent collapsed to zero width is also invisible to the viewer.
  scene.nodes.find((n) => n.id === "hidden")!.opacity = 1;
  scene.tracks.hidden!.scaleX = [{ time: 0, value: 0 }];
  const collapsed = analyzeStoryQuality(scene, {
    essentialText: ["hidden-label"],
  });
  expect(collapsed.minimumTextPxObserved).toBeNull();
  expect(collapsed.finalHoldSeconds).toBe(2.25);
});

it("rejects invalid review options instead of emitting misleading measurements", () => {
  const scene = compileStoryScene(fixture());
  expect(() => analyzeStoryQuality(scene, { displayWidth: 0 })).toThrow(
    /displayWidth/,
  );
  expect(() =>
    analyzeStoryQuality(scene, { essentialText: ["missing"] }),
  ).toThrow(/missing/);
});

it("warns only for explicitly marked essential text", () => {
  const input = fixture("evidence-boundary");
  input.review = { essentialText: ["qualifier"] };
  const report = analyzeStoryQuality(compileStoryScene(input));
  expect(
    report.diagnostics
      .filter((diagnostic) => diagnostic.code === "small-essential-text")
      .map((diagnostic) => diagnostic.nodes[0]),
  ).toEqual(["qualifier"]);

  delete input.review;
  expect(
    analyzeStoryQuality(compileStoryScene(input)).diagnostics.filter(
      (diagnostic) => diagnostic.code === "small-essential-text",
    ),
  ).toEqual([]);
  expect(() =>
    StorySceneSchema.parse({
      ...input,
      review: { essentialText: ["missing"] },
    }),
  ).toThrow(/Essential text role/);
});
