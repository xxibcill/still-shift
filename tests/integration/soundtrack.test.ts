import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  mkdir,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { type SoundtrackProject } from "@still-shift/scene-contract";
import {
  renderSoundtrackProject,
  soundtrackChecksum,
  saveSoundtrackEdits,
  readSoundtrackProject,
  packageSoundtrackProject,
} from "@still-shift/animation-engine";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
let root: string, project: SoundtrackProject, path: string;
const pcm = async (file: string) => {
  const raw = file + ".raw";
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-f",
    "f32le",
    "-c:a",
    "pcm_f32le",
    raw,
  ]);
  const bytes = await readFile(raw);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};
const audio = (dir: string, name = "mix") =>
  join(root, dir, "audio", name + ".wav");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce16-runtime-"));
  path = join(root, "project.json");
  for (const [name, expression] of [
    [
      "voice",
      "if(between(t,0.25,0.75)+between(t,1.5,2),0.4*sin(2*PI*220*t),0)",
    ],
    ["music", "0.1"],
    ["effect", "if(eq(n,2400),0.8,0)"],
  ] as const)
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc='${expression}':s=48000:d=3`,
      "-c:a",
      "pcm_f32le",
      join(root, name + ".wav"),
    ]);
  project = {
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    history: { undo: [], redo: [] },
    sampleRate: 48000,
    channels: 2,
    durationSamples: 144000,
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets: await Promise.all(
      ["voice", "music", "effect"].map(async (id) => ({
        id: id + "-source",
        path: id + ".wav",
        sha256: await soundtrackChecksum(join(root, id + ".wav")),
      })),
    ),
    tracks: ["voice", "music", "effect"].map((id, i) => ({
      id,
      role: (["narration", "bgm", "sfx"] as const)[i]!,
      output: i === 0 ? "master" : "bus",
      gainDb: 0,
      mute: false,
      solo: false,
      processors: [],
    })),
    buses: [{ id: "bus", output: "master", gainDb: 0 }],
    master: { id: "master", gainDb: 0 },
    clips: ["voice", "music", "effect"].map((id, i) => ({
      id: id + "-clip",
      asset: id + "-source",
      track: id,
      sourceStartSample: 0,
      sourceEndSample: i === 2 ? 4800 : 144000,
      startSample: i === 2 ? 24000 : 0,
      gainDb: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear", points: [] },
    })),
    ducking: {
      method: "peak-window-attack-hold-release-1",
      sourceTrack: "voice",
      targetTracks: ["music"],
      thresholdDb: -24,
      attenuationDb: -12,
      windowSamples: 480,
      attackSamples: 480,
      releaseSamples: 4800,
      holdSamples: 2400,
      lookaheadSamples: 480,
    },
  };
  await writeFile(path, JSON.stringify(project));
}, 20000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
describe("CE16 offline lifecycle", () => {
  it("renders/reloads exactly, preserves narration, ducks BGM through speech and recovers in pauses", async () => {
    const first = await renderSoundtrackProject(path, join(root, "first"), {
      stems: true,
    });
    const reload = await renderSoundtrackProject(path, join(root, "reload"), {
      stems: true,
    });
    expect(first.identity).toBe(reload.identity);
    for (const name of ["voice", "music", "effect", "bus", "mix"])
      expect(await pcm(audio("first", name))).toEqual(
        await pcm(audio("reload", name)),
      );
    const voice = await pcm(audio("first", "voice"));
    const source = await pcm(join(root, "voice.wav"));
    expect(voice.every((value, i) => value === source[Math.floor(i / 2)])).toBe(
      true,
    );
    const music = await pcm(audio("first", "music"));
    expect(music[0]).toBeCloseTo(0.1, 7);
    expect(music[30000 * 2]).toBeCloseTo(0.1 * 10 ** (-12 / 20), 7);
    expect(music[60000 * 2]).toBeCloseTo(0.1, 7);
    expect(music[11521 * 2]).toBeLessThan(0.1); // lookahead begins before speech.
    const effect = await pcm(audio("first", "effect"));
    expect(effect[26400 * 2]).toBeCloseTo(0.8, 7);
    const mix = await pcm(audio("first"));
    const bus = await pcm(audio("first", "bus"));
    expect(
      mix.every((v, i) => Math.abs(v - Math.fround(voice[i]! + bus[i]!)) === 0),
    ).toBe(true);
    expect(first.files.master!.samplesPerChannel).toBe(144000);
    expect(first.latencySamples).toBe(0);
  }, 20000);
  it("crops only after full effect/ducking evaluation, including mid-envelope seeks", async () => {
    await renderSoundtrackProject(path, join(root, "range"), {
      stems: true,
      range: { start: 11900, end: 41000 },
    });
    for (const name of ["voice", "music", "effect", "bus", "mix"])
      expect(await pcm(audio("range", name))).toEqual(
        (await pcm(audio("first", name))).slice(23800, 82000),
      );
  }, 10000);
  it("atomically edits with revision conflicts and undo/redo; unrelated stems stay exact", async () => {
    const edit = await saveSoundtrackEdits(path, 0, [
      { type: "move", clip: "effect-clip", startSample: 28800 },
      { type: "gain", target: "effect-clip", gainDb: -6 },
    ]);
    expect(edit.revision).toBe(1);
    await expect(
      saveSoundtrackEdits(path, 0, [
        { type: "mute", track: "voice", value: true },
      ]),
    ).rejects.toMatchObject({ code: "revision-conflict" });
    await renderSoundtrackProject(path, join(root, "edited"), { stems: true });
    for (const name of ["voice", "music"])
      expect(await pcm(audio("edited", name))).toEqual(
        await pcm(audio("first", name)),
      );
    const effect = await pcm(audio("edited", "effect"));
    expect(effect[31200 * 2]).toBeCloseTo(0.8 * 10 ** (-6 / 20), 7);
    expect(effect[26400 * 2]).toBe(0);
    // The two-operation request is one undo step.
    await saveSoundtrackEdits(path, 1, [{ type: "undo" }]);
    expect((await readSoundtrackProject(path)).clips).toEqual(project.clips);
    await saveSoundtrackEdits(path, 2, [{ type: "redo" }]);
    expect((await readSoundtrackProject(path)).clips).toEqual(edit.clips);
  }, 10000);
  it("relocates a hash-verified portable package and history without changing PCM", async () => {
    await packageSoundtrackProject(path, join(root, "package"));
    await renderSoundtrackProject(
      join(root, "package/project.json"),
      join(root, "relocated"),
      { stems: true },
    );
    expect(await pcm(audio("relocated"))).toEqual(await pcm(audio("edited")));
    await saveSoundtrackEdits(join(root, "package/project.json"), 3, [
      { type: "undo" },
    ]);
    expect(
      (await readSoundtrackProject(join(root, "package/project.json")))
        .revision,
    ).toBe(4);
  }, 10000);
  it("rejects asset tampering, missing runtime and truncated source intervals without publishing", async () => {
    const original = await readFile(join(root, "music.wav"));
    await writeFile(join(root, "music.wav"), "tampered");
    await expect(
      renderSoundtrackProject(path, join(root, "tamper")),
    ).rejects.toMatchObject({ code: "source-checksum" });
    await writeFile(join(root, "music.wav"), original);
    const prior = process.env.STILL_SHIFT_SOUNDTRACK_PYTHON;
    process.env.STILL_SHIFT_SOUNDTRACK_PYTHON = join(root, "missing-python");
    try {
      await expect(
        renderSoundtrackProject(path, join(root, "missing")),
      ).rejects.toMatchObject({ code: "runtime-missing" });
    } finally {
      if (prior === undefined) delete process.env.STILL_SHIFT_SOUNDTRACK_PYTHON;
      else process.env.STILL_SHIFT_SOUNDTRACK_PYTHON = prior;
    }
    const bad = structuredClone(project);
    bad.clips[2]!.sourceStartSample = 143000;
    bad.clips[2]!.sourceEndSample = 147800;
    await writeFile(join(root, "bad.json"), JSON.stringify(bad));
    await expect(
      renderSoundtrackProject(join(root, "bad.json"), join(root, "truncated")),
    ).rejects.toMatchObject({ code: "source-range" });
    for (const name of ["tamper", "missing", "truncated"])
      expect(await readdir(root)).not.toContain(name);
  }, 10000);
  it("cancels a running worker, cleans staging and allows retry; protects completed outputs", async () => {
    await expect(
      renderSoundtrackProject(path, join(root, "timeout"), { timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "worker-timeout" });
    const controller = new AbortController();
    const cancelled = renderSoundtrackProject(path, join(root, "cancelled"), {
      signal: controller.signal,
    });
    let workerStarted = false;
    const timer = setInterval(async () => {
      for (const name of await readdir(root)) {
        if (
          name.startsWith("cancelled.") &&
          name.endsWith(".tmp") &&
          (await lstat(join(root, name, "audio")).then(
            () => true,
            () => false,
          ))
        ) {
          workerStarted = true;
          controller.abort(new Error("test cancellation"));
          clearInterval(timer);
          break;
        }
      }
    }, 2);
    try {
      await expect(cancelled).rejects.toThrow(/test cancellation/);
    } finally {
      clearTimeout(timer);
    }
    expect(workerStarted).toBe(true);
    expect(
      (await readdir(root)).filter(
        (name) => name.includes(".tmp") || name.endsWith(".lock"),
      ),
    ).toEqual([]);
    await renderSoundtrackProject(path, join(root, "cancelled"));
    await expect(
      renderSoundtrackProject(path, join(root, "cancelled")),
    ).rejects.toMatchObject({ code: "output-exists" });
  }, 10000);
  it("command inspection and edit are JSON, fresh-process reload uses the same saved authority", async () => {
    const output: string[] = [];
    const io = {
      stdout: (v: string) => output.push(v),
      stderr: (v: string) => output.push(v),
    };
    expect(
      await runCli(["soundtrack", "inspect", "--project", path, "--json"], io),
    ).toBe(0);
    expect(JSON.parse(output[0]!).result.revision).toBe(3);
    const child = await runProcess(process.execPath, [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "soundtrack",
      "validate",
      "--project",
      path,
    ]);
    expect(JSON.parse(child.stdout).result.valid).toBe(true);
  }, 10000);
});

it("clip fades and linear/hold automation have authored sample gains; filters retain tails with calibrated onset", async () => {
  const p = structuredClone(project);
  p.ducking = undefined as never;
  delete p.ducking;
  p.clips = p.clips.filter((c) => c.track === "music" || c.track === "effect");
  p.clips[0]!.sourceEndSample = 4800;
  p.clips[0]!.fadeInSamples = 480;
  p.clips[0]!.fadeOutSamples = 480;
  p.clips[0]!.automation = {
    interpolation: "linear",
    points: [
      { sample: 0, gain: 0.5 },
      { sample: 4800, gain: 1 },
    ],
  };
  p.tracks[2]!.processors = [
    { type: "highpass", frequencyHz: 100, q: Math.SQRT1_2 },
    { type: "lowpass", frequencyHz: 5500, q: Math.SQRT1_2 },
  ];
  const path = join(root, "dsp.json");
  await writeFile(path, JSON.stringify(p));
  const report = await renderSoundtrackProject(path, join(root, "dsp"), {
    stems: true,
  });
  const music = await pcm(audio("dsp", "music"));
  expect(music[0]).toBe(0);
  expect(music[240 * 2]).toBeCloseTo(0.1 * 0.5 * (0.5 + (0.5 * 240) / 4800), 7);
  expect(music[4560 * 2]).toBeCloseTo(
    0.1 * 0.5 * (0.5 + (0.5 * 4560) / 4800),
    7,
  );
  const effect = await pcm(audio("dsp", "effect"));
  expect(effect[26400 * 2]).not.toBe(0);
  expect(effect[26401 * 2]).not.toBe(0);
  const probes = report.latencyProbes as {
    onsetSample: number;
    compensationSamples: number;
  }[];
  expect(probes[0]!.onsetSample).toBe(1024);
  expect(probes[0]!.compensationSamples).toBe(0);
  const range = await renderSoundtrackProject(path, join(root, "dsp-range"), {
    stems: true,
    range: { start: 26401, end: 29000 },
  });
  expect(range.files.effect!.samplesPerChannel).toBe(2599);
  expect(await pcm(audio("dsp-range", "effect"))).toEqual(
    effect.slice(52802, 58000),
  );
  p.clips[0]!.automation = {
    interpolation: "hold",
    points: [
      { sample: 0, gain: 0.25 },
      { sample: 2400, gain: 0.5 },
    ],
  };
  await writeFile(path, JSON.stringify(p));
  await renderSoundtrackProject(path, join(root, "hold"), { stems: true });
  const hold = await pcm(audio("hold", "music"));
  expect(hold[2399 * 2]).toBeCloseTo(0.025, 7);
  expect(hold[2400 * 2]).toBeCloseTo(0.05, 7);
}, 10000);

it("invalid batches leave saved bytes intact; stale locks/stages recover and concurrent saves cannot overwrite", async () => {
  const before = await readFile(path);
  await expect(
    saveSoundtrackEdits(path, 3, [
      { type: "gain", target: "effect-clip", gainDb: -20 },
      { type: "move", clip: "effect-clip", startSample: 144000 },
    ]),
  ).rejects.toMatchObject({ code: "clip-range" });
  expect(await readFile(path)).toEqual(before);
  const target = join(root, "recovered"),
    abandoned = target + ".12345678-1234-1234-1234-123456789abc.tmp";
  await mkdir(abandoned);
  await writeFile(join(abandoned, "partial.wav"), "partial");
  await writeFile(
    target + ".lock",
    JSON.stringify({
      pid: 99999999,
      token: "stale",
      processStartedAt: "not-live",
    }),
  );
  await renderSoundtrackProject(path, target);
  expect(
    await lstat(abandoned).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  const outcomes = await Promise.allSettled([
    saveSoundtrackEdits(path, 3, [
      { type: "gain", target: "effect-clip", gainDb: -9 },
    ]),
    saveSoundtrackEdits(path, 3, [
      { type: "gain", target: "effect-clip", gainDb: -12 },
    ]),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await readSoundtrackProject(path)).revision).toBe(4);
}, 10000);

it("duck lookahead, attack, hold and release have exact sample boundaries and never alter the detector", async () => {
  const speech = join(root, "square-speech.wav");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='if(between(n,100,199),0.8,0)':s=48000:d=0.02",
    "-c:a",
    "pcm_f32le",
    speech,
  ]);
  const p = structuredClone(project);
  p.assets[0]!.path = speech;
  p.assets[0]!.sha256 = await soundtrackChecksum(speech);
  p.clips[0]!.sourceEndSample = 960;
  p.ducking = {
    method: "peak-window-attack-hold-release-1",
    sourceTrack: "voice",
    targetTracks: ["music"],
    thresholdDb: -20,
    attenuationDb: -6,
    windowSamples: 1,
    attackSamples: 4,
    releaseSamples: 8,
    holdSamples: 3,
    lookaheadSamples: 2,
  };
  const square = join(root, "square.json");
  await writeFile(square, JSON.stringify(p));
  await renderSoundtrackProject(square, join(root, "duck-boundaries"), {
    stems: true,
  });
  const music = await pcm(audio("duck-boundaries", "music")),
    voice = await pcm(audio("duck-boundaries", "voice"));
  const floor = 10 ** (-6 / 20),
    step = (1 - floor) / 4;
  expect(music[97 * 2]).toBeCloseTo(0.1, 7);
  for (let sample = 98; sample <= 101; sample++)
    expect(music[sample * 2]).toBeCloseTo(0.1 * (1 - (sample - 97) * step), 7);
  expect(music[200 * 2]).toBeCloseTo(0.1 * floor, 7);
  expect(music[201 * 2]).toBeCloseTo(0.1 * (floor + (1 - floor) / 8), 7);
  expect(music[208 * 2]).toBeCloseTo(0.1, 7);
  expect(voice[99 * 2]).toBe(0);
  expect(voice[100 * 2]).toBeCloseTo(0.8, 7);
  expect(voice[199 * 2]).toBeCloseTo(0.8, 7);
  expect(voice[200 * 2]).toBe(0);
}, 10000);
