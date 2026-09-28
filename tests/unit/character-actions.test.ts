import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StoryAuthoringPlanSchema,
  StoryTemplateSchema,
} from "../../packages/scene-contract/src/story-authoring.ts";
import { createPassageEditor } from "../../packages/renderer-core/src/passage-editor.ts";
import { ComponentDataV3Schema } from "../../packages/scene-contract/src/component-data.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { poseAnchorPoint } from "../../packages/renderer-core/src/story-props.ts";
import {
  nodeMatrix,
  transformPoint,
} from "../../packages/renderer-core/src/node-transform.ts";

function input() {
  const raw = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/parcel-story/image-model/wrong-door.json",
      "utf8",
    ),
  );
  raw.scene.recipe = {
    preset: "generic",
    moves: [],
    entrances: [],
    exits: [],
    emphasis: [],
  };
  delete raw.scene.componentData;
  delete raw.scene.camera;
  const actor = raw.scene.nodes.find((n: { id: string }) => n.id === "nora");
  actor.states = [
    "idle",
    "step-a",
    "step-b",
    "knock",
    "offer",
    "receive",
    "react",
  ].map((pose, i) => ({
    asset: "nora",
    pose,
    registration: { anchor: [0.52, 0.96] },
    anchors: { hand: [0.7 + i * 0.015, 0.3 + i * 0.012] },
  }));
  raw.scene.nodes.push({
    ...structuredClone(actor),
    id: "other",
    x: 1100,
    rotation: 7,
  });
  const template = StoryTemplateSchema.parse(raw);
  const plan = StoryAuthoringPlanSchema.parse({
    schemaVersion: "story-passage-2",
    id: "actions",
    title: "Actions",
    fps: 24,
    sourceStartFrame: 0,
    styleProfile: { schemaVersion: "story-style-1", id: "neutral" },
    beats: [
      {
        id: "one",
        template: "scene",
        purpose: "show-change",
        takeaway: "A coordinated action",
        focus: ["nora"],
        intensity: "develop",
        frameCount: 204,
        cues: [
          { id: "go", phrase: "go", frame: 40, events: [] },
          { id: "release", phrase: "release", frame: 100, events: [] },
        ],
        poseTracks: { nora: { initial: "idle", changes: [] } },
        actions: [
          {
            id: "walk-home",
            actor: "nora",
            kind: "walk",
            anchor: { type: "cue", id: "go" },
            durationFrames: 24,
            poses: ["step-a", "step-b"],
            stepFrames: 6,
            finishPose: "idle",
            to: [650, 300],
          },
        ],
        propTracks: {
          parcel: {
            grip: [0.5, 0.9],
            initial: { actor: "nora", anchor: "hand" },
            changes: [],
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
          anchor: { type: "event", id: "walk-home", edge: "start" },
          durationFrames: 10,
        },
      ],
    },
  });
  return { plan, template };
}
function editor() {
  const { plan, template } = input();
  return createPassageEditor(plan, new Map([["scene", template]]));
}
function sample(e: ReturnType<typeof editor>, id: string, frame: number) {
  const scene = compileStoryScene(e.passage.beats[0]!.scene);
  return evaluatePreparedNode(
    scene,
    scene.nodes.find((n) => n.id === id)!,
    frame,
  );
}

describe("reusable character actions and held props", () => {
  it("rejects a cycle through an existing component pin before sampling", () => {
    const e = editor(),
      scene = structuredClone(e.passage.beats[0]!.scene);
    delete scene.motionModel;
    scene.componentData = ComponentDataV3Schema.parse({
      ...scene.componentData,
      schemaVersion: "scene-components-3",
      pins: [
        {
          id: "backlink",
          target: "nora",
          anchor: {
            node: "parcel",
            space: "node",
            point: [0, 0],
            offset: [0, 0],
          },
        },
      ],
    });
    expect(() => compileStoryScene(scene)).toThrow(/cycle/i);
  });
  it("keeps unattached props at an authored initial-state override", () => {
    const { plan, template } = input();
    plan.beats[0]!.propTracks!.parcel!.initial = null;
    template.scene.initialState = { parcel: { x: 620, y: 720 } };
    const e = createPassageEditor(plan, new Map([["scene", template]]));
    expect(sample(e, "parcel", 0)).toMatchObject({ x: 620, y: 720 });
  });
  it("interpolates registered hand anchors across a short pose blend", () => {
    const { plan, template } = input(),
      beat = plan.beats[0]!;
    beat.actions = [];
    plan.audio = undefined;
    beat.poseTracks!.nora!.changes = [
      {
        id: "blend",
        pose: "knock",
        anchor: { type: "cue", id: "go" },
        offset: 0,
        blendFrames: 2,
      },
    ];
    const e = createPassageEditor(plan, new Map([["scene", template]]));
    const a = sample(e, "parcel", 40),
      m = sample(e, "parcel", 41),
      b = sample(e, "parcel", 42);
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 8);
    expect(m.y).toBeCloseTo((a.y + b.y) / 2, 8);
  });
  it("coordinates alternating poses, travel and sound from one retimeable action", () => {
    const e = editor();
    expect(
      e.passage.beats[0]!.events.find((e) => e.id === "walk-home"),
    ).toMatchObject({ start: 40, end: 64 });
    expect(
      [39, 40, 46, 52, 58, 64].map((f) => sample(e, "nora", f).state),
    ).toEqual([0, 1, 2, 1, 2, 0]);
    expect(sample(e, "nora", 64).x).toBe(650);
    expect(e.passage.audio!.sounds[0]!.start).toBe(40);
    e.edit((p) => {
      p.beats[0]!.cues[0]!.frame = 55;
    });
    expect(sample(e, "nora", 55).state).toBe(1);
    expect(sample(e, "nora", 79).x).toBe(650);
    expect(e.passage.audio!.sounds[0]!.start).toBe(55);
    e.undo();
    expect(sample(e, "nora", 40).state).toBe(1);
    e.redo();
    expect(sample(e, "nora", 54).state).toBe(0);
  });
  it("keeps the prop grip on the current pose's hand while walking and rotating", () => {
    const e = editor(),
      scene = compileStoryScene(e.passage.beats[0]!.scene),
      prop = scene.nodes.find((n) => n.id === "parcel")!;
    for (const frame of [0, 39, 40, 45, 46, 51, 52, 63, 64, 100]) {
      const point = poseAnchorPoint(
        scene,
        { actor: "nora", anchor: "hand", offset: [0, 0] },
        frame,
      );
      const grip = transformPoint(
        nodeMatrix(prop, evaluatePreparedNode(scene, prop, frame)),
        [prop.width * 0.5, prop.height * 0.9],
      );
      expect(grip[0]).toBeCloseTo(point[0], 8);
      expect(grip[1]).toBeCloseTo(point[1], 8);
    }
  });
  it("transfers between moving hands, releases at the last held position and seeks deterministically", () => {
    const { plan, template } = input();
    const beat = plan.beats[0]!;
    beat.actions = [];
    beat.propTracks!.parcel!.changes = [
      {
        id: "give",
        anchor: { type: "cue", id: "go" },
        offset: 0,
        hold: { actor: "other", anchor: "hand", offset: [0, 0] },
        transitionFrames: 12,
      },
      {
        id: "drop",
        anchor: { type: "cue", id: "release" },
        offset: 0,
        hold: null,
        transitionFrames: 0,
      },
    ];
    plan.audio = undefined;
    template.scene.recipe.moves.push({
      node: "other",
      window: { start: 0, end: 180 },
      to: { x: 1400 },
    });
    const e = createPassageEditor(plan, new Map([["scene", template]]));
    const before = sample(e, "parcel", 40),
      middle = sample(e, "parcel", 46),
      after = sample(e, "parcel", 52);
    expect(middle.x).toBeGreaterThan(before.x);
    expect(middle.x).toBeLessThan(after.x);
    expect(sample(e, "parcel", 160).x).toBeCloseTo(
      sample(e, "parcel", 99).x,
      8,
    );
    expect(sample(e, "parcel", 46)).toEqual(middle);
  });
  it("rejects missing hand anchors, overlapping actions and competing prop movement", () => {
    const e = editor();
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.propTracks!.parcel!.initial!.anchor = "absent";
      }),
    ).toThrow(/anchor/i);
    expect(() =>
      e.edit((p) => {
        if (p.schemaVersion === "story-passage-2")
          p.beats[0]!.actions!.push({
            ...p.beats[0]!.actions![0]!,
            id: "overlap",
          });
      }),
    ).toThrow(/overlap|increasing/i);
    const { plan, template } = input();
    template.scene.recipe.moves.push({
      node: "parcel",
      window: { start: 0, end: 20 },
      to: { x: 900 },
    });
    expect(() =>
      createPassageEditor(plan, new Map([["scene", template]])),
    ).toThrow(/prop.*ownership/i);
  });
  it("keeps actions and prop transfers inside the authored beat during a crossfade", () => {
    const { plan, template } = input();
    const first = plan.beats[0]!;
    const second = structuredClone(first);
    plan.transitionModel = "joins-1";
    plan.audio = undefined;
    first.cues[0]!.frame = 180;
    first.cues[1]!.frame = 190;
    second.id = "two";
    second.actions = [];
    second.propTracks = undefined;
    second.poseTracks = undefined;
    second.handoff = {
      mode: "crossfade",
      frames: 20,
      camera: "reset",
      subjects: [],
    };
    plan.beats.push(second);
    const compile = () =>
      createPassageEditor(plan, new Map([["scene", template]]));

    first.actions![0]!.durationFrames = 23;
    expect(compile().passage.beats[0]!.scene.frameCount).toBe(224);
    first.actions![0]!.durationFrames = 24;
    expect(compile).toThrow(/action outside beat/i);

    first.actions = [];
    first.propTracks!.parcel!.changes = [
      {
        id: "give",
        anchor: { type: "cue", id: "release" },
        offset: 0,
        hold: { actor: "other", anchor: "hand", offset: [0, 0] },
        transitionFrames: 13,
      },
    ];
    expect(compile().passage.beats[0]!.scene.frameCount).toBe(224);
    first.propTracks!.parcel!.changes[0]!.transitionFrames = 14;
    expect(compile).toThrow(/prop transition outside beat/i);
  });
  it.each(["knock", "offer", "receive", "react"] as const)(
    "holds and settles a %s action",
    (kind) => {
      const { plan, template } = input();
      plan.beats[0]!.actions = [
        {
          id: "gesture",
          actor: "nora",
          kind,
          anchor: { type: "cue", id: "go" },
          offset: 0,
          durationFrames: 12,
          pose: kind,
          finishPose: "idle",
        },
      ];
      plan.audio = undefined;
      const e = createPassageEditor(plan, new Map([["scene", template]]));
      expect(sample(e, "nora", 40).state).toBeGreaterThan(2);
      expect(sample(e, "nora", 51).state).toBe(sample(e, "nora", 40).state);
      expect(sample(e, "nora", 52).state).toBe(0);
    },
  );
});
