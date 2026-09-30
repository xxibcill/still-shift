import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { analyzeStoryQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { sampleStoryCamera } from "../../packages/renderer-core/src/story-camera.ts";
import { sampleStoryFlow } from "../../packages/renderer-core/src/story-flows.ts";

const directory = resolve("benchmarks/fixtures/story-motion-continuous");
const ids = [
  "unequal-margins",
  "access-constraint",
  "relationship-build",
  "evidence-boundary",
  "dated-system-break",
  "category-swap",
  "motif-resolve",
];

async function scene(id: string) {
  const input = StorySceneSchema.parse(
    JSON.parse(await readFile(resolve(directory, `${id}.json`), "utf8")),
  );
  return compileStoryScene(input);
}

describe("opt-in continuous story library", () => {
  it("keeps seven 192-frame scenes and satisfies compiled G3, G5, G6 and R7 limits", async () => {
    const catalog = JSON.parse(
      await readFile(resolve(directory, "catalog.json"), "utf8"),
    ) as { id: string }[];
    expect(catalog.map((entry) => entry.id)).toEqual(ids);
    for (const id of ids) {
      const compiled = await scene(id);
      const report = analyzeStoryQuality(compiled, { preset: "continuous" });
      expect(compiled.motionGrammar, id).toBe("v2");
      expect(compiled.frameCount, id).toBe(192);
      expect(compiled.fps, id).toBe(24);
      expect(compiled.camera, id).toBeDefined();
      expect(compiled.compiledFlows.length, id).toBeGreaterThan(0);
      expect(report.continuous?.longestSemanticGap, id).toBeLessThanOrEqual(48);
      expect(report.continuous?.maxTextVelocity, id).toBeLessThanOrEqual(20);
      expect(report.continuous?.maxPanPixelsPerFrame, id).toBeLessThanOrEqual(
        2.5,
      );
      expect(report.continuous?.maxZoomPerFrame, id).toBeLessThanOrEqual(
        0.0009,
      );
      expect(
        report.diagnostics.filter((diagnostic) =>
          [
            "frozen-run",
            "semantic-gap",
            "text-velocity",
            "camera-too-fast",
            "label-in-motion-envelope",
          ].includes(diagnostic.code),
        ),
        id,
      ).toEqual([]);
      expect(
        compiled.compiledFlows.some(
          (flow) => flow.window.start <= 191 && flow.window.end === 192,
        ),
        `${id} needs a living current on its final frame`,
      ).toBe(true);
    }
  });

  it("swaps the basket, caption and current colour only at frame 72", async () => {
    const compiled = await scene("category-swap");
    const category = compiled.nodes.find((node) => node.id === "category")!;
    const caption = compiled.nodes.find(
      (node) => node.id === "category-label",
    )!;
    const route = compiled.nodes.find((node) => node.id === "relation")!;
    if (route.type !== "path") throw new Error("Missing supply route");
    const current = compiled.compiledFlows.find(
      (flow) => flow.id === "supply",
    )!;
    expect(evaluatePreparedNode(compiled, category, 71).state).toBe(0);
    expect(evaluatePreparedNode(compiled, category, 72).state).toBe(1);
    expect(evaluatePreparedNode(compiled, caption, 71).state).toBe(0);
    expect(evaluatePreparedNode(compiled, caption, 72).state).toBe(1);
    const routeState = { reveal: 1, gap: 0 };
    expect(sampleStoryFlow(current, route, routeState, 71, 192)[0]?.color).toBe(
      current.color,
    );
    expect(sampleStoryFlow(current, route, routeState, 72, 192)[0]?.color).toBe(
      current.colorStates?.[0]?.color,
    );
    const before = sampleStoryCamera(compiled, 71);
    const after = sampleStoryCamera(compiled, 72);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      2.5,
    );
  });

  it("cuts from the dated crisis to the distinct local context exactly at frame 120", async () => {
    const compiled = await scene("dated-system-break");
    const crisis = compiled.nodes.find((node) => node.id === "crisis")!;
    const later = compiled.nodes.find((node) => node.id === "later")!;
    expect(evaluatePreparedNode(compiled, crisis, 119).opacity).toBe(1);
    expect(evaluatePreparedNode(compiled, later, 119).opacity).toBe(0);
    expect(evaluatePreparedNode(compiled, crisis, 120).opacity).toBe(0);
    expect(evaluatePreparedNode(compiled, later, 120).opacity).toBe(1);
    expect(compiled.recipe.preset).toBe("dated_system_break");
    if (compiled.recipe.preset === "dated_system_break")
      expect(compiled.recipe.reset?.atFrame).toBe(120);
  });

  it("resolves the evidence boundary as three visible categories at frame 191", async () => {
    const compiled = await scene("evidence-boundary");
    const summary = compiled.nodes.find(
      (node) => node.id === "evidence-summary",
    )!;
    const original = compiled.nodes.find((node) => node.id === "composite")!;
    expect(evaluatePreparedNode(compiled, summary, 145).opacity).toBe(0);
    expect(evaluatePreparedNode(compiled, summary, 191).opacity).toBe(1);
    expect(evaluatePreparedNode(compiled, original, 191).opacity).toBe(0);
    for (const id of [
      "summary-supported",
      "summary-unknown",
      "summary-composite",
    ])
      expect(
        compiled.nodes.some((node) => node.id === id),
        id,
      ).toBe(true);
  });
});
