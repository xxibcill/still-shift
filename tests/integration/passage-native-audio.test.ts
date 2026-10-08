import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compositionAudioWavHeader,
  validateComposition,
  type Composition,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  preparePassageNativeAudio,
  renderPassageNativeAudio,
} from "../../packages/animation-engine/src/passage-native-audio.ts";
import { renderPassageAudio } from "../../packages/animation-engine/src/passage-audio.ts";
import {
  readStoryPassage,
  type PreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import {
  renderPassageSoundtrack,
  soundtrackFromPassage,
} from "../../packages/animation-engine/src/soundtrack-passage.ts";
import { passageCompositionKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";
import { writePreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { renderSoundtrackProject } from "../../packages/animation-engine/src/soundtrack-render.ts";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-native-passage-pcm-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
type AudioAsset = Extract<CompositionAsset, { type: "audio" }>;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
async function source(
  id: string,
  count: number,
  value: (at: number, channel: number) => number,
) {
  const raw = Buffer.alloc(count * 8);
  for (let at = 0; at < count; at++)
    for (let channel = 0; channel < 2; channel++)
      raw.writeFloatLE(value(at, channel), at * 8 + channel * 4);
  const bytes = Buffer.concat([compositionAudioWavHeader(count), raw]),
    path = join(root, id + ".wav");
  await writeFile(path, bytes);
  return {
    raw,
    asset: {
      id,
      type: "audio",
      path,
      sha256: hash(bytes),
      sampleRate: 48000,
      sampleCount: count,
      channels: 2,
    } as AudioAsset,
  };
}
async function fixture() {
  const original = await readStoryPassage(
    "benchmarks/fixtures/story-authoring/linked-comparison.json",
  );
  const passage: PreparedPassage = {
    ...original,
    frameCount: 12,
    endFrameExclusive: 15,
    plan: { ...original.plan, sourceStartFrame: 3 },
    beats: [0, 1].map((index) => ({
      ...original.beats[index]!,
      id: index ? "second" : "first",
      start: index ? 6 : 0,
      end: index ? 12 : 6,
      frameCount: 6,
      scene: {
        ...original.beats[index]!.scene,
        width: 64,
        height: 48,
        frameCount: index ? 6 : 8,
        fps: 24,
      },
    })),
  };
  passage.audio = undefined;
  delete passage.plan.narration;
  return passage;
}
function document(asset: AudioAsset, frames: number): Composition {
  const input: Composition = {
    schemaVersion: "composition-1",
    id: asset.id,
    width: 64,
    height: 48,
    fps: 24,
    frameCount: frames,
    assets: [asset],
    layers: [{ id: "sound", type: "audio", asset: asset.id }],
  };
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.composition;
}
async function pcm(path: string) {
  const raw = path + ".f32";
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-c:a",
    "pcm_f32le",
    "-f",
    "f32le",
    raw,
  ]);
  return readFile(raw);
}

it("adds actual complete beat masters including the outgoing tail, then slices every selected sample exactly", async () => {
  const passage = await fixture();
  const first = await source("first-tail", 16000, (at, channel) =>
    Math.fround(((at % 31) - 15) / 64 + channel / 8),
  );
  const second = await source("second-last", 12000, (at, channel) =>
    at === 11999 ? (channel ? -0.125 : 0.0625) : channel ? -0.03125 : 0.015625,
  );
  const cacheDirectory = join(root, "tail-cache");
  const native = (await preparePassageNativeAudio(
    passage,
    { first: document(first.asset, 8), second: document(second.asset, 6) },
    { cacheDirectory },
  ))!;
  const full = await renderPassageNativeAudio(
    join(root, "tail-full.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, masterGainDb: -6 },
  );
  const range = await renderPassageNativeAudio(
    join(root, "tail-range.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, masterGainDb: -6, range: { start: 7, end: 12 } },
  );
  const repeated = await renderPassageNativeAudio(
    join(root, "tail-repeat.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, masterGainDb: -6 },
  );
  const actual = (await readFile(full.path)).subarray(58),
    expected = Buffer.alloc(24000 * 8);
  const gain = Math.fround(10 ** (-6 / 20));
  for (let at = 0; at < 24000; at++)
    for (let channel = 0; channel < 2; channel++) {
      const a = at < 16000 ? first.raw.readFloatLE(at * 8 + channel * 4) : 0;
      const b =
        at >= 12000
          ? second.raw.readFloatLE((at - 12000) * 8 + channel * 4)
          : 0;
      expected.writeFloatLE(
        Math.fround(Math.fround(a + b) * gain),
        at * 8 + channel * 4,
      );
    }
  expect(actual.equals(expected)).toBe(true);
  expect(
    (await readFile(range.path))
      .subarray(58)
      .equals(expected.subarray(14000 * 8)),
  ).toBe(true);
  expect(full.sha256).toBe(repeated.sha256);
  expect(range.wholeSha256).toBe(full.wholeSha256);
  expect(full.peakPcmWorkingBytes).toBeLessThan(512 * 1024);
  expect(
    (await readdir(root)).some((name) => name.endsWith(".whole.wav")),
  ).toBe(false);
}, 30_000);

it("retains the global voice outside a matching nested native interval without double playback or resetting fades at a crop", async () => {
  const passage = await fixture(),
    voice = await source("global-voice", 32000, (_, channel) =>
      channel ? -0.25 : 0.125,
    );
  passage.plan.narration = {
    reference: "actual voice",
    sha256: voice.asset.sha256.slice(7),
  };
  const composition = document(voice.asset, 8);
  composition.layers = [
    { id: "nested", type: "precomp", comp: "voice-scope", startFrame: 1 },
  ];
  composition.precomps = [
    {
      id: "voice-scope",
      width: 64,
      height: 48,
      frameCount: 7,
      layers: [
        {
          id: "voice",
          type: "audio",
          asset: voice.asset.id,
          role: "narration",
          sourceStartSample: 8000,
          sourceEndSample: 14000,
          gainDb: -6,
          fadeInSamples: 1000,
          fadeOutSamples: 700,
        },
      ],
    },
  ];
  const cacheDirectory = join(root, "voice-cache");
  const native = (await preparePassageNativeAudio(
    passage,
    { first: composition },
    { cacheDirectory },
  ))!;
  expect(native.narrationExclusions).toEqual([{ start: 2000, end: 8000 }]);
  const legacy = (await renderPassageAudio(
    join(root, "voice-remainder.wav"),
    passage,
    voice.asset.path,
    { narrationExclusions: native.narrationExclusions, masterGainDb: 0 },
  ))!;
  const full = await renderPassageNativeAudio(
    join(root, "voice-full.wav"),
    passage,
    native,
    legacy.path,
    { cacheDirectory },
  );
  const range = await renderPassageNativeAudio(
    join(root, "voice-range.wav"),
    passage,
    native,
    legacy.path,
    { cacheDirectory, range: { start: 1, end: 5 } },
  );
  const bytes = (await readFile(full.path)).subarray(58);
  for (let at = 0; at < 24000; at++)
    for (let channel = 0; channel < 2; channel++) {
      let expected = channel ? -0.25 : 0.125;
      if (at >= 2000 && at < 8000) {
        const local = at - 2000;
        const envelope =
          Math.min(1, local / 1000) * Math.min(1, (6000 - local) / 700);
        expected = Math.fround(
          expected * Math.fround(envelope * 10 ** (-6 / 20)),
        );
      }
      expect(bytes.readFloatLE(at * 8 + channel * 4)).toBe(
        Math.fround(0 + expected),
      );
    }
  expect(
    (await readFile(range.path))
      .subarray(58)
      .equals(bytes.subarray(2000 * 8, 10000 * 8)),
  ).toBe(true);
}, 30_000);

it("checks disabled native voice identity/placement and actual unused source bytes before a range is mixed", async () => {
  const passage = await fixture(),
    voice = await source("outside-voice", 32000, () => 0.25);
  passage.plan.narration = {
    reference: "actual voice",
    sha256: voice.asset.sha256.slice(7),
  };
  const comp = document(voice.asset, 6);
  comp.layers = [
    {
      id: "voice",
      type: "audio",
      role: "narration",
      asset: voice.asset.id,
      enabled: false,
      sourceStartSample: 18001,
      sourceEndSample: 22001,
    },
  ];
  const options = { cacheDirectory: join(root, "outside-cache") };
  await expect(
    preparePassageNativeAudio(passage, { second: comp }, options),
  ).rejects.toThrow(/exact sample placement/);
  if (comp.layers[0]!.type !== "audio") throw new Error("audio expected");
  comp.layers[0]!.sourceStartSample = 18000;
  comp.layers[0]!.sourceEndSample = 22000;
  const native = (await preparePassageNativeAudio(
    passage,
    { second: comp },
    options,
  ))!;
  const cancelled = AbortSignal.abort(new Error("native passage cancel"));
  await expect(
    renderPassageNativeAudio(
      join(root, "cancel.wav"),
      passage,
      native,
      undefined,
      { ...options, signal: cancelled, range: { start: 0, end: 1 } },
    ),
  ).rejects.toThrow(/native passage cancel/);
  await writeFile(voice.asset.path, "changed original");
  await expect(
    renderPassageNativeAudio(
      join(root, "outside.wav"),
      passage,
      native,
      undefined,
      { ...options, range: { start: 0, end: 1 } },
    ),
  ).rejects.toThrow(/bytes differ/);
  expect(
    (await readdir(root)).some(
      (name) =>
        name === "cancel.wav" ||
        name === "outside.wav" ||
        name.endsWith(".whole.wav"),
    ),
  ).toBe(false);
}, 30_000);

it("feeds native PCM through a saved CE16 master, preserves its original bytes, and crops after its full DSP", async () => {
  const passage = await fixture(),
    voice = await source("saved-voice", 32000, (_, channel) =>
      channel ? -0.125 : 0.25,
    );
  passage.plan.narration = {
    reference: "actual saved voice",
    sha256: voice.asset.sha256.slice(7),
  };
  const composition = document(voice.asset, 8);
  composition.layers = [
    {
      id: "voice",
      type: "audio",
      role: "narration",
      asset: voice.asset.id,
      sourceStartSample: 6000,
      sourceEndSample: 14000,
      gainDb: -6,
      fadeInSamples: 1000,
    },
  ];
  const cacheDirectory = join(root, "saved-cache");
  const native = (await preparePassageNativeAudio(
    passage,
    { first: composition },
    { cacheDirectory, separateNarration: true },
  ))!;
  const nativeMix = await renderPassageNativeAudio(
    join(root, "saved-native.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, masterGainDb: 0, stem: "sounds" },
  );
  const nativeNarration = await renderPassageNativeAudio(
    join(root, "saved-native-narration.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, masterGainDb: 0, stem: "narration" },
  );
  const project = soundtrackFromPassage(passage, {
    path: voice.asset.path,
    sha256: voice.asset.sha256,
  });
  project.master.gainDb = -6;
  const projectPath = join(root, "saved-project.json"),
    original = JSON.stringify(project);
  await writeFile(projectPath, original);
  await mkdir(join(root, "saved-full"));
  await mkdir(join(root, "saved-range"));
  const full = await renderPassageSoundtrack(
    join(root, "saved-full", "mix.wav"),
    passage,
    projectPath,
    { nativeAudio: nativeMix, nativeNarration },
  );
  const range = await renderPassageSoundtrack(
    join(root, "saved-range", "mix.wav"),
    passage,
    projectPath,
    { nativeAudio: nativeMix, nativeNarration, range: { start: 1, end: 11 } },
  );
  const data = await pcm(full.path),
    selected = await pcm(range.path);
  expect(selected.equals(data.subarray(2000 * 8, 22000 * 8))).toBe(true);
  const gain = Math.fround(10 ** (-6 / 20));
  expect(data.readFloatLE(10000 * 8)).toBe(Math.fround(0.25 * gain));
  expect(data.readFloatLE(2000 * 8)).toBe(
    Math.fround(Math.fround(0.25 * gain) * gain),
  );
  expect(await readFile(projectPath, "utf8")).toBe(original);
  await expect(
    renderPassageSoundtrack(
      join(root, "saved-revision.wav"),
      passage,
      projectPath,
      { nativeAudio: nativeMix, nativeNarration, expectedRevision: 1 },
    ),
  ).rejects.toThrow(/changed/);
}, 60_000);

it("keeps native narration in saved track filters, ducking and lookahead limiting before selecting a range", async () => {
  const passage = await fixture(),
    voice = await source("duck-voice", 32000, () => 0.25),
    music = await source("duck-music", 24000, () => 0.5);
  passage.plan.narration = {
    reference: "duck authority",
    sha256: voice.asset.sha256.slice(7),
  };
  const comp = document(voice.asset, 8);
  comp.layers = [
    {
      id: "voice",
      type: "audio",
      role: "narration",
      asset: voice.asset.id,
      sourceStartSample: 6000,
      sourceEndSample: 14000,
      gainDb: -6,
      fadeInSamples: 1000,
      fadeOutSamples: 1000,
    },
  ];
  const cacheDirectory = join(root, "duck-cache");
  const native = (await preparePassageNativeAudio(
    passage,
    { first: comp },
    { cacheDirectory, separateNarration: true },
  ))!;
  const nativeAudio = await renderPassageNativeAudio(
    join(root, "duck-sounds.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, stem: "sounds", masterGainDb: 0 },
  );
  const nativeNarration = await renderPassageNativeAudio(
    join(root, "duck-narration.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory, stem: "narration", masterGainDb: 0 },
  );
  const project = soundtrackFromPassage(passage, {
    path: voice.asset.path,
    sha256: voice.asset.sha256,
  });
  project.assets.push({
    id: "music",
    path: music.asset.path,
    sha256: music.asset.sha256,
  });
  project.tracks.push({
    id: "music",
    role: "bgm",
    output: "master",
    gainDb: 0,
    mute: false,
    solo: false,
    processors: [],
  });
  project.tracks[0]!.processors = [
    { type: "highpass", frequencyHz: 40, q: 0.7 },
  ];
  project.clips.push({
    id: "music",
    asset: "music",
    track: "music",
    startSample: 0,
    sourceStartSample: 0,
    sourceEndSample: 24000,
    gainDb: 0,
    fadeInSamples: 0,
    fadeOutSamples: 0,
    automation: { interpolation: "linear", points: [] },
  });
  project.ducking = {
    method: "peak-window-attack-hold-release-1",
    sourceTrack: "narration",
    targetTracks: ["music"],
    thresholdDb: -60,
    attenuationDb: -12,
    windowSamples: 48,
    attackSamples: 480,
    releaseSamples: 480,
    holdSamples: 48,
    lookaheadSamples: 240,
  };
  project.master.limiter = {
    ceilingDb: -12,
    lookaheadSamples: 240,
    releaseSamples: 480,
  };
  const projectPath = join(root, "duck-project.json"),
    original = JSON.stringify(project);
  await writeFile(projectPath, original);
  await mkdir(join(root, "duck-full"));
  await mkdir(join(root, "duck-range"));
  const full = await renderPassageSoundtrack(
    join(root, "duck-full", "mix.wav"),
    passage,
    projectPath,
    { nativeAudio, nativeNarration },
  );
  const range = await renderPassageSoundtrack(
    join(root, "duck-range", "mix.wav"),
    passage,
    projectPath,
    { nativeAudio, nativeNarration, range: { start: 1, end: 11 } },
  );
  const samples = await pcm(full.path);
  expect(
    (await pcm(range.path)).equals(samples.subarray(2000 * 8, 22000 * 8)),
  ).toBe(true);
  const nativeBytes = (await readFile(nativeNarration.path)).subarray(58);
  const combined = await source(
    "duck-independent-voice",
    24000,
    (at, channel) =>
      at < 8000 ? nativeBytes.readFloatLE(at * 8 + channel * 4) : 0.25,
  );
  const reference = structuredClone(project);
  reference.assets[0]!.path = combined.asset.path;
  reference.assets[0]!.sha256 = combined.asset.sha256;
  reference.clips[0]!.sourceStartSample = 0;
  reference.clips[0]!.sourceEndSample = 24000;
  const referencePath = join(root, "duck-independent.json");
  await writeFile(referencePath, JSON.stringify(reference));
  const rendered = await renderSoundtrackProject(
    referencePath,
    join(root, "duck-independent"),
  );
  expect(
    (await pcm(join(rendered.output, "audio", "mix.wav"))).equals(samples),
  ).toBe(true);
  expect(await readFile(projectPath, "utf8")).toBe(original);
  await expect(
    renderPassageSoundtrack(
      join(root, "duck-stale.wav"),
      passage,
      projectPath,
      {
        nativeAudio,
        nativeNarration,
        expectedProjectSha256: "sha256:" + "0".repeat(64),
      },
    ),
  ).rejects.toThrow(/changed/);
}, 60_000);

it("rejects an oversized complete passage before creating any decoded cache even when the requested picture range could be short", async () => {
  const passage = await fixture();
  passage.frameCount = 86_401;
  const audio = await source("oversized-passage", 8000, () => 0.125);
  const cacheDirectory = join(root, "oversized-cache");
  await expect(
    preparePassageNativeAudio(
      passage,
      { first: document(audio.asset, 8) },
      { cacheDirectory },
    ),
  ).rejects.toThrow(/3600-second/);
  expect(
    await lstat(cacheDirectory).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

it("cancels an actual opened complete-master mix and removes its partial whole/range files", async () => {
  const passage = await fixture();
  passage.frameCount = 600;
  passage.endFrameExclusive = 603;
  const audio = await source("cancel-active", 1_200_000, (_, channel) =>
    channel ? -0.125 : 0.25,
  );
  const cacheDirectory = join(root, "cancel-active-cache");
  const native = (await preparePassageNativeAudio(
    passage,
    { first: document(audio.asset, 600) },
    { cacheDirectory },
  ))!;
  const output = join(root, "cancel-active-result.wav"),
    controller = new AbortController();
  let observed = false;
  const timer = setInterval(() => {
    void lstat(output + ".whole.wav").then(
      () => {
        observed = true;
        controller.abort(new Error("cancel active whole PCM"));
      },
      () => undefined,
    );
  }, 5);
  try {
    await expect(
      renderPassageNativeAudio(output, passage, native, undefined, {
        cacheDirectory,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancel active whole PCM/);
  } finally {
    clearInterval(timer);
  }
  expect(observed).toBe(true);
  expect(
    (await readdir(root)).some(
      (name) =>
        name === "cancel-active-result.wav" ||
        name === "cancel-active-result.wav.whole.wav",
    ),
  ).toBe(false);
}, 30_000);

it("exports both passage backends with exact AAC clocks, repeated bytes and an independent PCM encoder reference", async () => {
  const passage = await fixture();
  passage.plan.delivery = [{ id: "exact-slice", start: 7, end: 12 }];
  if (passage.plan.schemaVersion !== "story-passage-2")
    throw new Error("v2 plan expected");
  passage.plan.beats = passage.plan.beats.slice(0, 2).map((beat, index) => ({
    ...beat,
    id: index ? "second" : "first",
    handoff: { mode: "cut", camera: "reset", subjects: [] },
  }));
  for (const beat of passage.beats) {
    beat.focus = [];
    beat.cues = [];
    if ("handoff" in beat)
      beat.handoff = { mode: "cut", camera: "reset", subjects: [] };
  }
  const a = await source("export-tail", 16000, (_, channel) =>
    channel ? -0.125 : 0.0625,
  );
  const b = await source("export-final", 12000, (at, channel) =>
    at === 11999 ? (channel ? -0.25 : 0.125) : channel ? -0.0625 : 0.03125,
  );
  const compositions = {
    first: document(a.asset, 8),
    second: document(b.asset, 6),
  };
  for (const [index, comp] of Object.values(compositions).entries())
    comp.layers.unshift({
      id: "picture",
      type: "solid",
      size: [64, 48],
      color: index ? "#204080" : "#804020",
    });
  const cacheDirectory = join(root, "export-cache");
  const native = (await preparePassageNativeAudio(passage, compositions, {
    cacheDirectory,
  }))!;
  const expected = await renderPassageNativeAudio(
    join(root, "export-reference.wav"),
    passage,
    native,
    undefined,
    { cacheDirectory },
  );
  const reference = join(root, "export-reference.m4a");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    expected.path,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movie_timescale",
    "48000",
    "-use_editlist",
    "1",
    reference,
  ]);
  const referencePcm = await pcm(reference);
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const render = async (
      name: string,
      range?: { start: number; end: number },
      signal?: AbortSignal,
    ) => {
      const output = join(root, name);
      await writePreparedPassage(output, passage);
      const result = await renderStoryPassage(output, passage, undefined, {
        renderer: "composition",
        backend,
        compositions,
        cacheDirectory,
        ...(range ? { range } : {}),
        signal,
      });
      return { result, output };
    };
    const first = await render(`${backend}-full`),
      repeated = await render(`${backend}-repeat`);
    expect(first.result.video.sha256).toBe(repeated.result.video.sha256);
    expect(repeated.result.cache.every((clip) => clip.reused)).toBe(true);
    expect((await pcm(first.result.video.path)).equals(referencePcm)).toBe(
      true,
    );
    expect(
      first.result.video.streams.find(
        (stream) => stream.codec_type === "audio",
      )!.duration_ts,
    ).toBe(24000);
    expect(
      first.result.slices[0]!.streams.find(
        (stream) => stream.codec_type === "audio",
      )!.duration_ts,
    ).toBe(10000);
    const ranged = await render(`${backend}-range`, { start: 7, end: 12 });
    expect(
      ranged.result.video.streams.find(
        (stream) => stream.codec_type === "audio",
      )!.duration_ts,
    ).toBe(10000);
    const controller = new AbortController(),
      output = join(root, `${backend}-cancelled`);
    await writePreparedPassage(output, passage);
    await expect(
      renderStoryPassage(output, passage, undefined, {
        renderer: "composition",
        backend,
        compositions,
        cacheDirectory,
        signal: controller.signal,
        onProgress(progress) {
          if (progress.stage === "assembly")
            controller.abort(new Error("cancel assembled passage"));
        },
      }),
    ).rejects.toThrow(/cancel assembled passage/);
    expect(
      (await readdir(output)).some(
        (name) => name === "passage.mp4" || name.startsWith(".assembly-"),
      ),
    ).toBe(false);
  }
}, 120_000);

it("keys native sequence caches by canonical source content independently of pattern padding, manifest path or first filename", () => {
  const sequence: Composition = {
    schemaVersion: "composition-1",
    id: "portable-sequence",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 6,
    assets: [
      {
        id: "frames",
        type: "sequence",
        path: "/a/%04d.png",
        manifestPath: "/a/frames.json",
        firstFrame: 7,
        sha256: "sha256:" + "a".repeat(64),
        width: 64,
        height: 48,
        frameCount: 6,
        frameRate: { numerator: 24, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [{ id: "picture", type: "sequence", asset: "frames" }],
  };
  const moved = structuredClone(sequence);
  if (moved.assets[0]!.type !== "sequence")
    throw new Error("sequence expected");
  moved.assets[0]!.path = "/b/%010d.png";
  moved.assets[0]!.manifestPath = "/b/manifest.json";
  moved.assets[0]!.firstFrame = 104;
  expect(passageCompositionKey(sequence, "actual-runtime")).toBe(
    passageCompositionKey(moved, "actual-runtime"),
  );
  moved.assets[0]!.sha256 = "sha256:" + "b".repeat(64);
  expect(passageCompositionKey(sequence, "actual-runtime")).not.toBe(
    passageCompositionKey(moved, "actual-runtime"),
  );
});
