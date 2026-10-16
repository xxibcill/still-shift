import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createMechanismFamilyAuthoring,
  saveMechanismFamilyAuthoring,
  readMechanismFamilyAuthoring,
  saveMechanismCueAuthoring,
  compileMechanismCueProject,
} from "@still-shift/animation-engine";
import {
  MechanismNarratedCycleSchema,
  type MechanismNarratedCycle,
} from "@still-shift/scene-contract";
import { mediaFloat32Wave } from "./composition-media-audio.ts";
import {
  readSpokenTake,
  spokenChecksum as hash,
  type SpokenTake,
} from "./mechanism-spoken-inputs.ts";

/** Teaching poses and concise explanatory captions authored to this take's own supplied words. */
export async function authorSpokenCueProject(take: SpokenTake, root: string) {
  const directory = join(root, take.id);
  await mkdir(directory);
  const repo = resolve(import.meta.dirname, "../..");
  const family = createMechanismFamilyAuthoring(
    take.family,
    "spoken-" + take.id,
  );
  const familyPath = join(directory, "family.json");
  await saveMechanismFamilyAuthoring(family.document, familyPath);
  const recovered = await readMechanismFamilyAuthoring(familyPath),
    instance = recovered.instance;
  const source = JSON.stringify(instance.scene, null, 2) + "\n";
  await writeFile(join(directory, "scene.json"), source);
  const fontPath = join(
      repo,
      "assets/story-motion/fonts/plex-sans-semibold.ttf",
    ),
    fontBody = await readFile(fontPath);
  const { words, sourcePcmSha256 } = await readSpokenTake(take);
  let windows = take.cues.map((cue: SpokenTake["cues"][number]) => ({
    ...cue,
  }));
  if (take.id === "EU-001") {
    const inside = {
      ...windows[1]!,
      id: "inside-face",
      wordRangeOneBasedInclusive: [10, 21] as [number, number],
      endSampleExclusive: words[21]!.startSample,
    };
    const outside = {
      ...windows[1]!,
      id: "outside-face",
      wordRangeOneBasedInclusive: [22, 33] as [number, number],
      startSample: words[21]!.startSample,
    };
    windows = [windows[0]!, inside, outside, ...windows.slice(2)];
  }
  const ids =
    take.family === "tape-hook"
      ? take.id === "EU-001"
        ? ["intro", "inside-face", "outside-face", "thickness", "compensate"]
        : [
            "intro",
            "inside-face",
            "outside-face",
            "thickness",
            "compensate",
            "aligned",
          ]
      : take.family === "cable-tie"
        ? ["intro", "tongue", "forward-pass", "blocked-reverse"]
        : ["intro", "open", "release", "fabric", "bias"];
  const captions =
    take.family === "tape-hook"
      ? [
          "The hook slides on purpose.",
          "An edge meets the inside face.",
          "A wall meets the outside face.",
          "The faces are one thickness apart.",
          "Travel matches the hook thickness.",
          "Both contact positions stay aligned.",
        ]
      : take.family === "cable-tie"
        ? [
            "Forward slides. Backward catches.",
            "A plastic tongue meets the teeth.",
            "Each tooth flexes the tongue aside.",
            "Reverse motion catches on a tooth.",
          ]
        : [
            "The peg keeps squeezing.",
            "The arms turn and the jaws open.",
            "Let go: the spring closes the jaws.",
            "Fabric stops them closing fully.",
            "The spring remains biased.",
          ];
  const labels =
    take.family === "tape-hook"
      ? [
          "Sliding hook",
          "Inside face",
          "Outside face",
          "Thickness",
          "Same travel",
          "Contact point",
        ]
      : take.family === "cable-tie"
        ? ["One way", "Plastic tongue", "Next tooth", "Blocked"]
        : [
            "Wooden arms",
            "Open jaws",
            "Spring return",
            "Fabric stop",
            "Spring bias",
          ];
  const anchors =
    take.family === "tape-hook"
      ? [
          "hook.outerFace",
          "hook.innerFace",
          "hook.outerFace",
          "hook.outerFace",
          "hook.outerFace",
          "hook.outerFace",
        ]
      : take.family === "cable-tie"
        ? ["strap.outerSurface", "pawl.root", "pawl.tip", "pawl.tip"]
        : [
            "upper.seat",
            "upper.seat",
            "upper.seat",
            "cloth.upper",
            "upper.seat",
          ];
  const kinds =
    take.family === "tape-hook"
      ? ["initial", "contact", "contact", "reset", "return", "reset"]
      : take.family === "cable-tie"
        ? ["initial", "contact", "contact", "reset"]
        : ["initial", "contact", "release", "return", "reset"];
  const rig =
    take.family === "tape-hook"
      ? "slider"
      : take.family === "cable-tie"
        ? "ratchet"
        : "upper.return";
  const relationship =
    take.family === "tape-hook"
      ? "hook.innerRange"
      : take.family === "cable-tie"
        ? "pawl.root.fixed"
        : "spring.upper.seated";
  const at = (cue: string, offsetSamples = 0) => ({
    cue,
    edge: "start" as const,
    offsetSamples,
  });
  const sound = mediaFloat32Wave(
    2400,
    1,
    (sample: number) => 0.02 * Math.sin(sample * 0.3) * (1 - sample / 2400),
  );
  await writeFile(join(directory, "marker.wav"), sound.wav);
  let controls: MechanismNarratedCycle["controls"];
  if (take.family === "tape-hook") {
    assert.ok("hookThickness" in instance.parameters);
    const thickness = instance.parameters.hookThickness;
    controls = [
      {
        rig: "slider",
        control: {
          type: "slider",
          keys: [
            { at: at("intro"), value: 0, easing: "smoothstep" },
            { at: at("intro", 48000), value: thickness, easing: "smoothstep" },
            { at: at("inside-face", -24000), value: 0, easing: "hold" },
            { at: at("outside-face", -12000), value: 0, easing: "smoothstep" },
            { at: at("outside-face"), value: thickness, easing: "hold" },
            { at: at("compensate"), value: thickness, easing: "smoothstep" },
            { at: at("compensate", 48000), value: 0, easing: "smoothstep" },
            { at: at("compensate", 96000), value: thickness, easing: "hold" },
          ],
        },
      },
    ];
  } else if (take.family === "cable-tie") {
    assert.ok("pitch" in instance.parameters);
    const pitch = instance.parameters.pitch;
    controls = [
      {
        rig: "ratchet",
        control: {
          type: "ratchet",
          position: {
            keys: [
              { at: at("intro"), value: 0, easing: "smoothstep" },
              { at: at("intro", 96000), value: pitch, easing: "hold" },
              { at: at("forward-pass"), value: pitch, easing: "linear" },
              {
                at: at("forward-pass", 96000),
                value: pitch * 2,
                easing: "linear",
              },
              {
                at: at("blocked-reverse", -24000),
                value: pitch * 3,
                easing: "hold",
              },
            ],
          },
          latchKeys: [{ at: at("intro"), state: "engaged" }],
        },
      },
    ];
  } else
    controls = ["upper", "lower"].map((side) => ({
      rig: side + ".return",
      control: {
        type: "spring-return",
        states: [
          { at: at("intro"), phase: "held", value: 0 },
          {
            at: at("open"),
            phase: "held",
            value: side === "upper" ? -0.16 : 0.16,
          },
          {
            at: at("release"),
            phase: "released",
            value: side === "upper" ? -0.16 : 0.16,
            stopValue: 0,
          },
        ],
      },
    }));
  const document = MechanismNarratedCycleSchema.parse({
    schemaVersion: "mechanism-narrated-cycle-1",
    id: "spoken-" + take.id,
    revision: 0,
    output: { width: 640, height: 360, fps: 30 },
    locale: "en",
    source: {
      id: "mechanism",
      type: "native3d",
      path: "scene.json",
      sha256: hash(source),
      format: "mechanism-scene-2",
    },
    font: {
      id: "font",
      type: "font",
      path: fontPath,
      sha256: hash(fontBody),
      weight: "600",
    },
    narration: {
      id: "narration",
      type: "audio",
      path: take.normalized.path,
      sha256: take.normalized.sha256,
      sampleRate: 48000,
      sampleCount: take.sampleCount,
      channels: 1,
    },
    initialState: ids[0],
    states: ids.map((id) => ({ id, requirements: [{ rig, relationship }] })),
    transitions: ids
      .slice(1)
      .map((id, i) => ({ from: ids[i]!, to: id, event: kinds[i + 1] })),
    controls,
    cues: windows.map((window: SpokenTake["cues"][number], i: number) => ({
      id: ids[i],
      startSample: window.startSample,
      endSampleExclusive: window.endSampleExclusive,
      kind: kinds[i],
      state: ids[i],
      text: captions[i],
      minimumActionSamples: 12000,
      ...(take.family === "cable-tie"
        ? {
            camera: { ...instance.scene.camera, position: [8, 5, 2] },
            editing: i === 0 ? "cut" : "hold",
          }
        : {}),
      annotations: [
        {
          id: "part",
          text: labels[i],
          anchor: anchors[i],
          position: [24, 24],
          visibility: { policy: "hide-occluded" },
        },
      ],
      sounds:
        i === 0
          ? []
          : [
              {
                id: "marker",
                asset: {
                  id: "marker",
                  type: "audio",
                  path: "marker.wav",
                  sha256: hash(sound.wav),
                  sampleRate: 48000,
                  sampleCount: 2400,
                  channels: 1,
                },
                gainDb: -24,
              },
            ],
    })),
  });
  const cuePath = join(directory, "cues.json");
  await saveMechanismCueAuthoring(instance, document, cuePath);
  const compiled = await compileMechanismCueProject(
    familyPath,
    cuePath,
    join(directory, "compiled"),
  );
  return {
    id: take.id,
    family: take.family,
    familyPath,
    cuePath,
    instance,
    document,
    compiled,
    sourceSampleCount: take.sampleCount,
    wordCount: words.length,
    sourcePcmSha256,
    words,
    wordCoverage: windows.map((x) => ({
      range: x.wordRangeOneBasedInclusive,
      startSample: x.startSample,
      endSampleExclusive: x.endSampleExclusive,
    })),
    selectedCaptionStyle:
      "concise explanatory captions, not verbatim subtitles",
    markerScope:
      "Local synthetic low-gain engineering onset marker; narration source unchanged, no production soundtrack/listening acceptance",
  };
}
