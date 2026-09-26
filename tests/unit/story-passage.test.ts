import { readFileSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StoryPassagePlanSchema } from "../../packages/scene-contract/src/story-passage.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  readStoryPassage,
  writePreparedPassage,
} from "../../scripts/story-motion/passage-files.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { resourcePassage } from "../../scripts/story-motion/resource-passage.ts";
import { comparisonAccessProof } from "../../scripts/story-motion/proof.ts";

const comparison = StorySceneSchema.parse(
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/unequal-margins.json",
      "utf8",
    ),
  ),
);
const makePlan = () =>
  StoryPassagePlanSchema.parse({
    schemaVersion: "story-passage-1",
    id: "comparison",
    title: "Different room to absorb strain",
    styleProfile: "layered-chronicle-1",
    fps: 24,
    sourceStartFrame: 4748,
    narration: { reference: "Fixture narration", sha256: "a".repeat(64) },
    beats: [
      {
        id: "comparison",
        template: "comparison.json",
        purpose: "compare",
        takeaway: "The same pressure has different consequences.",
        evidence: {
          kind: "symbolic",
          qualification: "A qualitative comparison",
          node: "qualifier",
        },
        focus: ["house-a", "house-b"],
        intensity: "peak",
        frameCount: 192,
        cues: [
          {
            id: "strain",
            phrase: "Different consequences",
            frame: 48,
            events: ["shared-strain"],
          },
        ],
      },
    ],
  });
const templates = () => new Map([["comparison.json", comparison]]);

describe("story passage planning", () => {
  it("binds exact category cuts without silently retiming stateful captions", () => {
    const scene = StorySceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/story-motion/category-swap.json",
          "utf8",
        ),
      ),
    );
    if (scene.recipe.preset !== "category_swap")
      throw new Error("Wrong fixture");
    const qualifierId = scene.recipe.qualifier;
    const plan = makePlan();
    const beat = plan.beats[0]!;
    beat.focus = [scene.recipe.subject];
    const qualifier = scene.nodes.find((node) => node.id === qualifierId);
    if (qualifier?.type !== "text") throw new Error("Missing qualification");
    beat.evidence = {
      kind: "symbolic",
      node: qualifier.id,
      qualification: qualifier.text,
    };
    beat.cues = [
      {
        id: "change",
        phrase: "The category changes",
        frame: scene.recipe.swapFrame,
        events: ["@swap"],
      },
    ];
    const templates = new Map([[beat.template, scene]]);
    const result = compileStoryPassage(plan, templates);
    expect(result.beats[0]!.cues[0]!.windows[0]).toMatchObject({
      start: 72,
      end: 72,
    });
    beat.timing = { "@swap": { start: 70, end: 72 } };
    expect(() => compileStoryPassage(plan, templates)).toThrow(
      /unknown timing event/,
    );
    beat.timing = {};
    const caption = scene.recipe.stateLabels![0]!;
    beat.copy = { [caption]: "A replacement" };
    expect(() => compileStoryPassage(plan, templates)).toThrow(
      /stateful captions/,
    );
  });

  it("exports an editable plan that resolves from another directory and refuses overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-plan-"));
    try {
      const passage = await readStoryPassage(
        "benchmarks/fixtures/story-passages/comparison-access.json",
      );
      const output = join(directory, "prepared");
      await writePreparedPassage(output, passage);
      const exported = join(output, "source-plan.json");
      const before = await readFile(exported, "utf8");
      const reloaded = await readStoryPassage(exported);
      expect(reloaded.beats.map((beat) => beat.scene)).toEqual(
        passage.beats.map((beat) => beat.scene),
      );
      await expect(writePreparedPassage(output, passage)).rejects.toThrow();
      expect(await readFile(exported, "utf8")).toBe(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(["resources", "comparison-access"])(
    "preserves the %s passage's render graph, exact cues and delivery boundaries",
    async (id) => {
      const load = (id: string) =>
        StorySceneSchema.parse(
          JSON.parse(
            readFileSync(
              "benchmarks/fixtures/story-motion/" + id + ".json",
              "utf8",
            ),
          ),
        );
      const expected =
        id === "resources"
          ? resourcePassage(load("relationship-build"), comparison)
          : comparisonAccessProof(comparison, load("access-constraint"));
      const passage = await readStoryPassage(
        "benchmarks/fixtures/story-passages/" + id + ".json",
      );
      expect(passage.frameCount).toBe(id === "resources" ? 1507 : 646);
      expect(
        passage.plan.delivery.map((shot) => shot.end - shot.start),
      ).toEqual(id === "resources" ? [408, 360, 739] : [334, 312]);
      for (const [index, beat] of passage.beats.entries()) {
        const before = compileStoryScene(expected[index]!);
        const after = compileStoryScene(beat.scene);
        expect(after.nodes).toEqual(before.nodes);
        expect(after.tracks).toEqual(before.tracks);
        expect(beat.scene.connectors).toEqual(expected[index]!.connectors);
        expect(beat.scene.episodeStartFrame).toBe(
          expected[index]!.episodeStartFrame,
        );
      }
    },
  );

  it("resolves a communicative purpose to the existing recipe without mutating its template", () => {
    const original = structuredClone(comparison);
    const result = compileStoryPassage(makePlan(), templates());
    expect(result.frameCount).toBe(192);
    expect(result.endFrameExclusive).toBe(4940);
    expect(result.beats[0]?.scene.episodeStartFrame).toBe(4748);
    expect(result.beats[0]?.preset).toBe("unequal_margins");
    expect(result.beats[0]?.cues[0]?.masterFrame).toBe(4796);
    expect(comparison).toEqual(original);
  });

  it("rejects a template whose recipe cannot express the requested purpose", () => {
    const plan = makePlan();
    plan.beats[0]!.purpose = "qualify-evidence";
    expect(() => compileStoryPassage(plan, templates())).toThrow(/purpose/);
  });

  it("rejects missing focal subjects, event cues, and contradictory evidence qualifications", () => {
    for (const mutate of [
      (plan: ReturnType<typeof makePlan>) => {
        plan.beats[0]!.focus = ["missing"];
      },
      (plan: ReturnType<typeof makePlan>) => {
        plan.beats[0]!.cues[0]!.events = ["missing"];
      },
      (plan: ReturnType<typeof makePlan>) => {
        plan.beats[0]!.evidence.qualification = "A measured result";
      },
    ]) {
      const plan = makePlan();
      mutate(plan);
      expect(() => compileStoryPassage(plan, templates())).toThrow();
    }
  });

  it("changes copy and event timing from data while retaining recipe validation", () => {
    const plan = makePlan();
    plan.beats[0]!.copy = { reference: "One season. Different outcomes." };
    plan.beats[0]!.timing = { "shared-strain": { start: 52, end: 108 } };
    const result = compileStoryPassage(plan, templates());
    expect(
      result.beats[0]!.scene.nodes.find((n) => n.id === "reference"),
    ).toMatchObject({ text: "One season. Different outcomes." });
    expect(result.beats[0]!.scene.recipe).toMatchObject({
      strain: { start: 52, end: 108 },
    });
    plan.beats[0]!.timing = { "shared-strain": { start: 52, end: 300 } };
    expect(() => compileStoryPassage(plan, templates())).toThrow();
  });

  it("rejects invalid delivery coverage and cue frames before preparation", () => {
    const plan = makePlan();
    plan.delivery = [{ id: "shot", start: 1, end: 192 }];
    expect(() => StoryPassagePlanSchema.parse(plan)).toThrow(/cover/);
    plan.delivery = [];
    plan.beats[0]!.cues[0]!.frame = 192;
    expect(() => StoryPassagePlanSchema.parse(plan)).toThrow(/cue/i);
  });
});
