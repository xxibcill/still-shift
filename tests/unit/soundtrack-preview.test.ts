import { afterEach, describe, expect, it, vi } from "vitest";
import { PassageAudioPlayer } from "../../apps/lab/src/passage-audio-player.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
import {
  validateSoundtrackProject,
  type Composition,
} from "@still-shift/scene-contract";
import type { CompiledStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { validatePassageCompositions } from "../../packages/renderer-core/src/passage-compositions.ts";
import { passageEventSoundtrack } from "../helpers/passage-event-soundtrack.ts";
const project = () =>
  validateSoundtrackProject({
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    history: { undo: [], redo: [] },
    sampleRate: 48000,
    channels: 2,
    durationSamples: 48000,
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets: [],
    clips: [],
    tracks: [],
    buses: [],
    master: { id: "master", gainDb: 0 },
  });
const passage = {
  plan: { fps: 24, sourceStartFrame: 0 },
  frameCount: 24,
  endFrameExclusive: 24,
  beats: [],
} as unknown as CompiledStoryPassage;
const decoded = {
  sampleRate: 48000,
  numberOfChannels: 2,
  length: 48000,
} as AudioBuffer;
class AudioHarness {
  currentTime = 10;
  destination = {};
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => decoded);
  resume = vi.fn(async () => {});
  source = {
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  createBufferSource = () => this.source;
  createGain = () => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
}
function setup() {
  const context = new AudioHarness();
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  return { context, player: new PassageAudioPlayer() };
}
afterEach(() => vi.unstubAllGlobals());
const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
const digest = async () => "sha256:" + (await sha256Hex(bytes));

function nativeSoundtrack() {
  const timing = {
    ...passage,
    beats: [
      {
        id: "beat",
        start: 0,
        scene: { width: 1920, height: 1080, fps: 24, frameCount: 24 },
        events: [{ id: "hit", start: 6, end: 12 }],
      },
    ],
  } as unknown as CompiledStoryPassage;
  const picture: Composition = {
    schemaVersion: "composition-1",
    id: "native",
    width: 1920,
    height: 1080,
    fps: 24,
    frameCount: 24,
    assets: [],
    layers: [],
  };
  const mix = passageEventSoundtrack(timing, "beat", "hit");
  return { timing, picture, mix };
}

describe("saved soundtrack native event bindings", () => {
  it("rejects missing or mismatched native markers before decoding a saved mix", async () => {
    const { context, player } = setup();
    const { timing, picture, mix } = nativeSoundtrack();
    for (const duration of [undefined, 5]) {
      if (duration !== undefined) {
        picture.markers = [{ id: "hit", frame: 6, duration }];
        picture.metadata = { passage: { eventMarkers: { hit: "hit" } } };
      }
      await expect(
        player.setSoundtrack(mix, bytes, await digest(), timing, {
          beat: picture,
        }),
      ).rejects.toMatchObject({
        name: "PassageError",
        diagnostics: [
          expect.objectContaining({
            code: "comp-passage-binding",
            beat: "beat",
            event: "hit",
          }),
        ],
      });
    }
    expect(context.decodeAudioData).not.toHaveBeenCalled();
  });

  it("accepts a mapped saved sound and rechecks native bindings before playback", async () => {
    const { context, player } = setup();
    const { timing, picture, mix } = nativeSoundtrack();
    picture.markers = [{ id: "hit", frame: 6, duration: 6 }];
    picture.metadata = { passage: { eventMarkers: { hit: "hit" } } };
    const compositions = { beat: picture };
    expect(validatePassageCompositions(timing, compositions).beat).toEqual(
      picture,
    );
    expect(
      await player.setSoundtrack(
        mix,
        bytes,
        await digest(),
        timing,
        compositions,
      ),
    ).toBe(true);
    expect(await player.play(timing, 0, true, compositions)).toBe(true);
    context.source.start.mockClear();
    picture.markers[0]!.frame = 7;
    await expect(player.play(timing, 0, true, compositions)).rejects.toThrow(
      /mapped native marker/,
    );
    expect(context.source.start).not.toHaveBeenCalled();
  });
});
describe("rendered soundtrack playback via a Web Audio API harness (no browser DSP)", () => {
  it("uses the full checked buffer, seeks on integer samples and shares the passage clock", async () => {
    const { context, player } = setup();
    await player.setSoundtrack(project(), bytes, await digest(), passage);
    expect(await player.play(passage, 6, false)).toBe(true);
    expect(context.source.buffer).toBe(decoded);
    expect(context.source.start).toHaveBeenCalledWith(
      10.04,
      12000 / 48000,
      36000 / 48000,
    );
    context.currentTime = 10.54;
    expect(player.frame).toBe(18);
    player.stop();
    expect(context.source.stop).toHaveBeenCalledOnce();
    expect(context.source.disconnect).toHaveBeenCalledOnce();
  });
  it("rejects altered render bytes and wrong decoded channel/rate/length before attaching", async () => {
    const { context, player } = setup();
    await expect(
      player.setSoundtrack(
        project(),
        bytes,
        "sha256:" + "0".repeat(64),
        passage,
      ),
    ).rejects.toThrow(/checksum/);
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    for (const result of [
      { ...decoded, length: 47999 },
      { ...decoded, sampleRate: 44100 },
      { ...decoded, numberOfChannels: 1 },
    ]) {
      context.decodeAudioData.mockResolvedValueOnce(result);
      await expect(
        player.setSoundtrack(project(), bytes, await digest(), passage),
      ).rejects.toThrow(/full-length/);
    }
  });
  it("clearing during a decode prevents late attachment", async () => {
    const { context, player } = setup();
    let finish!: (buffer: AudioBuffer) => void;
    context.decodeAudioData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = player.setSoundtrack(
      project(),
      bytes,
      await digest(),
      passage,
    );
    await vi.waitFor(() => expect(finish).toBeDefined());
    player.clearSoundtrack();
    finish(decoded);
    expect(await pending).toBe(false);
    await player.play(passage, 6, false);
    expect(context.source.start).not.toHaveBeenCalled();
  });
  it("a newer attachment supersedes an earlier decode and stores an immutable project snapshot", async () => {
    const { context, player } = setup();
    let finish!: (buffer: AudioBuffer) => void;
    context.decodeAudioData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = player.setSoundtrack(
      project(),
      bytes,
      await digest(),
      passage,
    );
    await vi.waitFor(() => expect(finish).toBeDefined());
    const current = project();
    current.revision = 1;
    expect(
      await player.setSoundtrack(current, bytes, await digest(), passage),
    ).toBe(true);
    finish(decoded);
    expect(await pending).toBe(false);
    current.durationSamples = 1;
    expect(await player.play(passage, 6, true)).toBe(true);
  });
});

it("uses the same saved mix on 30 fps picture boundaries", async () => {
  const { context, player } = setup();
  const timing = {
    ...passage,
    plan: { ...passage.plan, fps: 30 as const },
    frameCount: 30,
    endFrameExclusive: 30,
  };
  await player.setSoundtrack(project(), bytes, await digest(), timing);
  await player.play(timing, 1, true);
  expect(context.source.start).toHaveBeenCalledWith(
    10.04,
    1600 / 48000,
    46400 / 48000,
  );
});

it("rejects out-of-passage preview frames before scheduling a rendered mix", async () => {
  const { context, player } = setup();
  await player.setSoundtrack(project(), bytes, await digest(), passage);
  for (const frame of [-1, 24, 0.5])
    await expect(player.play(passage, frame, true)).rejects.toThrow(/inside/);
  expect(context.source.start).not.toHaveBeenCalled();
});
