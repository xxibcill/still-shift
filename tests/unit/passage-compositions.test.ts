import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  StoryAuthoringPlanSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { parsePassageTemplate } from "../../packages/renderer-core/src/story-template.ts";
import { validatePassageCompositions } from "../../packages/animation-engine/src/passage-compositions.ts";
import { passageCompositionKey } from "../../packages/animation-engine/src/passage-cache.ts";
import type { PreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import type { CompiledPassageAudio } from "../../packages/renderer-core/src/passage-audio.ts";

const composition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "native",
  width: 1920,
  height: 1080,
  fps: 24,
  frameCount: 192,
  assets: [],
  layers: [
    {
      id: "panel",
      type: "solid",
      size: [200, 200],
      color: "#123456",
      blendMode: "multiply",
    },
  ],
});
const passage = () =>
  ({
    beats: [
      {
        id: "beat",
        scene: { width: 1920, height: 1080, fps: 24, frameCount: 192 },
        handoff: { mode: "cut", camera: "reset", subjects: [] },
      },
    ],
  }) as unknown as Pick<PreparedPassage, "beats">;

function evidencePicture() {
  const story = passage();
  const qualification = "Symbolic illustration";
  story.beats[0]!.evidence = {
    kind: "symbolic",
    node: "qualifier",
    qualification,
  };
  const layer: Extract<Composition["layers"][number], { type: "text" }> = {
    id: "qualifier",
    type: "text",
    text: qualification,
    fontSize: 32,
    color: "#ffffff",
    fontAsset: "font",
  };
  const input = composition();
  input.assets = [
    {
      id: "font",
      type: "font",
      path: "font.woff2",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "400",
    },
  ];
  input.layers = [layer];
  input.metadata = { passage: { subjectLayers: { qualifier: "qualifier" } } };
  return { story, input, layer, qualification };
}

describe("native composition passage beats", () => {
  it.each(["reset", "enter", "exit"] as const)(
    "requires handoff-only subjects and validates native %s boundaries",
    (mode) => {
      const fixture = (name: string) =>
        JSON.parse(
          readFileSync(
            new URL(
              `../../benchmarks/fixtures/story-authoring/${name}.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      const plan = StoryAuthoringPlanSchema.parse(fixture("linked-comparison"));
      const template = parsePassageTemplate(fixture("comparison-template"));
      if (template.schemaVersion !== "story-template-1")
        throw new Error("template required");
      if (mode !== "reset")
        template.scene.nodes.find((node) => node.id === "pressure-b")!.opacity =
          0;
      if (mode === "exit")
        plan.beats[1]!.handoff = {
          mode: "reset",
          camera: "reset",
          subjects: [],
        };
      plan.beats[2]!.handoff.subjects = [
        {
          id: "pressure",
          from: "pressure-b",
          mode,
          properties: ["opacity"],
          ...(mode !== "exit" ? { to: "pressure-b" } : {}),
        },
      ];
      const story = compileStoryPassage(
        plan,
        new Map([["comparison-template.json", template]]),
      );
      const beat = story.beats[mode === "exit" ? 1 : 2]!;
      for (const nested of [false, true]) {
        const pressure: Composition["layers"][number] = {
          id: "pressure",
          type: "solid",
          size: [100, 100],
          color: "#123456",
        };
        const picture: Composition = {
          ...composition(),
          frameCount: beat.scene.frameCount,
          markers: [
            { id: "strain", frame: 48 },
            { id: "shared-strain", frame: 48, duration: 56 },
          ],
          layers: ["house-a", "house-b"].map((id) => ({
            id,
            type: "solid",
            size: [100, 100],
            color: "#123456",
          })),
        };
        if (nested) {
          picture.precomps = [
            {
              id: "picture",
              width: picture.width,
              height: picture.height,
              fps: picture.fps,
              frameCount: picture.frameCount,
              layers: picture.layers,
            },
          ];
          picture.layers = [
            { id: "instance", type: "precomp", comp: "picture" },
          ];
        }
        const prefix = nested ? "instance/" : "";
        const subjectLayers: Record<string, string> = {
          "house-a": prefix + "house-a",
          "house-b": prefix + "house-b",
        };
        picture.metadata = {
          passage: {
            cueMarkers: { strain: "strain" },
            eventMarkers: { "shared-strain": "shared-strain" },
            subjectLayers,
          },
        };
        const validate = () =>
          validatePassageCompositions(story, { [beat.id]: picture });
        expect(validate).toThrow(/Subject pressure-b/);
        (nested ? picture.precomps![0]!.layers : picture.layers).push(pressure);
        subjectLayers["pressure-b"] = prefix + "pressure";
        if (mode !== "reset") {
          expect(validate).toThrow(
            /native subject must (begin|finish) invisible/,
          );
          pressure.transform = { opacity: 0 };
        }
        expect(validate()).toHaveProperty(beat.id);
      }
    },
  );

  it("samples exit at the passage boundary before a transition's source tail", () => {
    const story = passage();
    Object.assign(story.beats[0]!, { frameCount: 180 });
    story.beats.push({
      ...story.beats[0]!,
      id: "next",
      handoff: {
        mode: "crossfade",
        frames: 12,
        camera: "reset",
        subjects: [
          {
            id: "subject",
            from: "actor",
            mode: "exit",
            properties: ["opacity"],
          },
        ],
      },
    });
    const picture = composition();
    picture.metadata = { passage: { subjectLayers: { actor: "panel" } } };
    picture.layers[0]!.transform = {
      opacity: {
        keys: [
          { frame: 0, value: 1 },
          { frame: 179, value: 0 },
          { frame: 191, value: 1 },
        ],
      },
    };
    expect(
      validatePassageCompositions(story, { beat: picture }).beat,
    ).toBeDefined();
    picture.layers[0]!.transform = { opacity: 1 };
    expect(() => validatePassageCompositions(story, { beat: picture })).toThrow(
      /finish invisible/,
    );
  });

  it("includes precomp host visibility when validating an entering subject", () => {
    const story = passage();
    Object.assign(story.beats[0]!, {
      handoff: {
        mode: "reset",
        camera: "reset",
        subjects: [
          {
            id: "subject",
            to: "actor",
            mode: "enter",
            properties: ["opacity"],
          },
        ],
      },
    });
    const picture = composition();
    picture.precomps = [
      {
        id: "picture",
        width: picture.width,
        height: picture.height,
        fps: picture.fps,
        frameCount: picture.frameCount,
        layers: picture.layers,
      },
    ];
    picture.layers = [
      {
        id: "instance",
        type: "precomp",
        comp: "picture",
        transform: { opacity: 0 },
      },
    ];
    picture.metadata = {
      passage: { subjectLayers: { actor: "instance/panel" } },
    };
    expect(
      validatePassageCompositions(story, { beat: picture }).beat,
    ).toBeDefined();
    picture.layers[0]!.transform = { opacity: 1 };
    expect(() => validatePassageCompositions(story, { beat: picture })).toThrow(
      /begin invisible/,
    );
    picture.layers[0]!.inPoint = 1;
    expect(
      validatePassageCompositions(story, { beat: picture }).beat,
    ).toBeDefined();
  });

  it("validates native pictures without mutating their authority or surrogate story", () => {
    const input = composition(),
      story = passage();
    expect(validatePassageCompositions(story, { beat: input }).beat).toEqual(
      input,
    );
    expect(input).toEqual(composition());
    expect(story).toEqual(passage());
  });
  it.each(["width", "height", "fps", "frameCount"] as const)(
    "rejects mismatched %s instead of retiming silently",
    (field) => {
      const input = composition();
      if (field === "fps") input.fps = 30;
      else input[field] += 2;
      expect(() =>
        validatePassageCompositions(passage(), { beat: input }),
      ).toThrow(/must match/);
    },
  );
  it("rejects unknown beats and reports native schema failures", () => {
    expect(() =>
      validatePassageCompositions(passage(), { missing: composition() }),
    ).toThrow(/Unknown beat/);
    const input = composition();
    input.layers[0]!.id = "";
    expect(() =>
      validatePassageCompositions(passage(), { beat: input }),
    ).toThrow();
  });
  it("rejects implicit carry on either side of a native beat", () => {
    const story = passage();
    const beat = story.beats[0]!;
    if (!("handoff" in beat)) throw new Error("handoff required");
    beat.handoff.camera = "carry";
    expect(() =>
      validatePassageCompositions(story, { beat: composition() }),
    ).toThrow(/authored transforms/);
    beat.handoff.camera = "reset";
    story.beats.push({
      ...beat,
      id: "following",
      handoff: {
        ...beat.handoff,
        subjects: [{ id: "actor", mode: "carry", properties: ["x"] }],
      },
    });
    expect(() =>
      validatePassageCompositions(story, { beat: composition() }),
    ).toThrow(/authored transforms/);
  });
  it("hashes portable native picture content, backend and runtime", () => {
    const input = composition();
    input.assets.push({
      id: "image",
      type: "image",
      path: "/first/image.png",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 20,
      height: 20,
    });
    const key = passageCompositionKey(input, "runtime");
    input.assets[0]!.path = "/relocated/image.png";
    expect(passageCompositionKey(input, "runtime")).toBe(key);
    expect(passageCompositionKey(input, "different")).not.toBe(key);
    expect(passageCompositionKey(input, "runtime", "webgl2")).not.toBe(key);
    input.layers[0]!.blendMode = "screen";
    expect(passageCompositionKey(input, "runtime")).not.toBe(key);
  });

  it("requires explicit cue/event timing and focal subject mappings", () => {
    const story = passage();
    const beat = story.beats[0]!;
    beat.cues = [
      {
        id: "voice",
        phrase: "voice",
        frame: 8,
        events: ["event"],
        localFrame: 8,
        masterFrame: 8,
        windows: [{ cue: "event", start: 8, end: 18 }],
      },
    ];
    beat.focus = ["actor"];
    const input = composition();
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /Cue voice/,
    );
    input.markers = [
      { id: "voice", frame: 8 },
      { id: "event", frame: 8, duration: 10 },
    ];
    input.metadata = {
      passage: {
        cueMarkers: { voice: "voice" },
        eventMarkers: { event: "event" },
        subjectLayers: { actor: "panel" },
      },
    };
    expect(validatePassageCompositions(story, { beat: input }).beat).toEqual(
      input,
    );
    input.markers[1]!.duration = 9;
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /Event event/,
    );
    input.markers[1]!.duration = 10;
    input.layers = [];
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /Subject actor/,
    );
  });
  it("rejects unknown narrative bindings and unsupported legacy acting", () => {
    const story = passage(),
      input = composition();
    input.metadata = { passage: { cueMarkers: { missing: "none" } } };
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /Unknown narrative cue/,
    );
    input.metadata = {};
    Object.assign(story.beats[0]!, {
      poseTracks: { actor: { initial: "pose" } },
    });
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /legacy acting tracks/,
    );
  });

  it("does not treat inherited object names as overrides", () => {
    const story = passage();
    story.beats[0]!.id = "constructor";
    const result = validatePassageCompositions(story);
    expect(result.constructor).toBeUndefined();
  });

  it("accepts evidence alternatives that preserve the qualification", () => {
    const { story, input, layer, qualification } = evidencePicture();
    layer.states = [qualification, qualification];
    layer.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 96, value: 1 },
      ],
    };
    layer.corrections = [{ start: 24, end: 48, replacement: qualification }];
    expect(validatePassageCompositions(story, { beat: input }).beat).toEqual(
      input,
    );
  });

  it.each(["root", "precomp"])(
    "rejects contradictory evidence states in a mapped %s layer",
    (scope) => {
      const { story, input, layer } = evidencePicture();
      layer.states = ["Historically proven"];
      if (scope === "precomp") {
        input.precomps = [
          {
            id: "picture",
            width: input.width,
            height: input.height,
            fps: input.fps,
            frameCount: input.frameCount,
            layers: [layer],
          },
        ];
        input.layers = [{ id: "instance", type: "precomp", comp: "picture" }];
        input.metadata = {
          passage: { subjectLayers: { qualifier: "instance/qualifier" } },
        };
      }
      expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
        /Evidence qualifier requires native text matching its qualification/,
      );
    },
  );

  it("rejects contradictory evidence even when selected later in the beat", () => {
    const { story, input, layer, qualification } = evidencePicture();
    layer.states = [qualification, "Historically proven"];
    layer.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 96, value: 1 },
      ],
    };
    expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
      /Evidence qualifier requires native text matching its qualification/,
    );
  });

  it.each(["full", "span"])(
    "rejects %s text corrections that can alter the evidence qualification",
    (scope) => {
      const { story, input, layer, qualification } = evidencePicture();
      layer.corrections = [
        {
          start: 24,
          end: 48,
          replacement: scope === "span" ? qualification : "Historically proven",
          ...(scope === "span" ? { span: "word" } : {}),
        },
      ];
      if (scope === "span") layer.spans = [{ id: "word", start: 0, end: 8 }];
      expect(() => validatePassageCompositions(story, { beat: input })).toThrow(
        /Evidence qualifier requires native text matching its qualification/,
      );
    },
  );
});

describe("native composition passage sounds", () => {
  const anchoredStory = () => {
    const story = passage();
    Object.assign(story.beats[0]!, {
      events: [{ id: "more-room", start: 86, end: 106 }],
    });
    const audio: CompiledPassageAudio = {
      schemaVersion: "passage-audio-1",
      masterGainDb: 0,
      narrationGainDb: 0,
      assets: [],
      sounds: [
        {
          id: "room-hit",
          beat: "beat",
          asset: "hit",
          anchor: { type: "event", id: "more-room", edge: "start" },
          offset: 0,
          sourceStartFrame: 0,
          durationFrames: 6,
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          start: 86,
          end: 92,
        },
      ],
    };
    return Object.assign(story, { audio });
  };

  it("requires a mapped native marker for every event-anchored sound", () => {
    const story = anchoredStory();
    const picture = composition();
    expect(() => validatePassageCompositions(story, { beat: picture })).toThrow(
      /Sound room-hit requires a mapped native marker matching event more-room/,
    );
    picture.markers = [{ id: "room", frame: 86, duration: 12 }];
    picture.metadata = { passage: { eventMarkers: { "more-room": "room" } } };
    expect(() => validatePassageCompositions(story, { beat: picture })).toThrow(
      /Sound room-hit requires a mapped native marker matching event more-room/,
    );
    picture.markers = [{ id: "room", frame: 86, duration: 20 }];
    expect(validatePassageCompositions(story, { beat: picture }).beat).toEqual(
      picture,
    );
  });

  it("leaves sounds on other beats and template beats ungoverned by native markers", () => {
    const story = anchoredStory();
    expect(validatePassageCompositions(story)).toEqual({});
    story.audio!.sounds[0]!.beat = "other";
    expect(
      validatePassageCompositions(story, { beat: composition() }).beat,
    ).toBeDefined();
  });
});
