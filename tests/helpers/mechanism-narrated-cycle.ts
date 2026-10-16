import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { createTapeHookPack } from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import { createCableTiePack } from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import { createClothespegPack } from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
export function narratedCycleFixture(
  family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook",
  sampleCount = 192000,
) {
  const instance =
    family === "tape-hook"
      ? createTapeHookPack()
      : family === "cable-tie"
        ? createCableTiePack()
        : createClothespegPack();
  const rig =
    family === "tape-hook"
      ? "slider"
      : family === "cable-tie"
        ? "ratchet"
        : "upper.return";
  const relationship =
    family === "tape-hook"
      ? "hook.innerRange"
      : family === "cable-tie"
        ? "pawl.root.fixed"
        : "spring.upper.seated";
  const at = (cue: string) => ({ cue });
  const controls =
    family === "tape-hook"
      ? [
          {
            rig: "slider",
            control: {
              type: "slider",
              keys: [
                { at: at("intro"), value: 0, easing: "hold" },
                { at: at("release"), value: 0.18, easing: "smoothstep" },
                { at: at("return"), value: 0 },
              ],
            },
          },
        ]
      : family === "cable-tie"
        ? [
            {
              rig: "ratchet",
              control: {
                type: "ratchet",
                position: {
                  keys: [
                    { at: at("intro"), value: 0, easing: "smoothstep" },
                    { at: at("contact"), value: 0.5, easing: "hold" },
                  ],
                },
                latchKeys: [{ at: at("intro"), state: "engaged" }],
              },
            },
          ]
        : ["upper", "lower"].map((side) => ({
            rig: `${side}.return`,
            control: {
              type: "spring-return",
              states: [
                { at: at("intro"), phase: "held", value: 0 },
                {
                  at: at("contact"),
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
  const annotation = {
    id: "part",
    text: "Part",
    anchor: instance.scene.anchors[0]!.id,
    position: [18, 18],
  };
  const sound = {
    id: "tick",
    asset: {
      id: "tick",
      type: "audio",
      path: "tick.wav",
      sha256: "sha256:" + "d".repeat(64),
      sampleRate: 48000,
      sampleCount: 2400,
      channels: 1,
    },
  };
  const cues = ["intro", "contact", "release", "return"].map((id, index) => ({
    id,
    startSample: Math.floor((sampleCount * index) / 4),
    endSampleExclusive: Math.floor((sampleCount * (index + 1)) / 4),
    kind: index === 0 ? "initial" : id,
    state: ["ready", "touching", "free", "returned"][index],
    text: ["Start", "Touch", "Free", "Back"][index],
    minimumActionSamples: 12000,
    annotations: [annotation],
    sounds: index === 0 ? [] : [sound],
  }));
  return {
    instance,
    document: MechanismNarratedCycleSchema.parse({
      schemaVersion: "mechanism-narrated-cycle-1",
      id: "narrated-cycle",
      revision: 0,
      output: { width: 320, height: 180, fps: 30 },
      source: {
        id: "mechanism",
        type: "native3d",
        path: "scene.json",
        sha256: "sha256:" + "a".repeat(64),
        format: "mechanism-scene-2",
      },
      font: {
        id: "font",
        type: "font",
        path: "font.ttf",
        sha256: "sha256:" + "b".repeat(64),
        weight: "600",
      },
      narration: {
        id: "narration",
        type: "audio",
        path: "narration.wav",
        sha256: "sha256:" + "c".repeat(64),
        sampleRate: 48000,
        sampleCount,
        channels: 1,
      },
      initialState: "ready",
      states: ["ready", "touching", "free", "returned"].map((id) => ({
        id,
        requirements: [{ rig, relationship }],
      })),
      transitions: [
        { from: "ready", to: "touching", event: "contact" },
        { from: "touching", to: "free", event: "release" },
        { from: "free", to: "returned", event: "return" },
      ],
      controls,
      cues,
    }),
  };
}
