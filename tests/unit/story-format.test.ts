import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { StoryTemplateSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import {
  instantiateStoryTemplate,
  resolveStoryFormat,
} from "../../packages/renderer-core/src/story-template.ts";
import {
  compileStoryPassage,
  inspectStoryPassage,
} from "../../packages/renderer-core/src/story-passage.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { storyAnchorPosition } from "../../packages/renderer-core/src/story-geometry.ts";
import { validateStorySafeZones } from "../../packages/renderer-core/src/story-safe-zones.ts";
import { passageBeatKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { safeZoneOffset } from "../../packages/renderer-core/src/safe-zone-geometry.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

const json = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;
const fixtureScene = () =>
  StorySceneSchema.parse(
    json("benchmarks/fixtures/story-motion/unequal-margins.json"),
  );
const fixtureTemplate = () =>
  StoryTemplateSchema.parse(
    json("benchmarks/fixtures/story-authoring/network-template.json"),
  );
const fixturePlan = () =>
  json("benchmarks/fixtures/story-authoring/linked-network.json");

describe("story format overrides", () => {
  it("renders two formats from one plan without changing landscape scenes, cues or events", () => {
    const source = fixtureTemplate();
    const plan = fixturePlan();
    const baseline = compileStoryPassage(
      plan,
      new Map([["network-template.json", source]]),
    );
    const authored = structuredClone(source);
    authored.formats = {
      vertical: {
        nodes: {
          title: { x: 80, y: 110, fontSize: 52 },
          store: { x: 150, y: 480, scale: 0.8 },
        },
        safeInset: 36,
      },
    };
    const templates = new Map([["network-template.json", authored]]);
    const landscape = compileStoryPassage(plan, templates);
    const vertical = compileStoryPassage(plan, templates, {
      format: "vertical",
    });
    const before = baseline.beats[0]!;
    const wide = landscape.beats[0]!;
    const tall = vertical.beats[0]!;

    expect(wide.scene).toEqual(before.scene);
    expect(wide.cues).toEqual(before.cues);
    expect(wide.events).toEqual(before.events);
    expect(tall.scene).toMatchObject({
      format: "vertical",
      width: 1080,
      height: 1920,
      safeInset: 36,
    });
    expect(tall.scene.nodes.find((node) => node.id === "title")).toMatchObject({
      x: 80,
      y: 110,
      fontSize: 52,
    });
    expect(tall.scene.initialState?.store).toMatchObject({
      scaleX: 0.8,
      scaleY: 0.8,
    });
    expect(tall.cues).toEqual(wide.cues);
    expect(
      tall.events.map(({ id, start, end }) => ({ id, start, end })),
    ).toEqual(wide.events.map(({ id, start, end }) => ({ id, start, end })));
    expect(compileStoryScene(wide.scene).rendererVersion).toBe(
      compileStoryScene(before.scene).rendererVersion,
    );
    expect(compileStoryScene(tall.scene).rendererVersion).toBe(
      "story-canvas-0.20.0",
    );
    expect(passageBeatKey(wide.scene, "test-runtime")).toBe(
      passageBeatKey(before.scene, "test-runtime"),
    );
    expect(passageBeatKey(tall.scene, "test-runtime")).not.toBe(
      passageBeatKey(wide.scene, "test-runtime"),
    );
  });

  it("requires an explicit vertical override and keeps timing fields out of it", () => {
    const source = fixtureTemplate();
    const templates = new Map([["network-template.json", source]]);
    expect(
      inspectStoryPassage(fixturePlan(), templates, { format: "vertical" }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing-format-override" }],
    });
    expect(
      StorySceneSchema.safeParse({
        ...fixtureScene(),
        formats: { vertical: { events: [] } },
      }).success,
    ).toBe(false);
  });

  it("patches only existing camera keys and measured text line width", () => {
    const source = fixtureScene();
    source.motionGrammar = "v2";
    source.camera = {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1 },
        { frame: 191, x: 960, y: 540, zoom: 1 },
      ],
      depth: {},
    };
    source.formats = {
      vertical: { camera: { keys: [{ frame: 0, x: 540, y: 960 }] } },
    };
    const resolved = resolveStoryFormat(source, "vertical");
    expect(resolved.camera?.keys).toEqual([
      { frame: 0, x: 540, y: 960, zoom: 1 },
      { frame: 191, x: 960, y: 540, zoom: 1 },
    ]);
    expect(
      StorySceneSchema.safeParse({
        ...source,
        formats: { vertical: { camera: { keys: [{ frame: 10, x: 540 }] } } },
      }).success,
    ).toBe(false);

    const template = StoryTemplateSchema.parse(
      json("benchmarks/fixtures/story-authoring/comparison-template.json"),
    );
    template.formats = {
      vertical: { nodes: { reference: { lineWidth: 720, align: "center" } } },
    };
    const text = instantiateStoryTemplate(
      template,
      { title: "A narrower heading" },
      undefined,
      "vertical",
    ).nodes.find((node) => node.id === "reference");
    expect(text).toMatchObject({
      align: "center",
      textLayout: { width: 720 },
    });
  });

  it("fails with named text and subject diagnostics when configured zones overlap", () => {
    const source = fixtureScene();
    source.formats = {
      vertical: {
        safeZones: {
          interface: { x: 0, y: 0, width: 1080, height: 1920 },
        },
      },
    };
    const textScene = resolveStoryFormat(source, "vertical");
    expect(() => compileStoryScene(textScene)).toThrow(/safe zone interface/);

    const rendered = compileStoryScene(fixtureScene());
    const subject = rendered.nodes.find((node) => node.id === "house-a")!;
    const frame = rendered.frameCount - 1;
    const [x, y] = storyAnchorPosition(
      rendered,
      subject.id,
      [subject.width / 2, subject.height / 2],
      frame,
    );
    rendered.safeZones = {
      subject: { x: x - 5, y: y - 5, width: 10, height: 10 },
    };
    try {
      validateStorySafeZones(rendered, [subject.id]);
      throw new Error("Expected a safe-zone collision");
    } catch (error) {
      expect(error).toMatchObject({
        diagnostics: [{ code: "subject-in-safe-zone", node: subject.id }],
      });
    }
  });

  it("clamps around a configured exclusion zone or reports no valid offset", () => {
    const zone = { x: 50, y: 50, width: 50, height: 50 };
    expect(
      safeZoneOffset(
        { left: 60, top: 60, right: 80, bottom: 80 },
        [zone],
        0,
        200,
        200,
      ),
    ).toEqual([-30, 0]);
    expect(
      safeZoneOffset(
        { left: 40, top: 40, right: 160, bottom: 160 },
        [zone],
        0,
        200,
        200,
      ),
    ).toBeUndefined();
  });

  it("moves a safe-area constrained subject clear of a configured zone", () => {
    const source = fixtureScene();
    source.motionModel = "curves-1";
    source.authoringVersion = "1";
    const baseline = compileStoryScene(source);
    const subject = baseline.nodes.find((node) => node.id === "house-a")!;
    const center = storyAnchorPosition(
      baseline,
      subject.id,
      [subject.width, subject.height / 2],
      0,
    );
    source.safeZones = {
      edge: { x: center[0] - 5, y: center[1] - 5, width: 10, height: 10 },
    };
    source.constraints = [
      {
        type: "keep-in-safe-area",
        target: subject.id,
        inset: 0,
        clamp: true,
      },
    ];
    const constrained = compileStoryScene(StorySceneSchema.parse(source));
    const first = evaluatePreparedNode(constrained, subject, 0);
    const original = evaluatePreparedNode(baseline, subject, 0);
    expect(first.x).toBeLessThanOrEqual(original.x - 5);
  });
});
