import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  StoryAuthoringPlanSchema,
  StoryTemplateSchema,
} from "../../packages/scene-contract/src/story-authoring.ts";
import {
  compileStoryPassage,
  inspectStoryPassage,
  locatePassageFrame,
} from "../../packages/renderer-core/src/story-passage.ts";
import {
  indexStoryEvents,
  convertStoryFrame,
} from "../../packages/renderer-core/src/story-event-index.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  wrapStoryText,
  measureStoryText,
} from "../../packages/renderer-core/src/story-text-layout.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";
import {
  sampleStoryCamera,
  storyCameraBoundaryVelocity,
} from "../../packages/renderer-core/src/story-camera.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";

const scene = () =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion/unequal-margins.json",
        "utf8",
      ),
    ),
  );
const template = () =>
  StoryTemplateSchema.parse({
    schemaVersion: "story-template-1",
    id: "comparison",
    scene: scene(),
    slots: { title: { kind: "text", node: "reference", required: true } },
    textRoles: { reference: "heading" },
  });
const plan = () =>
  StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "test",
    title: "Engine fixture",
    fps: 24,
    sourceStartFrame: 0,
    styleProfile: { schemaVersion: "story-style-1", id: "neutral" },
    beats: [
      {
        id: "one",
        template: "template.json",
        purpose: "compare",
        takeaway: "Comparison",
        focus: ["house-a"],
        intensity: "develop",
        frameCount: 192,
        parameters: { title: "First comparison" },
        cues: [
          {
            id: "strain",
            phrase: "Pressure",
            frame: 48,
            events: ["shared-strain"],
          },
        ],
        bindings: {
          "shared-strain": {
            anchor: { type: "cue", id: "strain" },
            offset: 0,
            duration: 56,
          },
        },
      },
    ],
  });
const templates = () => new Map([["template.json", template()]]);

describe("shared passage authoring", () => {
  it("moves a connector, subject response and label from a single narration cue", async () => {
    const prepared = await readStoryPassage(
      "benchmarks/fixtures/story-authoring/linked-network.json",
    );
    const input = structuredClone(prepared.plan);
    input.beats[0]!.cues[0]!.frame = 18;
    const result = compileStoryPassage(input, prepared.templates);
    expect(result.beats[0]!.events.find((e) => e.id === "land")).toMatchObject({
      start: 18,
      end: 40,
    });
    for (const id of ["land-arrives", "land-settles", "land-label"])
      expect(result.beats[0]!.events.find((e) => e.id === id)).toMatchObject({
        start: 30,
        end: 48,
      });
    expect(result.frameCount).toBe(192);
  });
  it("locates a distant bound event at its narration cue and affected node", () => {
    const input = plan();
    input.beats[0]!.bindings["shared-strain"]!.offset = 12;
    const diagnostic = compileStoryPassage(input, templates()).diagnostics.find(
      (item) => item.code === "cue-distance",
    );
    expect(diagnostic).toMatchObject({
      code: "cue-distance",
      beat: "one",
      event: "shared-strain",
      node: "pressure-a",
      frame: 48,
    });
  });
  it("does not put failed edits in undo history and round-trips valid edits", () => {
    const editor = createPassageEditor(plan(), templates());
    const initial = structuredClone(editor.passage.plan);
    expect(() =>
      editor.edit((p) => {
        p.beats[0]!.cues[0]!.frame = 180;
      }),
    ).toThrow();
    expect(editor.canUndo).toBe(false);
    expect(editor.passage.plan).toEqual(initial);
    editor.edit((p) => {
      p.beats[0]!.cues[0]!.frame = 54;
    });
    expect(editor.undo().plan).toEqual(initial);
    expect(editor.redo().plan.beats[0]!.cues[0]!.frame).toBe(54);
  });
  it("preserves camera position and actual endpoint velocity or rejects an incompatible continuation", () => {
    const input = plan(),
      first = template(),
      second = template();
    for (const [i, t] of [first, second].entries()) {
      t.scene.motionGrammar = "v2";
      t.scene.camera = {
        keys: [
          { frame: 0, x: 960 + i * 10, y: 540, zoom: 1 },
          { frame: 191, x: 970 + i * 10, y: 540, zoom: 1 },
        ],
        depth: Object.fromEntries(
          t.scene.nodes.filter((n) => !n.parent).map((n) => [n.id, 0]),
        ),
        easeIn: false,
        easeOut: false,
      };
    }
    input.beats.push(structuredClone(input.beats[0]!));
    input.beats[1]!.id = "two";
    input.beats[1]!.template = "next.json";
    input.beats[1]!.handoff = {
      mode: "continue",
      camera: "carry",
      subjects: [],
    };
    const sources = new Map([
      ["template.json", first],
      ["next.json", second],
    ]);
    const result = compileStoryPassage(input, sources);
    expect(sampleStoryCamera(result.beats[0]!.scene, 191)).toEqual(
      sampleStoryCamera(result.beats[1]!.scene, 0),
    );
    expect(storyCameraBoundaryVelocity(result.beats[0]!.scene, "end")).toEqual(
      storyCameraBoundaryVelocity(result.beats[1]!.scene, "start"),
    );
    second.scene.camera!.keys[1]!.x = 950;
    expect(inspectStoryPassage(input, sources)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "incompatible-camera-velocity" }],
    });
  });
  it("indexes and retimes choreography, text and camera keys", () => {
    const source = template();
    source.scene.motionGrammar = "v2";
    source.scene.camera = {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1 },
        { frame: 80, x: 960, y: 540, zoom: 1 },
        { frame: 191, x: 960, y: 540, zoom: 1 },
      ],
      depth: {},
    };
    source.scene.recipe.entrances = [
      {
        node: "reference",
        verb: "wipe",
        window: { start: 0, end: 24, cue: "title-reveal" },
      },
    ];
    const input = plan();
    input.beats[0]!.bindings["@/camera/keys/1"] = {
      anchor: { type: "cue", id: "strain" },
      offset: 10,
      duration: 0,
    };
    input.beats[0]!.bindings["title-reveal"] = {
      anchor: { type: "cue", id: "strain" },
      offset: -48,
      duration: 24,
    };
    const result = compileStoryPassage(
      input,
      new Map([["template.json", source]]),
    );
    expect(
      result.beats[0]!.events.find((e) => e.id === "@/camera/keys/1"),
    ).toMatchObject({ kind: "camera", start: 58, end: 58 });
    expect(
      result.beats[0]!.events.find((e) => e.id === "title-reveal"),
    ).toMatchObject({ kind: "text-reveal", start: 0, end: 24 });
    source.scene.recipe.moves = [
      { node: "house-a", window: { start: 90, end: 120 }, to: { x: 500 } },
      { node: "house-a", window: { start: 100, end: 130 }, to: { x: 550 } },
    ];
    expect(
      inspectStoryPassage(input, new Map([["template.json", source]])),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "property-conflict", node: "house-a" }],
    });
  });
  it("retimes flow windows through the exclusive beat end and binds exact category cuts", () => {
    const input = plan(),
      source = template();
    source.scene.motionGrammar = "v2";
    source.scene.flows = [
      {
        id: "current",
        path: "pressure-a",
        direction: 1,
        count: 1,
        shape: "dot",
        size: 3,
        color: "#123456",
        window: { start: 0, end: 192, cue: "current" },
        speed: [{ frame: 0, pxPerFrame: 1 }],
      },
    ];
    input.beats[0]!.bindings.current = {
      anchor: { type: "cue", id: "strain" },
      offset: 0,
      duration: 144,
    };
    const output = compileStoryPassage(
      input,
      new Map([["template.json", source]]),
    );
    expect(
      output.beats[0]!.events.find((e) => e.id === "current"),
    ).toMatchObject({ start: 48, end: 192, endExclusive: true });
    const swap = StorySceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/story-motion/category-swap.json",
          "utf8",
        ),
      ),
    );
    if (swap.recipe.preset !== "category_swap")
      throw new Error("Wrong fixture");
    const beat = input.beats[0]!;
    beat.parameters = {};
    beat.focus = [swap.recipe.subject];
    beat.cues[0]!.events = ["@swap"];
    beat.bindings = {
      "@swap": {
        anchor: { type: "cue", id: "strain" },
        offset: 0,
        duration: 0,
      },
    };
    expect(
      compileStoryPassage(
        input,
        new Map([["template.json", swap]]),
      ).beats[0]!.events.find((e) => e.id === "@swap"),
    ).toMatchObject({ start: 48, end: 48, endExclusive: false });
  });
  it("retimes a cue and dependent label atomically without changing a template", () => {
    const input = plan(),
      sources = templates(),
      original = structuredClone(sources);
    const label = indexStoryEvents(scene()).find((e) => e.id === "less-room")!;
    expect(label).toBeDefined();
    input.beats[0]!.bindings[label.id] = {
      anchor: { type: "event", id: "shared-strain", edge: "end" },
      offset: 1,
      duration: 16,
    };
    input.beats[0]!.cues[0]!.frame = 54;
    const output = compileStoryPassage(input, sources);
    expect(
      output.beats[0]!.events.find((e) => e.id === "shared-strain"),
    ).toMatchObject({ start: 54, end: 110 });
    expect(
      output.beats[0]!.events.find((e) => e.id === label.id),
    ).toMatchObject({ start: 111, end: 127 });
    expect(output.frameCount).toBe(192);
    expect(sources).toEqual(original);
    const valid = JSON.stringify(input);
    input.beats[0]!.cues[0]!.frame = 180;
    expect(inspectStoryPassage(input, sources)).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "event-out-of-range", beat: "one", event: "shared-strain" },
      ],
    });
    expect(sources).toEqual(original);
    expect(compileStoryPassage(JSON.parse(valid), sources).frameCount).toBe(
      192,
    );
  });
  it("reports cycles, missing cues and duplicate timing ownership with locations", () => {
    const input = plan();
    input.beats[0]!.bindings["shared-strain"]!.anchor = {
      type: "event",
      id: "shared-strain",
      edge: "end",
    };
    expect(inspectStoryPassage(input, templates())).toMatchObject({
      ok: false,
      diagnostics: [{ code: "timing-cycle", beat: "one" }],
    });
    input.beats[0]!.bindings["shared-strain"]!.anchor = {
      type: "cue",
      id: "missing",
    };
    expect(inspectStoryPassage(input, templates())).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing-cue" }],
    });
    input.beats[0]!.timing["shared-strain"] = { start: 48, end: 104 };
    expect(inspectStoryPassage(input, templates()).ok).toBe(false);
  });
  it.each([24, 30] as const)(
    "keeps exact frame and boundary semantics at %i fps",
    (fps) => {
      const input = plan(),
        sources = templates();
      input.fps = fps;
      sources.get("template.json")!.scene.fps = fps;
      const output = compileStoryPassage(input, sources);
      expect(locatePassageFrame(output, 191).frame).toBe(191);
      expect(() => locatePassageFrame(output, 192)).toThrow();
      expect(convertStoryFrame(48, 24, 30)).toBe(60);
      expect(convertStoryFrame(-2, 24, 30)).toBe(-3);
    },
  );
  it("reuses slots with two content sets and style profiles and rejects unknown slots", () => {
    for (const [title, color] of [
      ["One", "#123456"],
      ["Two", "#654321"],
    ]) {
      const input = plan();
      input.beats[0]!.parameters.title = title;
      input.styleProfile.text = { heading: { color: color! } };
      const output = compileStoryPassage(input, templates());
      expect(
        output.beats[0]!.scene.nodes.find((n) => n.id === "reference"),
      ).toMatchObject({ text: title, color, textRole: "heading" });
    }
    const input = plan();
    input.beats[0]!.parameters.unknown = "No";
    expect(inspectStoryPassage(input, templates())).toMatchObject({
      ok: false,
      diagnostics: [{ code: "unknown-parameter" }],
    });
    delete input.beats[0]!.parameters.unknown;
    delete input.beats[0]!.parameters.title;
    expect(inspectStoryPassage(input, templates())).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing-parameter" }],
    });
  });
  it("preserves authored safe inset and line height until the style explicitly overrides them", () => {
    const input = plan();
    const source = template();
    source.scene.safeInset = 64;
    const heading = source.scene.nodes.find((node) => node.id === "reference");
    if (heading?.type !== "text") throw new Error("Missing heading");
    heading.textLayout = {
      width: 600,
      height: 220,
      lineHeight: 1.7,
      overflow: "error",
    };
    const sources = new Map([["template.json", source]]);
    const inherited = compileStoryPassage(input, sources).beats[0]!.scene;
    expect(inherited.safeInset).toBe(64);
    expect(
      inherited.nodes.find((node) => node.id === "reference"),
    ).toMatchObject({ textLayout: { lineHeight: 1.7 } });

    input.styleProfile.safeInset = 24;
    input.styleProfile.lineHeight = 2;
    const overridden = compileStoryPassage(input, sources).beats[0]!.scene;
    expect(overridden.safeInset).toBe(24);
    expect(
      overridden.nodes.find((node) => node.id === "reference"),
    ).toMatchObject({ textLayout: { lineHeight: 2 } });
  });
  it("preserves historical evidence requirements while allowing general plans", () => {
    const input = plan();
    expect(compileStoryPassage(input, templates()).frameCount).toBe(192);
    input.contentPolicy = "historical";
    expect(inspectStoryPassage(input, templates()).ok).toBe(false);
  });
  it("carries root state across beats and explicitly resets it on a later cut", () => {
    const input = plan();
    input.beats.push(
      structuredClone(input.beats[0]!),
      structuredClone(input.beats[0]!),
    );
    input.beats[1]!.id = "two";
    input.beats[2]!.id = "three";
    input.beats[1]!.handoff = {
      mode: "continue",
      camera: "reset",
      subjects: [
        {
          id: "house",
          from: "house-a",
          to: "house-a",
          mode: "carry",
          properties: ["x", "y", "opacity", "scaleX", "scaleY"],
        },
      ],
    };
    input.beats[2]!.handoff.mode = "reset";
    const output = compileStoryPassage(input, templates());
    const sample = (beat: number, frame: number) => {
      const compiled = compileStoryScene(output.beats[beat]!.scene);
      return evaluatePreparedNode(
        compiled,
        compiled.nodes.find((n) => n.id === "house-a")!,
        frame,
      );
    };
    const end = sample(0, 191),
      start = sample(1, 0);
    expect(start.opacity).toBe(end.opacity);
    expect(start.y).toBe(end.y);
    expect(output.beats[2]!.scene.initialState).toBeUndefined();
    expect(sample(1, 0)).toEqual(start);
    expect(locatePassageFrame(output, 192).beat.id).toBe("two");
    expect(output.frameCount).toBe(576);
  });
  it("measures wrapping and rejects overflow without truncating authored text", () => {
    expect(wrapStoryText("one two three", 7, (s) => s.length)).toEqual([
      "one two",
      "three",
    ]);
    const text = scene().nodes.find((n) => n.type === "text")!;
    if (text.type !== "text") throw new Error("Missing text");
    text.textLayout = {
      width: 50,
      height: 10,
      lineHeight: 1.2,
      overflow: "error",
    };
    expect(() =>
      measureStoryText(text, "Too much text", (s) => s.length * 10),
    ).toThrow(/layout box/);
    text.textLayout.overflow = "clip";
    expect(
      measureStoryText(text, "Too much text", (s) => s.length * 10).overflow,
    ).toBe(true);
  });
});
