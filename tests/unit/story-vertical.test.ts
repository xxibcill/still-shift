import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import { StoryTemplateSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { resolveStoryFormat } from "../../packages/renderer-core/src/story-template.ts";
import {
  lintVertical,
  proposeVerticalLayout,
} from "../../packages/renderer-core/src/story-vertical.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { measureStoryText } from "../../packages/renderer-core/src/story-text-layout.ts";

const json = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;
const source = () =>
  StorySceneSchema.parse(
    json("benchmarks/fixtures/story-passages/templates/unequal-margins.json"),
  );
const proposed = (scene: StoryScene) => {
  scene.formats = { vertical: proposeVerticalLayout(scene) };
  return resolveStoryFormat(scene, "vertical");
};

describe("vertical story proposal and lint", () => {
  it("suggests deterministic geometry while preserving every event and camera frame", () => {
    const scene = source();
    scene.motionGrammar = "v2";
    scene.camera = {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1.8 },
        { frame: scene.frameCount - 1, x: 960, y: 540, zoom: 1.8 },
      ],
      depth: {},
    };
    const before = structuredClone(scene.recipe);
    const first = proposeVerticalLayout(scene);
    expect(first).toEqual(proposeVerticalLayout(scene));
    expect(scene.recipe).toEqual(before);
    expect(first.camera?.keys.map((key) => key.frame)).toEqual([
      0,
      scene.frameCount - 1,
    ]);
    expect(first.camera?.keys[0]?.zoom).toBeGreaterThanOrEqual(1);
    expect(first.nodes?.["common-ground"]?.scale).toBeLessThan(1);
    const tall = proposed(scene);
    const houses = ["house-a", "house-b"].map((id) =>
      tall.nodes.find((node) => node.id === id),
    );
    expect(houses[0]?.width).toBe(houses[1]?.width);
    expect(houses[0]?.y).toBe(houses[1]?.y);
    expect(tall.recipe).toEqual(before);
    expect(
      lintVertical(tall).every((diagnostic) => diagnostic.frame !== undefined),
    ).toBe(true);
  });

  it("collects independent overflow, small subject and relationship issues", () => {
    const scene = proposed(source());
    const title = scene.nodes.find((node) => node.id === "reference")!;
    title.x = 1020;
    const house = scene.nodes.find((node) => node.id === "house-a")!;
    house.width = 20;
    house.height = 20;
    const other = scene.nodes.find((node) => node.id === "house-b")!;
    other.width = 20;
    other.height = 20;
    const diagnostics = lintVertical(scene, { focusIds: ["house-a"] });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "text-outside-safe-area",
        "subject-too-small",
        "relationship-outside-frame",
      ]),
    );
  });

  it("catches unannotated standalone subjects outside the vertical frame", () => {
    const scene = proposed(source());
    const house = scene.nodes.find((node) => node.id === "house-a")!;
    house.x = -1000;
    expect(scene.safeZones).toBeUndefined();
    expect(scene.review?.focalGroups).toBeUndefined();

    expect(lintVertical(scene)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "subject-outside-frame",
          node: "house-a",
        }),
      ]),
    );
  });

  it("continues geometry lint after camera coverage fails", () => {
    const scene = proposed(source());
    scene.motionGrammar = "v2";
    scene.camera = {
      keys: [
        { frame: 0, x: 540, y: 960, zoom: 1 },
        { frame: scene.frameCount - 1, x: 540, y: 960, zoom: 1 },
      ],
      depth: {},
      cover: ["house-a"],
    };
    for (const id of ["house-a", "house-b"]) {
      const house = scene.nodes.find((node) => node.id === id)!;
      house.width = 20;
      house.height = 20;
    }
    const diagnostics = lintVertical(scene, { focusIds: ["house-a"] });
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-scene",
          message: expect.stringContaining("Camera exposes uncovered edge"),
        }),
        expect.objectContaining({ code: "subject-too-small", node: "house-a" }),
      ]),
    );
  });

  it("reports usable geometry alongside a contract error", () => {
    const scene = proposed(source());
    const house = scene.nodes.find((node) => node.id === "house-a")!;
    house.width = 20;
    house.height = 20;
    const diagnostics = lintVertical(scene, { focusIds: ["house-a"] });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["invalid-contract", "subject-too-small"]),
    );
  });

  it("requires a measured text box when vertical safe zones exist", () => {
    const scene = source();
    scene.formats = {
      vertical: {
        safeZones: {
          controls: { x: 900, y: 90, width: 100, height: 100 },
        },
      },
    };
    const title = scene.nodes.find((node) => node.id === "reference")!;
    if (title.type !== "text") throw new Error("Missing text fixture");
    title.text = "ＷＷＷ";
    try {
      compileStoryScene(resolveStoryFormat(scene, "vertical"));
      throw new Error("Expected unmeasured text to fail");
    } catch (error) {
      expect(
        passageDiagnostics(error).some(
          (d) => d.code === "text-unmeasured-safe-zone",
        ),
      ).toBe(true);
    }
    title.textLayout = {
      width: 80,
      height: 200,
      lineHeight: 1.2,
      overflow: "clip",
    };
    expect(() =>
      compileStoryScene(resolveStoryFormat(scene, "vertical")),
    ).toThrow(/overflow error/);
    title.textLayout.overflow = "error";
    expect(() =>
      measureStoryText(title, "WWWWWWWWWW", (value) => value.length * 30),
    ).toThrow(/Text exceeds its layout box/);
  });

  it("infers standalone image subjects without passage focus metadata", () => {
    const scene = source();
    scene.authoringVersion = "1";
    for (const node of scene.nodes)
      if (node.type === "text")
        node.textLayout = {
          width: 240,
          height: 110,
          lineHeight: 1.2,
          overflow: "error",
        };
    scene.formats = {
      vertical: {
        nodes: {
          "house-a": { x: 200, y: 400 },
          "house-b": { y: 400 },
        },
        safeZones: {
          controls: { x: 300, y: 500, width: 80, height: 80 },
        },
      },
    };
    try {
      compileStoryScene(resolveStoryFormat(scene, "vertical"));
      throw new Error("Expected a subject collision");
    } catch (error) {
      expect(passageDiagnostics(error)).toMatchObject([
        { code: "subject-in-safe-zone", node: "house-a" },
      ]);
    }
  });

  it("switches a workbench between authored formats without dropping plan edits", () => {
    const template = StoryTemplateSchema.parse(
      json(
        "benchmarks/fixtures/story-authoring/vertical/network-template.json",
      ),
    );
    const plan = json(
      "benchmarks/fixtures/story-authoring/vertical/linked-network.json",
    );
    const editor = createPassageEditor(
      plan,
      new Map([["network-template.json", template]]),
    );
    const baseline = editor.passage.plan;
    editor.setFormat("vertical");
    expect(editor.passage.beats[0]?.scene.format).toBe("vertical");
    expect(
      lintVertical(editor.passage.beats[0]!.scene, {
        focusIds: editor.passage.beats[0]!.focus,
      }),
    ).toEqual([]);
    editor.setFormat("landscape");
    expect(editor.passage.plan).toEqual(baseline);
    expect(editor.passage.beats[0]?.scene.format).toBeUndefined();
  });
});
