import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
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
import {
  soundtrackWorkingBytes,
  type SoundtrackProject,
} from "@still-shift/scene-contract";
import { soundtrackPython } from "../../packages/animation-engine/src/soundtrack-render.ts";
import {
  renderSoundtrackProject,
  soundtrackChecksum,
  saveSoundtrackEdits,
  readSoundtrackProject,
  packageSoundtrackProject,
} from "@still-shift/animation-engine";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { runSoundtrackCli } from "../../tools/still-shift-cli/src/soundtrack-cli.ts";
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
    expect(first.files.master!.samplesAboveFullScale).toBe(0);
    expect(first.files.master!.peakDbfs).toBeLessThan(0);
  }, 20000);
  it("reports headroom from written PCM: overs, peak level and silent stems", async () => {
    const level = (samples: Float32Array) => {
      let peak = 0,
        overs = 0;
      for (let i = 0; i < samples.length; i += 2) {
        const frame = Math.max(
          Math.abs(samples[i]!),
          Math.abs(samples[i + 1]!),
        );
        peak = Math.max(peak, frame);
        if (frame > 1) overs++;
      }
      return { peak, overs };
    };
    // +6 dB master pushes only the effect impulse (0.8 over ducked music) over 0 dBFS.
    const hotPath = join(root, "hot.json");
    await writeFile(
      hotPath,
      JSON.stringify({ ...project, master: { id: "master", gainDb: 6 } }),
    );
    const hot = await renderSoundtrackProject(hotPath, join(root, "hot"), {
      stems: true,
    });
    const mix = level(await pcm(audio("hot")));
    expect(mix.overs).toBe(1);
    expect(hot.files.master!.samplesAboveFullScale).toBe(mix.overs);
    expect(hot.files.master!.peakDbfs).toBeCloseTo(
      20 * Math.log10(mix.peak),
      5,
    );
    expect(hot.files.effect!.samplesAboveFullScale).toBe(0);
    const mutedPath = join(root, "hot-muted.json");
    await writeFile(
      mutedPath,
      JSON.stringify({
        ...project,
        master: { id: "master", gainDb: 6 },
        tracks: project.tracks.map((t) =>
          t.id === "effect" ? { ...t, mute: true } : t,
        ),
      }),
    );
    const muted = await renderSoundtrackProject(
      mutedPath,
      join(root, "hot-muted"),
      { stems: true },
    );
    expect(muted.files.effect!.peakDbfs).toBeNull();
    expect(muted.files.effect!.samplesAboveFullScale).toBe(0);
    expect(muted.files.master!.samplesAboveFullScale).toBe(0);
    expect(level(await pcm(audio("hot-muted"))).overs).toBe(0);
  }, 20000);
  it("pans clips with a unity-centre constant-power law, before ducking detection", async () => {
    const render = async (name: string, pans: Record<string, number>) => {
      const file = join(root, name + ".json");
      await writeFile(
        file,
        JSON.stringify({
          ...project,
          clips: project.clips.map((c) =>
            c.id in pans ? { ...c, pan: pans[c.id] } : c,
          ),
        }),
      );
      return renderSoundtrackProject(file, join(root, name), { stems: true });
    };
    await render("pan-none", {});
    const centred = await render("pan-centre", {
      "voice-clip": 0,
      "music-clip": 0,
      "effect-clip": 0,
    });
    await render("pan-sides", {
      "voice-clip": -0.5,
      "music-clip": 0.5,
      "effect-clip": -1,
    });
    // An explicit centre renders bit-identically to an unpanned project.
    for (const name of ["voice", "music", "effect", "mix", "duck-envelope"])
      expect(await pcm(audio("pan-centre", name))).toEqual(
        await pcm(audio("pan-none", name)),
      );
    expect(centred.dspVersion).toBe("soundtrack-dsp-6");
    // Moving narration in the stereo field leaves the ducking envelope unchanged.
    expect(await pcm(audio("pan-sides", "duck-envelope"))).toEqual(
      await pcm(audio("pan-none", "duck-envelope")),
    );
    // Hard left: exact silence on the right, +3 dB on the left.
    const effect = await pcm(audio("pan-sides", "effect"));
    expect(effect.filter((_, i) => i % 2 === 1).every((v) => v === 0)).toBe(
      true,
    );
    expect(effect[26400 * 2]).toBe(
      Math.fround(Math.fround(0.8) * Math.fround(Math.SQRT2)),
    );
    // Intermediate positions follow sqrt(2)·cos/sin((pan + 1)·π/4) per channel.
    const law = (pan: number) => {
      const angle = ((pan + 1) * Math.PI) / 4;
      return [Math.SQRT2 * Math.cos(angle), Math.SQRT2 * Math.sin(angle)];
    };
    for (const [name, pan, frame] of [
      ["voice", -0.5, 12100],
      ["music", 0.5, 1000],
      ["music", 0.5, 30000],
    ] as const) {
      const panned = await pcm(audio("pan-sides", name)),
        plain = await pcm(audio("pan-none", name)),
        [left, right] = law(pan);
      expect(plain[frame * 2]).not.toBe(0);
      expect(panned[frame * 2]! / plain[frame * 2]!).toBeCloseTo(left!, 6);
      expect(panned[frame * 2 + 1]! / plain[frame * 2 + 1]!).toBeCloseTo(
        right!,
        6,
      );
      expect(left! ** 2 + right! ** 2).toBeCloseTo(2, 12);
    }
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

it("reused sounds share one decode pass and match per-clip decoding sample for sample", async () => {
  // A distinct value per source sample makes any slicing error visible.
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='(n+1)/262144':s=48000:d=3",
    "-c:a",
    "pcm_f32le",
    join(root, "ramp.wav"),
  ]);
  const sha256 = await soundtrackChecksum(join(root, "ramp.wav"));
  // Lower the decode budget to 12,000 samples of held clips. "near" and "far"
  // clips total 9,600 samples, so each asset decodes in one pass, even though
  // "far" covers 124,800 source samples. Each 30,000-sample "wide" clip exceeds
  // the budget and streams straight into its track.
  process.env.STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES = "12000";
  onTestFinished(() => {
    delete process.env.STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES;
  });
  const placements = [
    ["near", 0, 4800, 0, "effect"],
    ["near", 2400, 7200, 12000, "effect"],
    ["far", 0, 4800, 24000, "effect"],
    ["far", 120000, 124800, 36000, "effect"],
    ["wide", 0, 30000, 0, "wide-a"],
    ["wide", 100000, 130000, 18000, "wide-b"],
  ] as const;
  const p: SoundtrackProject = {
    ...structuredClone(project),
    durationSamples: 48000,
    assets: ["near", "far", "wide"].map((id) => ({
      id,
      path: "ramp.wav",
      sha256,
    })),
    tracks: ["effect", "wide-a", "wide-b"].map((id) => ({
      ...project.tracks[2]!,
      id,
      output: "master",
    })),
    buses: [],
    clips: placements.map(([asset, start, end, at, track], i) => ({
      id: "hit-" + i,
      asset,
      track,
      sourceStartSample: start,
      sourceEndSample: end,
      startSample: at,
      gainDb: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear" as const, points: [] },
    })),
  };
  delete p.ducking;
  const reuse = join(root, "reuse.json");
  await writeFile(reuse, JSON.stringify(p));
  await renderSoundtrackProject(reuse, join(root, "reuse"), { stems: true });
  const source = await pcm(join(root, "ramp.wav"));
  const stems = Object.fromEntries(
    await Promise.all(
      ["effect", "wide-a", "wide-b"].map(
        async (name) => [name, await pcm(audio("reuse", name))] as const,
      ),
    ),
  );
  for (const [, start, end, at, track] of placements)
    for (let i = 0; i < end - start; i++)
      for (const channel of [0, 1])
        expect(stems[track]![(at + i) * 2 + channel]).toBe(source[start + i]);
  // Tracks render one at a time. Within a track, decoding runs ahead in
  // parallel, but a failure is reported at the first affected clip in authored
  // order, even when a later pass fails first. "hit-broken" has an unreadable
  // source, so its probe fails inside the pool.
  await writeFile(join(root, "broken.wav"), "not audio");
  const broken = {
    id: "broken",
    path: "broken.wav",
    sha256: await soundtrackChecksum(join(root, "broken.wav")),
  };
  for (const [clips, withBroken, code, first] of [
    [[1, 3], true, "source-range", "hit-1"],
    [[1], true, "source-range", "hit-1"],
    [[3], false, "source-range", "hit-3"],
    // A clip longer than a quarter of the project streams straight from FFmpeg.
    [[5], false, "source-range", "hit-5"],
    [[], true, "media-decode", undefined],
  ] as const) {
    const variant = structuredClone(p);
    for (const index of clips) {
      const clip = variant.clips[index]!,
        length = clip.sourceEndSample - clip.sourceStartSample;
      clip.sourceEndSample = 144001;
      clip.sourceStartSample = 144001 - length;
    }
    if (withBroken) {
      variant.assets.push(broken);
      // Short and authored right after "near", so its failing decode runs in
      // parallel with the pass that holds hit-1.
      variant.clips.splice(2, 0, {
        ...variant.clips[0]!,
        id: "hit-broken",
        asset: "broken",
        sourceEndSample: 100,
      });
    }
    await writeFile(reuse, JSON.stringify(variant));
    const failure = renderSoundtrackProject(
      reuse,
      join(root, "reuse-failure-" + code + "-" + clips.join("-")),
    );
    await expect(failure).rejects.toMatchObject({ code });
    if (first)
      await expect(failure).rejects.toMatchObject({ context: { clip: first } });
  }
}, 30000);

it("ducking follows narration clip gain and automation but not track mute (pre-fader sidechain)", async () => {
  const speech = join(root, "sidechain-speech.wav");
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
  const music = async (
    name: string,
    change: (q: SoundtrackProject) => void,
  ) => {
    const q = structuredClone(p);
    change(q);
    const file = join(root, name + ".json");
    await writeFile(file, JSON.stringify(q));
    await renderSoundtrackProject(file, join(root, name), { stems: true });
    return pcm(audio(name, "music"));
  };
  const floor = 0.1 * 10 ** (-6 / 20);
  // 0.8 at −20 dB clip gain is 0.08, below the 0.1 (−20 dBFS) threshold.
  const quiet = await music("sidechain-gain", (q) => {
    q.clips[0]!.gainDb = -20;
  });
  expect(quiet[150 * 2]).toBe(Math.fround(0.1));
  // Automation holds the voice at 0.05 until sample 150, so ducking starts there
  // (minus the 2-sample lookahead), not at the raw onset at 100.
  const automated = await music("sidechain-automation", (q) => {
    q.clips[0]!.automation = {
      interpolation: "hold",
      points: [
        { sample: 0, gain: 0.05 },
        { sample: 150, gain: 1 },
      ],
    };
  });
  expect(automated[120 * 2]).toBe(Math.fround(0.1));
  expect(automated[147 * 2]).toBe(Math.fround(0.1));
  expect(automated[149 * 2]).toBeLessThan(0.1);
  expect(automated[190 * 2]).toBeCloseTo(floor, 7);
  // Muting narration to audition the mix keeps the final-mix ducking.
  const muted = await music("sidechain-mute", (q) => {
    q.tracks[0]!.mute = true;
  });
  expect(muted[150 * 2]).toBeCloseTo(floor, 7);
  expect(await pcm(audio("sidechain-mute", "voice"))).toEqual(
    new Float32Array(144000 * 2),
  );
}, 20000);

it("rejects oversized serialized edits without changing the saved project", async () => {
  const dense = structuredClone(project);
  dense.clips = Array.from({ length: 40 }, (_, index) => ({
    ...dense.clips[0]!,
    id: "dense-" + index,
    automation: {
      interpolation: "linear" as const,
      points: Array.from({ length: 2048 }, (_, sample) => ({
        sample,
        gain: 0.12345678912345,
      })),
    },
  }));
  const file = join(root, "dense-project.json");
  const original = Buffer.from(JSON.stringify(dense));
  expect(original.byteLength).toBeLessThan(8_000_000);
  await writeFile(file, original);
  await expect(readSoundtrackProject(file)).resolves.toMatchObject({
    revision: 0,
  });
  const failure = await saveSoundtrackEdits(file, 0, [
    { type: "gain", target: "dense-0", kind: "clip", gainDb: -5 },
  ]).then(
    () => undefined,
    (error: { code: string }) => error.code,
  );
  expect(failure).toBe("project-size");
  expect((await readFile(file)).equals(original)).toBe(true);
  expect((await readSoundtrackProject(file)).revision).toBe(0);
  expect(
    (await readdir(root)).filter((name) =>
      name.startsWith("dense-project.json."),
    ),
  ).toEqual([]);
});

it.each([1, 511, 512, 513, 48005, 110400])(
  "renders the exact integer sample duration %i for silent projects",
  async (durationSamples) => {
    const silent: SoundtrackProject = {
      ...structuredClone(project),
      durationSamples,
      assets: [],
      clips: [],
      tracks: [],
      buses: [],
      history: { undo: [], redo: [] },
    };
    delete silent.ducking;
    const file = join(root, `silent-${durationSamples}.json`);
    await writeFile(file, JSON.stringify(silent));
    const output = join(root, `silent-${durationSamples}`);
    const manifest = await renderSoundtrackProject(file, output);
    expect(manifest.files.master!.samplesPerChannel).toBe(durationSamples);
    const samples = await pcm(join(output, "audio/mix.wav"));
    expect(samples.length).toBe(durationSamples * 2);
    expect(samples.every((sample) => sample === 0)).toBe(true);
  },
  10000,
);

it("preserves narration, stems and range PCM at a rounded 30 fps duration", async () => {
  const authored = structuredClone(project);
  authored.durationSamples = 69 * 1600;
  authored.clips[0]!.sourceEndSample = authored.durationSamples;
  authored.clips[1]!.sourceEndSample = authored.durationSamples;
  authored.clips[2]!.startSample = authored.durationSamples - 4800;
  authored.tracks[2]!.processors = [
    { type: "lowpass", frequencyHz: 5500, q: Math.SQRT1_2 },
  ];
  const file = join(root, "rounded-picture.json");
  await writeFile(file, JSON.stringify(authored));
  const full = await renderSoundtrackProject(
    file,
    join(root, "rounded-picture"),
    {
      stems: true,
    },
  );
  for (const stem of Object.values(full.files))
    expect(stem.samplesPerChannel).toBe(authored.durationSamples);
  const narration = await pcm(audio("rounded-picture", "voice"));
  const source = await pcm(join(root, "voice.wav"));
  expect(
    narration.every((value, index) => value === source[Math.floor(index / 2)]),
  ).toBe(true);
  const start = authored.durationSamples - 2401;
  const range = await renderSoundtrackProject(
    file,
    join(root, "rounded-picture-range"),
    {
      stems: true,
      range: { start, end: authored.durationSamples },
    },
  );
  for (const [id, stem] of Object.entries(range.files)) {
    expect(stem.samplesPerChannel).toBe(2401);
    const fullSamples = await pcm(
      join(full.output, "audio", full.files[id]!.file),
    );
    const rangeSamples = await pcm(join(range.output, "audio", stem.file));
    expect(rangeSamples).toEqual(fullSamples.slice(start * 2));
  }
}, 10000);

it.each(["silence", "delayed speech"])(
  "does not duck before %s with a hold longer than the project",
  async (scenario) => {
    const voice = join(root, `long-hold-${scenario}.wav`);
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      scenario === "silence"
        ? "aevalsrc=0:s=48000:d=1"
        : "aevalsrc='if(between(n,24000,35999),0.8,0)':s=48000:d=1",
      "-c:a",
      "pcm_f32le",
      voice,
    ]);
    const p = structuredClone(project);
    p.durationSamples = 48000;
    p.assets[0]!.path = voice;
    p.assets[0]!.sha256 = await soundtrackChecksum(voice);
    p.clips = p.clips.filter((clip) => clip.track !== "effect");
    for (const clip of p.clips) clip.sourceEndSample = p.durationSamples;
    p.ducking!.lookaheadSamples = 0;
    p.ducking!.holdSamples = 96000;
    const file = join(root, `long-hold-${scenario}.json`);
    await writeFile(file, JSON.stringify(p));
    const output = join(root, `long-hold-${scenario}`);
    const rendered = await renderSoundtrackProject(file, output, {
      stems: true,
    });
    const music = await pcm(join(output, "audio/music.wav"));
    const speechStart = scenario === "silence" ? p.durationSamples : 24000;
    expect(
      music
        .slice(0, speechStart * 2)
        .every((sample) => sample === Math.fround(0.1)),
    ).toBe(true);
    if (scenario === "delayed speech") {
      expect(music[24000 * 2]).toBeLessThan(Math.fround(0.1));
      expect(music[24479 * 2]).toBeCloseTo(0.1 * 10 ** (-12 / 20), 7);
      expect(music.at(-1)).toBeCloseTo(0.1 * 10 ** (-12 / 20), 7);
    }
    expect(rendered.dspVersion).toBe("soundtrack-dsp-6");
    expect((rendered.identityInputs as { dsp: string }).dsp).toBe(
      "soundtrack-dsp-6",
    );
  },
  10000,
);

it("rejects colliding stem filenames before rendering and accepts a distinct mixed-case name", async () => {
  const p = structuredClone(project);
  delete p.ducking;
  p.tracks = [{ ...p.tracks[1]!, id: "Mix", output: "master" }];
  p.buses = [];
  p.clips = [{ ...p.clips[1]!, track: "Mix" }];
  p.master.gainDb = -6;
  const file = join(root, "case-stems.json");
  const output = join(root, "case-stems");
  await writeFile(file, JSON.stringify(p));
  await expect(
    renderSoundtrackProject(file, output, { stems: true }),
  ).rejects.toMatchObject({ code: "reserved-id" });
  expect(
    (await readdir(root)).filter(
      (name) => name === "case-stems" || name.startsWith("case-stems."),
    ),
  ).toEqual(["case-stems.json"]);
  p.tracks[0]!.id = "MusicBed";
  p.clips[0]!.track = "MusicBed";
  await writeFile(file, JSON.stringify(p));
  const rendered = await renderSoundtrackProject(file, output, { stems: true });
  expect(rendered.files.MusicBed!.file).toBe("MusicBed.wav");
  expect(rendered.files.master!.file).toBe("mix.wav");
  const stem = await pcm(join(output, "audio/MusicBed.wav"));
  const mix = await pcm(join(output, "audio/mix.wav"));
  expect(stem[0]).toBe(Math.fround(0.1));
  expect(mix[0]).toBeCloseTo(0.1 * 10 ** (-6 / 20), 7);
  expect(rendered.files.MusicBed!.sha256).not.toBe(
    rendered.files.master!.sha256,
  );
}, 10000);

it("file-backed edits hash an added cue source relative to the project and render it", async () => {
  const dir = join(root, "cue-authoring");
  await mkdir(join(dir, "sfx"), { recursive: true });
  await writeFile(
    join(dir, "sfx/pop.wav"),
    await readFile(join(root, "effect.wav")),
  );
  const p = structuredClone(project);
  delete p.ducking;
  p.assets = p.assets.map((a) => ({ ...a, path: "../" + a.path }));
  const file = join(dir, "project.json");
  await writeFile(file, JSON.stringify(p));
  const saved = await readFile(file);
  // A stated identity must match the bytes; nothing is saved otherwise.
  await expect(
    saveSoundtrackEdits(file, 0, [
      {
        type: "add-asset",
        id: "pop",
        path: "sfx/pop.wav",
        sha256: "sha256:" + "0".repeat(64),
      },
    ]),
  ).rejects.toMatchObject({ code: "source-checksum" });
  await expect(
    saveSoundtrackEdits(file, 0, [
      { type: "add-asset", id: "pop", path: "sfx/missing.wav" },
    ]),
  ).rejects.toMatchObject({ code: "source-missing" });
  expect(await readFile(file)).toEqual(saved);
  const edited = await saveSoundtrackEdits(file, 0, [
    { type: "add-asset", id: "pop", path: "sfx/pop.wav" },
    {
      type: "add-clip",
      id: "pop-cue",
      asset: "pop",
      track: "effect",
      sourceStartSample: 0,
      sourceEndSample: 4800,
      startSample: 96000,
      gainDb: -6,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear", points: [] },
    },
  ]);
  expect(edited.revision).toBe(1);
  expect(edited.assets.at(-1)).toEqual({
    id: "pop",
    path: "sfx/pop.wav",
    sha256: await soundtrackChecksum(join(root, "effect.wav")),
  });
  const output = join(dir, "render");
  await renderSoundtrackProject(file, output, { stems: true });
  const effect = await pcm(join(output, "audio/effect.wav"));
  // The original impulse at 24000 + 2400 is untouched; the cue adds 96000 + 2400.
  expect(effect[26400 * 2]).toBe(Math.fround(0.8));
  expect(effect[98400 * 2]).toBeCloseTo(0.8 * 10 ** (-6 / 20), 7);
  expect(effect[98400 * 2 + 1]).toBeCloseTo(0.8 * 10 ** (-6 / 20), 7);
  // Removing the cue in one request restores the previous effect stem exactly.
  await saveSoundtrackEdits(file, 1, [
    { type: "remove-clip", clip: "pop-cue" },
    { type: "remove-asset", asset: "pop" },
  ]);
  await renderSoundtrackProject(file, join(dir, "removed"), { stems: true });
  const restored = await pcm(join(dir, "removed/audio/effect.wav"));
  expect(restored.subarray(0, 96000 * 2)).toEqual(
    effect.subarray(0, 96000 * 2),
  );
  expect(restored.subarray(96000 * 2).every((v) => v === 0)).toBe(true);
}, 20000);

it("equal-power fades follow a quarter-sine gain; absent and linear curves stay bit-identical", async () => {
  const p = structuredClone(project);
  delete p.ducking;
  p.clips = p.clips.filter((c) => c.track === "music");
  Object.assign(p.clips[0]!, {
    sourceEndSample: 4800,
    fadeInSamples: 960,
    fadeOutSamples: 1920,
  });
  const file = join(root, "curves.json");
  await writeFile(file, JSON.stringify(p));
  const absent = await renderSoundtrackProject(
    file,
    join(root, "curve-absent"),
  );
  expect(absent.dspVersion).toBe("soundtrack-dsp-6");
  const linear = await pcm(audio("curve-absent"));
  Object.assign(p.clips[0]!, {
    fadeInCurve: "linear",
    fadeOutCurve: "linear",
  });
  await writeFile(file, JSON.stringify(p));
  await renderSoundtrackProject(file, join(root, "curve-linear"));
  expect(await pcm(audio("curve-linear"))).toEqual(linear);
  Object.assign(p.clips[0]!, {
    fadeInCurve: "equal-power",
    fadeOutCurve: "equal-power",
  });
  await writeFile(file, JSON.stringify(p));
  await renderSoundtrackProject(file, join(root, "curve-power"));
  const power = await pcm(audio("curve-power"));
  const gain = (ramp: number) => 0.1 * Math.sin((Math.PI / 2) * ramp);
  expect(power[0]).toBe(0);
  // Midpoints sit at −3 dB instead of the linear −6 dB.
  expect(power[480 * 2]).toBeCloseTo(gain(0.5), 7);
  expect(power[480 * 2]).toBeCloseTo(0.1 * Math.SQRT1_2, 7);
  expect(linear[480 * 2]).toBeCloseTo(0.05, 7);
  expect(power[120 * 2 + 1]).toBeCloseTo(gain(120 / 960), 7);
  expect(power[(4800 - 960) * 2]).toBeCloseTo(gain(0.5), 7);
  expect(power[4799 * 2]).toBeCloseTo(gain(1 / 1920), 7);
  // Outside the fades both shapes are exact unity.
  expect(power.subarray(960 * 2, 2880 * 2)).toEqual(
    linear.subarray(960 * 2, 2880 * 2),
  );
  expect(power.subarray(4800 * 2).every((v) => v === 0)).toBe(true);
  // A curve applies only to its own fade.
  delete p.clips[0]!.fadeOutCurve;
  await writeFile(file, JSON.stringify(p));
  await renderSoundtrackProject(file, join(root, "curve-mixed"));
  const mixed = await pcm(audio("curve-mixed"));
  expect(mixed.subarray(0, 2880 * 2)).toEqual(power.subarray(0, 2880 * 2));
  expect(mixed.subarray(2880 * 2)).toEqual(linear.subarray(2880 * 2));
}, 20000);

it("worker and contract agree on the working-memory estimate", async () => {
  const states = [];
  for (let seed = 0; seed < 40; seed++) {
    const p = structuredClone(project);
    const buses = seed % 9;
    p.buses = Array.from({ length: buses }, (_, i) => ({
      id: "b" + i,
      // Alternate nesting and flat buses, always reaching master.
      output: i + 1 < buses && (seed + i) % 3 ? "b" + (i + 1) : "master",
      gainDb: 0,
    }));
    p.tracks = p.tracks.map((track, i) => ({
      ...track,
      output: buses ? "b" + ((seed + i) % buses) : "master",
      processors:
        (seed + i) % 4 === 0
          ? [{ type: "lowpass" as const, frequencyHz: 4000, q: 0.7 }]
          : [],
    }));
    if (seed % 2) delete p.ducking;
    p.durationSamples = 48000 * (1 + seed * 7);
    states.push(p);
  }
  const script = [
    "import importlib.util, json, sys",
    "spec = importlib.util.spec_from_file_location('w', sys.argv[1])",
    "w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)",
    "print(json.dumps([w.working_bytes(p) for p in json.load(sys.stdin)]))",
  ].join("\n");
  const input = join(root, "working-bytes.json");
  await writeFile(input, JSON.stringify(states));
  const { stdout } = await runProcess("sh", [
    "-c",
    '"$0" -c "$1" "$2" < "$3"',
    soundtrackPython(),
    script,
    join(
      import.meta.dirname,
      "../../packages/animation-engine/src/soundtrack-worker.py",
    ),
    input,
  ]);
  expect(JSON.parse(stdout)).toEqual(
    states.map((state) => soundtrackWorkingBytes(state)),
  );
});

it("renders a ten-minute ducked, filtered and bussed project within its estimate", async () => {
  const tenMinutes = 28_800_000;
  const dir = join(root, "ten-minutes");
  await mkdir(dir, { recursive: true });
  for (const [name, expression] of [
    ["speech", "if(lt(mod(t,10),6),0.4*sin(2*PI*220*t),0)"],
    ["bed", "0.1*sin(2*PI*55*t)"],
  ] as const)
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc='${expression}':s=48000:d=600`,
      "-c:a",
      "pcm_s16le",
      join(dir, name + ".wav"),
    ]);
  const p = structuredClone(project);
  p.durationSamples = tenMinutes;
  p.assets = await Promise.all(
    ["speech", "bed"].map(async (id) => ({
      id,
      path: id + ".wav",
      sha256: await soundtrackChecksum(join(dir, id + ".wav")),
    })),
  );
  p.tracks = [
    { ...project.tracks[0]!, output: "dialogue-bus" },
    {
      ...project.tracks[1]!,
      output: "music-bus",
      processors: [{ type: "highpass", frequencyHz: 40, q: 0.7 }],
    },
  ];
  p.buses = [
    { id: "dialogue-bus", output: "master", gainDb: 0 },
    { id: "music-bus", output: "master", gainDb: -3 },
  ];
  p.clips = ["speech", "bed"].map((id, i) => ({
    id: id + "-clip",
    asset: id,
    track: p.tracks[i]!.id,
    sourceStartSample: 0,
    sourceEndSample: tenMinutes,
    startSample: 0,
    gainDb: 0,
    fadeInSamples: 0,
    fadeOutSamples: 48000,
    automation: { interpolation: "linear" as const, points: [] },
  }));
  expect(soundtrackWorkingBytes(p)).toBeLessThanOrEqual(1_500_000_000);
  const file = join(dir, "project.json");
  await writeFile(file, JSON.stringify(p));
  const rendered = await renderSoundtrackProject(file, join(dir, "render"), {
    stems: true,
  });
  expect(rendered.files.master!.samplesPerChannel).toBe(tenMinutes);
  expect(Object.keys(rendered.files)).toEqual([
    "voice",
    "music",
    "dialogue-bus",
    "music-bus",
    "master",
  ]);
  // macOS reports peak resident bytes; elsewhere the unit is smaller.
  if (process.platform === "darwin")
    expect(rendered.peakResidentBytes).toBeLessThan(1_500_000_000);
}, 120000);

it("command edits read operations from stdin with --operations -", async () => {
  const file = join(root, "stdin-project.json");
  await writeFile(file, JSON.stringify({ ...project, revision: 0 }));
  const output: string[] = [];
  const io = {
    stdout: (v: string) => output.push(v),
    stderr: (v: string) => output.push(v),
    stdin: async () =>
      JSON.stringify([
        { type: "gain", target: "effect", kind: "track", gainDb: -3 },
      ]),
  };
  expect(
    await runSoundtrackCli(
      ["edit", "--project", file, "--revision", "0", "--operations", "-"],
      io,
    ),
  ).toBe(0);
  const saved = JSON.parse(output[0]!).result as SoundtrackProject;
  expect(saved.revision).toBe(1);
  expect(saved.tracks.find((t) => t.id === "effect")!.gainDb).toBe(-3);
  // A real child process reads the same JSON from its standard input.
  const child = await runProcess("sh", [
    "-c",
    'printf %s "$0" | "$1" --import tsx tools/still-shift-cli/src/cli.ts soundtrack edit --project "$2" --revision 1 --operations -',
    JSON.stringify([{ type: "undo" }]),
    process.execPath,
    file,
  ]);
  expect(JSON.parse(child.stdout).result.revision).toBe(2);
  expect(
    (await readSoundtrackProject(file)).tracks.find((t) => t.id === "effect")!
      .gainDb,
  ).toBe(0);
}, 20000);

it("NumPy routing sums match DawDreamer's add processor byte for byte", async () => {
  // Random, subnormal and constructed float32-midpoint inputs; see the script.
  const { stdout } = await runProcess(soundtrackPython(), [
    "scripts/soundtrack/check-routing-parity.py",
    "packages/animation-engine/src/soundtrack-worker.py",
  ]);
  expect(JSON.parse(stdout)).toEqual({ cases: 62, mismatches: 0 });
}, 60000);

it("tiled beds render their equal-power joins sample for sample", async () => {
  const p = structuredClone(project);
  delete p.ducking;
  p.clips = [{ ...p.clips[1]!, sourceEndSample: 48000 }];
  const file = join(root, "tile.json");
  await writeFile(file, JSON.stringify(p));
  const tiled = await saveSoundtrackEdits(file, 0, [
    {
      type: "tile",
      clip: "music-clip",
      endSample: 144000,
      crossfadeSamples: 4800,
    },
  ]);
  expect(tiled.clips.map((c) => c.startSample)).toEqual([
    0, 43200, 86400, 129600,
  ]);
  await renderSoundtrackProject(file, join(root, "tile"), { stems: true });
  const music = await pcm(audio("tile", "music"));
  // The constant 0.1 source makes each gain visible: copies add in amplitude.
  const gain = (j: number) =>
    0.1 *
    (Math.sin((Math.PI / 2) * ((4800 - j) / 4800)) +
      Math.sin((Math.PI / 2) * (j / 4800)));
  for (const j of [0, 1, 1200, 2400, 4799])
    expect(music[(43200 + j) * 2]).toBeCloseTo(gain(j), 6);
  expect(music[20000 * 2]).toBe(Math.fround(0.1));
  expect(music[143999 * 2 + 1]).toBe(Math.fround(0.1));
}, 20000);

it("an opt-in master limiter holds the ceiling and leaves samples out of reach bit-identical", async () => {
  const dir = join(root, "limiter");
  await mkdir(dir, { recursive: true });
  // 0.2 everywhere except a 0.9 burst at 1.0-1.2 s; +6 dB track gain makes the
  // burst about 1.8 (over full scale) and the rest about 0.4 (under -1 dBFS).
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='if(between(t,1,1.2),0.9,0.2)*sin(2*PI*200*t)':s=48000:d=3",
    "-c:a",
    "pcm_f32le",
    join(dir, "hot.wav"),
  ]);
  const p: SoundtrackProject = {
    ...structuredClone(project),
    assets: [
      {
        id: "hot",
        path: "hot.wav",
        sha256: await soundtrackChecksum(join(dir, "hot.wav")),
      },
    ],
    tracks: [{ ...project.tracks[2]!, output: "master", gainDb: 6 }],
    buses: [],
    clips: [
      {
        id: "hot-clip",
        asset: "hot",
        track: "effect",
        sourceStartSample: 0,
        sourceEndSample: 144000,
        startSample: 0,
        gainDb: 0,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        automation: { interpolation: "linear", points: [] },
      },
    ],
  };
  delete p.ducking;
  const file = join(dir, "project.json");
  await writeFile(file, JSON.stringify(p));
  const open = await renderSoundtrackProject(file, join(dir, "open"), {
    stems: true,
  });
  expect(open.files.master!.samplesAboveFullScale).toBeGreaterThan(0);
  const limiter = {
    ceilingDb: -1,
    lookaheadSamples: 480,
    releaseSamples: 4800,
  };
  await saveSoundtrackEdits(file, 0, [{ type: "limiter", limiter }]);
  const limited = await renderSoundtrackProject(file, join(dir, "limited"), {
    stems: true,
  });
  expect(limited.dspVersion).toBe("soundtrack-dsp-6");
  const before = await pcm(join(dir, "open/audio/mix.wav"));
  const after = await pcm(join(dir, "limited/audio/mix.wav"));
  const ceiling = Math.fround(10 ** (-1 / 20));
  expect(after.every((v) => Math.abs(v) <= ceiling)).toBe(true);
  expect(limited.files.master!.samplesAboveFullScale).toBe(0);
  expect(limited.files.master!.peakDbfs).toBeLessThanOrEqual(-1 + 1e-6);
  // Stems stay unlimited.
  expect(await pcm(join(dir, "limited/audio/effect.wav"))).toEqual(
    await pcm(join(dir, "open/audio/effect.wav")),
  );
  // Frames whose lookahead window holds no over and whose release has finished
  // are untouched; the over spans about 48000-57600.
  let firstOver = -1;
  for (let i = 0; i < before.length; i += 2)
    if (Math.max(Math.abs(before[i]!), Math.abs(before[i + 1]!)) > ceiling) {
      firstOver = i / 2;
      break;
    }
  expect(firstOver).toBeGreaterThan(47000);
  expect(after.subarray(0, (firstOver - 480) * 2)).toEqual(
    before.subarray(0, (firstOver - 480) * 2),
  );
  expect(after.subarray(70000 * 2)).toEqual(before.subarray(70000 * 2));
  expect(after[(firstOver - 481) * 2]).toBe(before[(firstOver - 481) * 2]);
  // Release: gain recovers at 1 / 4800 per sample once the burst has passed.
  const gainAt = (frame: number) => after[frame * 2]! / before[frame * 2]!;
  const recovering = [57700, 57800, 57900].map(gainAt);
  expect(recovering[1]! - recovering[0]!).toBeCloseTo(100 / 4800, 4);
  expect(recovering[2]! - recovering[1]!).toBeCloseTo(100 / 4800, 4);
  const report = limited.limiter as {
    maxReductionDb: number;
    limitedSamples: number;
  };
  expect(report).toMatchObject(limiter);
  expect(report.maxReductionDb).toBeCloseTo(
    20 *
      Math.log10(
        ceiling / before.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
      ),
    3,
  );
  expect(report.limitedSamples).toBeGreaterThan(9600);
  // Removing the limiter restores the unlimited mix exactly.
  await saveSoundtrackEdits(file, 1, [{ type: "limiter", limiter: null }]);
  await renderSoundtrackProject(file, join(dir, "reopened"));
  expect(await pcm(join(dir, "reopened/audio/mix.wav"))).toEqual(before);
}, 30000);
