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
    expect(centred.dspVersion).toBe("soundtrack-dsp-4");
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

it("reused sounds decode once per span and match per-clip decoding sample for sample", async () => {
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
  // "near" spans 7,200 samples and is cached; "far" spans 124,800 samples,
  // beyond the 48,000-sample budget, and decodes per clip.
  const placements = [
    ["near", 0, 4800, 0],
    ["near", 2400, 7200, 12000],
    ["far", 0, 4800, 24000],
    ["far", 120000, 124800, 36000],
  ] as const;
  const p: SoundtrackProject = {
    ...structuredClone(project),
    durationSamples: 48000,
    assets: ["near", "far"].map((id) => ({ id, path: "ramp.wav", sha256 })),
    tracks: [{ ...project.tracks[2]!, output: "master" }],
    buses: [],
    clips: placements.map(([asset, start, end, at], i) => ({
      id: "hit-" + i,
      asset,
      track: "effect",
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
  const source = await pcm(join(root, "ramp.wav")),
    effect = await pcm(audio("reuse", "effect"));
  for (const [, start, end, at] of placements)
    for (let i = 0; i < end - start; i++)
      for (const channel of [0, 1])
        expect(effect[(at + i) * 2 + channel]).toBe(source[start + i]);
  // A reused span that runs past the source names the first uncovered clip.
  p.clips[1]!.sourceEndSample = 144001;
  p.clips[1]!.sourceStartSample = 139201;
  await writeFile(reuse, JSON.stringify(p));
  await expect(
    renderSoundtrackProject(reuse, join(root, "reuse-short")),
  ).rejects.toMatchObject({ code: "source-range", context: { clip: "hit-1" } });
}, 20000);

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
    expect(rendered.dspVersion).toBe("soundtrack-dsp-4");
    expect((rendered.identityInputs as { dsp: string }).dsp).toBe(
      "soundtrack-dsp-4",
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
