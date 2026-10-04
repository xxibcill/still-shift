import { soundtrackTimelineModel } from "../../apps/lab/src/soundtrack-timeline-model.ts";
import { describe, expect, it } from "vitest";
import {
  validateSoundtrackProject,
  type SoundtrackProject,
} from "@still-shift/scene-contract";
import {
  editSoundtrackProject,
  resolveSoundtrackAnchors,
} from "../../packages/renderer-core/src/soundtrack-edits.ts";
export function fixture(): SoundtrackProject {
  return {
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    sampleRate: 48000,
    channels: 2,
    durationSamples: 48000,
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets: [
      { id: "tone", path: "tone.wav", sha256: "sha256:" + "a".repeat(64) },
    ],
    tracks: [
      {
        id: "voice",
        role: "narration",
        output: "master",
        gainDb: 0,
        mute: false,
        solo: false,
        processors: [],
      },
      {
        id: "music",
        role: "bgm",
        output: "bus",
        gainDb: 0,
        mute: false,
        solo: false,
        processors: [],
      },
    ],
    buses: [{ id: "bus", output: "master", gainDb: 0 }],
    master: { id: "master", gainDb: 0 },
    clips: [
      {
        id: "speech",
        track: "voice",
        asset: "tone",
        sourceStartSample: 0,
        sourceEndSample: 4800,
        startSample: 0,
        gainDb: 0,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        automation: { interpolation: "linear", points: [] },
      },
    ],
    history: { undo: [], redo: [] },
  };
}
describe("soundtrack contract and transactions", () => {
  it("rejects malformed and unknown fields, noninteger samples and unsupported DSP", () => {
    for (const patch of [
      { sampleRate: 44100 },
      { channels: 6 },
      { durationSamples: 0.1 },
      { plugins: [] },
      { normalization: "auto" },
    ])
      expect(() =>
        validateSoundtrackProject({ ...fixture(), ...patch }),
      ).toThrow();
  });
  it("rejects routing cycles, missing outputs and duplicate IDs", () => {
    const p = fixture();
    p.buses[0]!.output = "bus";
    expect(() => validateSoundtrackProject(p)).toThrow(/cycles/);
    p.buses[0]!.output = "absent";
    expect(() => validateSoundtrackProject(p)).toThrow(/Unknown/);
    p.buses[0]!.id = "voice";
    expect(() => validateSoundtrackProject(p)).toThrow(/unique/);
  });
  it("rejects invalid trims, placement, fades, automation and resource budgets", () => {
    for (const patch of [
      { sourceEndSample: 0 },
      { startSample: 47999 },
      { fadeInSamples: 4801 },
      {
        automation: {
          interpolation: "linear",
          points: [
            { sample: 10, gain: 1 },
            { sample: 10, gain: 0 },
          ],
        },
      },
    ]) {
      const p = fixture();
      Object.assign(p.clips[0]!, patch);
      expect(() => validateSoundtrackProject(p)).toThrow();
    }
    const p = fixture();
    p.durationSamples = 28_800_000;
    expect(() => validateSoundtrackProject(p)).toThrow(/working-buffer/);
  });
  it("supports gain, move, trim, automation, mute/solo and persisted undo/redo without mutating input", () => {
    const input = fixture();
    let p = editSoundtrackProject(input, [
      { type: "gain", target: "speech", gainDb: -6 },
      { type: "move", clip: "speech", startSample: 100 },
      {
        type: "trim",
        clip: "speech",
        sourceStartSample: 100,
        sourceEndSample: 4800,
      },
      { type: "mute", track: "music", value: true },
      { type: "solo", track: "voice", value: true },
      {
        type: "automation",
        clip: "speech",
        automation: {
          interpolation: "hold",
          points: [{ sample: 0, gain: 0.5 }],
        },
      },
    ]);
    expect(input).toEqual(fixture());
    expect(p.revision).toBe(1);
    expect(p.history.undo).toHaveLength(6);
    p = editSoundtrackProject(JSON.parse(JSON.stringify(p)), [
      { type: "undo" },
    ]);
    expect(p.clips[0]!.automation.points).toEqual([]);
    p = editSoundtrackProject(p, [{ type: "redo" }]);
    expect(p.clips[0]!.automation.interpolation).toBe("hold");
    expect(() =>
      editSoundtrackProject(input, [
        { type: "gain", target: "missing", gainDb: 0 },
      ]),
    ).toThrow();
    expect(() => editSoundtrackProject(input, [{ type: "undo" }])).toThrow(
      /No undo/,
    );
  });
  it("retimes anchors without changing source intervals; conflicts require explicit save", () => {
    const p = fixture();
    p.clips[0]!.anchor = {
      beat: "beat",
      reference: { type: "cue", id: "cue" },
      offsetSamples: 10,
    };
    p.clips[0]!.startSample = 2010;
    const timing = {
      fps: 24,
      frameCount: 24,
      beats: [
        { id: "beat", start: 0, cues: [{ id: "cue", frame: 1 }], events: [] },
      ],
    };
    expect(resolveSoundtrackAnchors(p, timing)).toEqual(p);
    timing.beats[0]!.cues[0]!.frame = 2;
    expect(() => resolveSoundtrackAnchors(p, timing)).toThrow(/disagrees/);
    const retimed = resolveSoundtrackAnchors(p, timing, true);
    expect(retimed.clips[0]!.startSample).toBe(4010);
    expect(retimed.clips[0]!.sourceEndSample).toBe(4800);
    expect(p.clips[0]!.startSample).toBe(2010);
    expect(() =>
      editSoundtrackProject(p, [
        { type: "move", clip: "speech", startSample: 100 },
      ]),
    ).toThrow(/offsetSamples/);
    timing.beats[0]!.cues = [];
    expect(() => resolveSoundtrackAnchors(p, timing)).toThrow(/Missing/);
  });
  it("only ducks an explicit narration detector into BGM targets", () => {
    const p = fixture();
    p.ducking = {
      method: "peak-window-attack-hold-release-1",
      sourceTrack: "voice",
      targetTracks: ["music"],
      thresholdDb: -30,
      attenuationDb: -12,
      windowSamples: 480,
      attackSamples: 240,
      releaseSamples: 4800,
      holdSamples: 2400,
      lookaheadSamples: 0,
    };
    expect(validateSoundtrackProject(p).ducking).toEqual(p.ducking);
    p.ducking.targetTracks = ["voice"];
    expect(() => validateSoundtrackProject(p)).toThrow(/BGM/);
  });
});

it("timeline projects overlaps, waveforms and absolute automation without a second authority", () => {
  const p = fixture();
  p.clips[0]!.automation.points = [{ sample: 200, gain: 0.5 }];
  p.clips.push({
    ...structuredClone(p.clips[0]!),
    id: "overlap",
    startSample: 2400,
  });
  const model = soundtrackTimelineModel(p, { voice: { peaks: [0, 0.5, 1] } });
  expect(model.tracks[0]!.clips[0]!.widthPercent).toBe(10);
  expect(model.tracks[0]!.clips[1]!.leftPercent).toBe(5);
  expect(model.tracks[0]!.clips[1]!.automation).toEqual([
    { sample: 2600, gain: 0.5 },
  ]);
  expect(model.tracks[0]!.peaks).toEqual([0, 0.5, 1]);
  expect(p.revision).toBe(0);
});

it("gain scope resolves clip/track name collisions and reserves output names", () => {
  const p = fixture();
  p.clips[0]!.id = "voice";
  expect(() =>
    editSoundtrackProject(p, [{ type: "gain", target: "voice", gainDb: -6 }]),
  ).toThrow(/exactly one/);
  const edited = editSoundtrackProject(p, [
    { type: "gain", target: "voice", kind: "clip", gainDb: -6 },
  ]);
  expect(edited.clips[0]!.gainDb).toBe(-6);
  expect(edited.tracks[0]!.gainDb).toBe(0);
  p.tracks[1]!.id = "mix";
  expect(() => validateSoundtrackProject(p)).toThrow(/reserved/);
});
