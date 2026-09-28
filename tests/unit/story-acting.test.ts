import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StoryTemplateSchema,
  StoryAuthoringPlanSchema,
} from "../../packages/scene-contract/src/story-authoring.ts";
import { TextContainerSchema } from "../../packages/scene-contract/src/story-acting.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";
import { sampleComponentState } from "../../packages/renderer-core/src/component-state.ts";
import { textContainerBounds } from "../../packages/renderer-core/src/text-container.ts";
import { imagePlacement } from "../../packages/renderer-core/src/node-transform.ts";
import { characterPoseBrief } from "../../packages/renderer-core/src/story-acting.ts";

function fixture() {
  const template = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/parcel-story/image-model/wrong-door.json",
      "utf8",
    ),
  );
  const actor = template.scene.nodes.find(
    (n: { id: string }) => n.id === "nora",
  );
  actor.states = [
    { asset: "nora", pose: "rest" },
    { asset: "nora", pose: "gesture" },
  ];
  const plan = StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "acting",
    title: "Acting",
    fps: 24,
    sourceStartFrame: 0,
    styleProfile: { schemaVersion: "story-style-1", id: "neutral" },
    beats: [
      {
        id: "one",
        template: "scene",
        purpose: "show-change",
        takeaway: "A gesture",
        focus: ["nora"],
        intensity: "develop",
        frameCount: 204,
        cues: [
          {
            id: "gesture",
            phrase: "A gesture",
            frame: 40,
            events: ["actor-gesture"],
          },
          { id: "rest", phrase: "Rest", frame: 90, events: [] },
        ],
        textContainers: { title: { kind: "caption" } },
        poseTracks: {
          nora: {
            initial: "rest",
            changes: [
              {
                id: "actor-gesture",
                pose: "gesture",
                anchor: { type: "cue", id: "gesture" },
                blendFrames: 2,
              },
              {
                id: "actor-rest",
                pose: "rest",
                anchor: { type: "cue", id: "rest" },
              },
            ],
          },
        },
      },
    ],
    audio: {
      schemaVersion: "passage-audio-1",
      assets: [
        { id: "tap", path: "tap.wav", sha256: "sha256:" + "a".repeat(64) },
      ],
      sounds: [
        {
          id: "tap",
          beat: "one",
          asset: "tap",
          anchor: { type: "event", id: "actor-gesture", edge: "start" },
          durationFrames: 10,
        },
      ],
    },
  });
  return { plan, template: StoryTemplateSchema.parse(template) };
}
function editor() {
  const { plan, template } = fixture();
  return createPassageEditor(plan, new Map([["scene", template]]));
}

describe("text containers and character acting", () => {
  it("compiles named poses into frame-exact state changes, retimes sound, and preserves undo", () => {
    const e = editor();
    const schedule = () => {
      const data = e.passage.beats[0]!.scene.componentData!;
      if (data.schemaVersion === "scene-components-1")
        throw new Error("Expected pose schedules");
      return data.states.find((s) => s.target === "nora")!;
    };
    expect(sampleComponentState(schedule(), 39)).toBe(0);
    expect(sampleComponentState(schedule(), 40)).toBe(1);
    expect(sampleComponentState(schedule(), 90)).toBe(0);
    expect(schedule().cuts[0]!.ramp).toBe(2);
    expect(e.passage.audio!.sounds[0]!.start).toBe(40);
    e.edit((p) => {
      p.beats[0]!.cues[0]!.frame = 55;
    });
    expect(schedule().cuts[0]!.frame).toBe(55);
    expect(e.passage.audio!.sounds[0]!.start).toBe(55);
    e.undo();
    expect(schedule().cuts[0]!.frame).toBe(40);
    e.redo();
    expect(schedule().cuts[0]!.frame).toBe(55);
  });
  it("supports a static initial pose and rejects unknown poses or competing state ownership atomically", () => {
    const e = editor(),
      before = structuredClone(e.passage.plan);
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.poseTracks!.nora!.initial = "missing";
      }),
    ).toThrow(/pose/i);
    expect(e.passage.plan).toEqual(before);
    e.edit((p) => {
      if (p.schemaVersion === "story-passage-2")
        p.beats[0]!.poseTracks!.nora = { initial: "gesture", changes: [] };
      p.beats[0]!.cues[0]!.events = [];
      if (p.schemaVersion === "story-passage-2") p.audio = undefined;
    });
    const states = e.passage.beats[0]!.scene.componentData!;
    expect(
      states.schemaVersion !== "scene-components-1" &&
        states.states.find((s) => s.target === "nora")!.initial,
    ).toBe(1);
    const { plan, template } = fixture();
    if (template.scene.componentData?.schemaVersion !== "scene-components-1")
      template.scene.componentData!.states.push({
        id: "other",
        target: "nora",
        initial: 0,
        cuts: [],
      });
    expect(() =>
      createPassageEditor(plan, new Map([["scene", template]])),
    ).toThrow(/ownership/i);
  });
  it("rejects duplicate names, colliding cuts, out-of-range cues and duplicate timing owners", () => {
    const { template } = fixture();
    const n = template.scene.nodes.find((n) => n.id === "nora")!;
    if (n.type === "image") n.states[1]!.pose = "rest";
    expect(() => StoryTemplateSchema.parse(template)).toThrow(/pose/i);
    const e = editor();
    expect(() =>
      e.edit((p) => {
        p.beats[0]!.cues[1]!.frame = 40;
      }),
    ).toThrow(/increasing/i);
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.poseTracks!.nora!.changes[0]!.offset = -100;
      }),
    ).toThrow(/outside/i);
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.bindings["actor-gesture"] = {
            anchor: { type: "cue", id: "gesture" },
            offset: 0,
            duration: 0,
          };
      }),
    ).toThrow(/ownership/i);
  });
  it("keeps text containers in the compiled scene and lets a beat remove a template default", () => {
    const e = editor();
    expect(
      e.passage.beats[0]!.scene.nodes.find((n) => n.id === "title"),
    ).toHaveProperty("container.kind", "caption");
    e.edit((p) => {
      if (p.schemaVersion === "story-passage-2")
        p.beats[0]!.textContainers!.title = null;
    });
    expect(
      e.passage.beats[0]!.scene.nodes.find((n) => n.id === "title"),
    ).not.toHaveProperty("container");
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.textContainers!.nora = TextContainerSchema.parse({
            kind: "speech",
          });
      }),
    ).toThrow(/text node/i);
  });
  it("accounts for padding, stroke and directional tails in layout bounds", () => {
    const container = TextContainerSchema.parse({
      kind: "speech",
      padding: 16,
      strokeWidth: 2,
      tail: { side: "bottom", position: 0.3, length: 24 },
    });
    expect(
      textContainerBounds({ x: -100, y: 0, width: 200, height: 48 }, container),
    ).toEqual({ x: -117, y: -17, width: 234, height: 106 });
    expect(() =>
      TextContainerSchema.parse({ kind: "thought", padding: -1 }),
    ).toThrow();
  });
  it("registers different source foot anchors at the same node baseline", () => {
    const node = { width: 400, height: 600, fit: "contain" as const };
    const a = imagePlacement(node, [0, 0, 1000, 1600], [0.55, 0.97]);
    const b = imagePlacement(node, [0, 0, 900, 1500], [0.45, 0.96]);
    expect(a.x + a.width * 0.55).toBe(200);
    expect(b.x + b.width * 0.45).toBe(200);
    expect(a.y + a.height * 0.97).toBe(600);
    expect(b.y + b.height * 0.96).toBe(600);
  });
  it("creates a reusable generation brief from a named pose library", () => {
    const { template } = fixture();
    const node = template.scene.nodes.find((n) => n.id === "nora")!;
    if (node.type !== "image") throw new Error("Expected image");
    const brief = characterPoseBrief(node, template.scene.assets);
    expect(brief).toContain("gesture");
    expect(brief).toContain("transparent");
    expect(brief).toContain("reference");
    expect(brief).toContain("nora.png");
  });
});
