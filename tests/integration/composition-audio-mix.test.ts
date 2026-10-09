import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  copyFile as copy,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  prepareCompositionAudio,
  prepareCompositionAudioSource,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  CompositionPreparedAudioSchema,
  validateComposition,
  type Composition,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

type AudioAsset = Extract<CompositionAsset, { type: "audio" }>;
let root: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-audio-mix-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function source(
  name: string,
  samples: number,
  channels: 1 | 2,
  value: (sample: number, channel: number) => number,
) {
  const raw = Buffer.alloc(samples * channels * 4);
  for (let sample = 0; sample < samples; sample++)
    for (let channel = 0; channel < channels; channel++)
      raw.writeFloatLE(
        value(sample, channel),
        (sample * channels + channel) * 4,
      );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(raw.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(48000 * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(raw.length, 40);
  const bytes = Buffer.concat([header, raw]),
    path = join(root, name + ".wav");
  await writeFile(path, bytes);
  const asset: AudioAsset = {
    id: name,
    type: "audio",
    path,
    sha256: hash(bytes),
    sampleCount: samples,
    sampleRate: 48000,
    channels,
  };
  return { asset, raw };
}
function document(
  asset: AudioAsset,
  fps: Composition["fps"] = 24,
): Composition {
  return {
    schemaVersion: "composition-1",
    id: "native-pcm",
    width: 64,
    height: 48,
    fps,
    frameCount: 4,
    assets: [asset],
    layers: [{ id: "sound", type: "audio", asset: asset.id }],
  };
}
const options = (name: string) => ({
  cacheDirectory: join(root, "cache-" + name),
});
async function render(comp: Composition, name: string) {
  const validation = validateComposition(comp);
  expect(validation.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  const result = (await prepareCompositionAudio(comp, root, options(name)))!;
  expect(
    CompositionPreparedAudioSchema.safeParse(result.preparedAudio).success,
  ).toBe(true);
  const bytes = await readFile(result.assetPaths["__audio:mix"]!);
  expect(hash(bytes)).toBe(result.preparedAudio.resource.sha256);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.readUInt16LE(20)).toBe(3);
  expect(bytes.readUInt16LE(22)).toBe(2);
  expect(bytes.readUInt32LE(24)).toBe(48000);
  expect(bytes.subarray(38, 42).toString()).toBe("fact");
  expect(bytes.readUInt32LE(46)).toBe(result.preparedAudio.sampleCount);
  expect(bytes.subarray(50, 54).toString()).toBe("data");
  expect(bytes.length).toBe(bytes.readUInt32LE(54) + 58);
  return { ...result, bytes, pcm: bytes.subarray(58) };
}
const pair = (pcm: Buffer, sample: number) => [
  pcm.readFloatLE(sample * 8),
  pcm.readFloatLE(sample * 8 + 4),
];

it("preserves exact PCM when a native audio precomp is spatially attached to measured text", async () => {
  const { asset, raw } = await source(
    "text-attachment",
    8000,
    2,
    (sample, channel) =>
      sample === 7999 ? (channel ? -0.125 : 0.5) : channel ? -0.25 : 0.25,
  );
  const comp = document(asset);
  const sound = comp.layers[0]!;
  comp.layers = [
    {
      id: "title",
      type: "text",
      text: "Title",
      fontSize: 24,
      color: "#ffffff",
    },
    { id: "host", type: "precomp", comp: "nested" },
  ];
  comp.precomps = [
    { id: "nested", width: 64, height: 48, frameCount: 4, layers: [sound] },
  ];
  comp.constraints = [{ type: "attach", target: "host", anchor: "title" }];
  const actual = await render(comp, "text-attachment");
  expect(actual.pcm).toEqual(raw);
  expect(actual.preparedAudio.waveforms.processed[0]!.key).toBe("host/sound");
});

const failureCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
    expect.fail("must reject");
  } catch (error) {
    return passageDiagnostics(error)[0]!.code;
  }
};
function expectedPeaks(pcm: Buffer, channels: 1 | 2, points: number) {
  const count = pcm.length / channels / 4,
    out = Array.from({ length: Math.min(count, points) }, () => 0);
  for (let n = 0; n < count; n++) {
    const bin = Math.floor((n * out.length) / count);
    for (let c = 0; c < channels; c++)
      out[bin] = Math.max(
        out[bin]!,
        Math.abs(pcm.readFloatLE((n * channels + c) * 4)),
      );
  }
  return out;
}

it("preserves every trimmed narration sample and actual source/processed/mix waveform, including the last sample", async () => {
  const { asset, raw } = await source(
    "identity",
    10000,
    2,
    (n, c) => ((n % 113) - 56) / (c ? 100 : 200),
  );
  const comp = document(asset);
  comp.layers = [
    {
      id: "sound",
      type: "audio",
      asset: asset.id,
      role: "narration",
      sourceStartSample: 123,
      sourceEndSample: 8123,
    },
  ];
  const actual = await render(comp, "identity");
  expect(actual.pcm).toEqual(raw.subarray(123 * 8, 8123 * 8));
  expect(actual.preparedAudio.sampleCount).toBe(8000);
  const waves = actual.preparedAudio.waveforms;
  expect(waves.source[0]!.peaks).toEqual(
    expectedPeaks(raw, 2, waves.source[0]!.peaks.length),
  );
  expect(waves.processed[0]!.peaks).toEqual(
    expectedPeaks(actual.pcm, 2, waves.processed[0]!.peaks.length),
  );
  expect(waves.mix.peaks).toEqual(waves.processed[0]!.peaks);
  const relocated = join(root, "identity-relocated.wav");
  await copy(asset.path, relocated);
  const hit = await prepareCompositionAudio(
    { ...comp, assets: [{ ...asset, path: relocated }] },
    root,
    options("identity"),
  );
  expect(hit!.cacheHit).toBe(true);
  expect(hit!.key).toBe(actual.key);
  expect(hit!.preparedAudio).toEqual(actual.preparedAudio);
});
it.each(["linear", "equal-power"] as const)(
  "matches existing CE16 Float32 gain/pan/%s overlap fades without its optional backend",
  async (curve) => {
    const { asset, raw } = await source(
      "reference" + curve.replace("-", ""),
      8000,
      2,
      (n, c) => Math.sin(n * (c ? 0.071 : 0.037)) * (c ? 0.17 : 0.31),
    );
    const comp = document(asset);
    comp.layers = [
      {
        id: "sound",
        type: "audio",
        asset: asset.id,
        gainDb: -3.25,
        pan: -0.37,
        fadeInSamples: 6000,
        fadeOutSamples: 6000,
        fadeInCurve: curve,
        fadeOutCurve: curve,
      },
    ];
    const actual = await render(comp, asset.id);
    const rawPath = join(root, asset.id + ".f32"),
      reference = join(root, asset.id + "-ce16.wav");
    await writeFile(rawPath, raw);
    const script = join(root, "reference.py");
    await writeFile(
      script,
      `import importlib.util,sys,numpy as np\nspec=importlib.util.spec_from_file_location("worker",sys.argv[1])\nw=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)\na=np.fromfile(sys.argv[2],dtype="<f4").reshape(-1,2).T\nt=np.zeros_like(a)\nc={"startSample":0,"sourceStartSample":0,"sourceEndSample":8000,"gainDb":-3.25,"pan":-0.37,"fadeInSamples":6000,"fadeOutSamples":6000,"fadeInCurve":sys.argv[4],"fadeOutCurve":sys.argv[4],"automation":{"points":[],"interpolation":"linear"}}\nw.shape_clip_into(t,None,c,a,np)\nw.write_wav(sys.argv[3],t,0,8000,np)\n`,
    );
    await runProcess(
      process.env.STILL_SHIFT_PYTHON ?? resolve(".venv/bin/python"),
      [
        script,
        resolve("packages/animation-engine/src/soundtrack-worker.py"),
        rawPath,
        reference,
        curve,
      ],
    );
    const expected = await readFile(reference);
    expect(actual.bytes.subarray(0, 58)).toEqual(expected.subarray(0, 58));
    let worst = 0;
    for (let at = 58; at < expected.length; at += 4)
      worst = Math.max(
        worst,
        Math.abs(actual.bytes.readFloatLE(at) - expected.readFloatLE(at)),
      );
    expect(worst).toBeLessThanOrEqual(2 ** -24);
    console.log(
      JSON.stringify({
        proof: "native-ce16-pcm-laws",
        curve,
        worstAbsoluteSampleDelta: worst,
        byteIdentical: actual.bytes.equals(expected),
        samples: 8000,
      }),
    );
  },
);
it("duplicates mono, retains centre unity, uses exact hard-pan silence and reports actual overs without normalization", async () => {
  const { asset } = await source("mono", 8000, 1, () => 0.75);
  const comp = document(asset);
  comp.layers = [
    { id: "left", type: "audio", asset: asset.id, pan: -1 },
    { id: "right", type: "audio", asset: asset.id, pan: 1 },
  ];
  const actual = await render(comp, "hardpan");
  const loud = Math.fround(0.75 * Math.fround(Math.SQRT2));
  for (const at of [0, 4095, 4096, 7999])
    expect(pair(actual.pcm, at)).toEqual([loud, loud]);
  expect(actual.preparedAudio.waveforms.mix.samplesAboveFullScale).toBe(8000);
  expect(actual.preparedAudio.waveforms.mix.peakDbfs).toBeGreaterThan(0);
  expect(actual.preparedAudio.waveforms.source[0]!.samplesAboveFullScale).toBe(
    0,
  );
  const centre = await render(document(asset), "centre");
  expect(pair(centre.pcm, 7999)).toEqual([0.75, 0.75]);
  expect(centre.preparedAudio.waveforms.mix.samplesAboveFullScale).toBe(0);
});
it("applies keyed gain and normalized driver/expression controls at PCM resolution", async () => {
  const { asset } = await source("automation", 8000, 1, () => 0.25);
  const keyed = document(asset);
  keyed.layers = [
    {
      id: "sound",
      type: "audio",
      asset: asset.id,
      gainDb: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 2, value: -6.020599913279624, interpolation: "hold" },
        ],
      },
    },
  ];
  const actual = await render(keyed, "keyed");
  expect(pair(actual.pcm, 3999)).toEqual([0.25, 0.25]);
  expect(pair(actual.pcm, 4000)).toEqual([0.125, 0.125]);
  const driven = document(asset);
  driven.layers.push({
    id: "control",
    type: "null",
    transform: { position: [10, 0] },
  });
  driven.drivers = [
    { target: "sound.gainDb", source: "control.transform.position.x" },
  ];
  driven.expressions = {
    "sound.gainDb": { source: "value + 4" },
    "sound.pan": { source: "-2" },
  };
  const normalized = await render(driven, "normalized");
  expect(pair(normalized.pcm, 1)[1]).toBe(0);
  expect(pair(normalized.pcm, 1)[0]).toBe(
    Math.fround(
      Math.fround(0.25 * Math.fround(10 ** (12 / 20))) *
        Math.fround(Math.SQRT2),
    ),
  );
});
it("interpolates Q16 source positions across pages and never reads beyond the authorized trim", async () => {
  const { asset, raw } = await source("fractional", 10000, 1, (n) => n / 20000);
  const comp = document(asset);
  comp.layers = [
    {
      id: "sound",
      type: "audio",
      asset: asset.id,
      sourceStartSample: 4095,
      sourceEndSample: 4097,
      stretch: 2,
    },
  ];
  const actual = await render(comp, "fractional");
  const a = raw.readFloatLE(4095 * 4),
    b = raw.readFloatLE(4096 * 4);
  expect(pair(actual.pcm, 0)).toEqual([a, a]);
  expect(pair(actual.pcm, 1)).toEqual([
    Math.fround((a + b) / 2),
    Math.fround((a + b) / 2),
  ]);
  expect(pair(actual.pcm, 3)).toEqual([b, b]);
  expect(pair(actual.pcm, 4)).toEqual([0, 0]);
  const remapped = document(asset);
  remapped.layers = [
    { id: "sound", type: "audio", asset: asset.id, timeRemap: 4095.5 / 48000 },
  ];
  const held = await render(remapped, "remap");
  expect(pair(held.pcm, 7999)).toEqual(pair(actual.pcm, 1));
});
it.each([24, 25, 30, 50, 60] as const)(
  "preserves nested protected PCM placement through the final sample at %i fps",
  async (fps) => {
    const { asset, raw } = await source("nested" + fps, 1920, 1, (n) =>
      n === 1919 ? 0.875 : 0.125,
    );
    const comp = document(asset, fps);
    comp.layers = [
      { id: "host", type: "precomp", comp: "spoken", startFrame: 1 },
    ];
    comp.precomps = [
      {
        id: "spoken",
        width: 64,
        height: 48,
        fps: 25,
        frameCount: 1,
        layers: [
          { id: "voice", type: "audio", asset: asset.id, role: "narration" },
        ],
      },
    ];
    const actual = await render(comp, "nested" + fps),
      origin = 48000 / fps;
    expect(pair(actual.pcm, origin - 1)).toEqual([0, 0]);
    for (const n of [0, 1, 1918, 1919])
      expect(pair(actual.pcm, origin + n)).toEqual([
        raw.readFloatLE(n * 4),
        raw.readFloatLE(n * 4),
      ]);
    expect(pair(actual.pcm, origin + 1920)).toEqual([0, 0]);
    expect(actual.preparedAudio.waveforms.processed[0]!.key).toBe("host/voice");
  },
);
it("reuses a bounded page pool with real eviction, deterministic output and zero processed waveform for disabled audio", async () => {
  const { asset } = await source(
    "bounded",
    96000,
    2,
    (n, c) => ((n % 401) - 200) / (c ? 1000 : 2000),
  );
  const comp = document(asset);
  comp.frameCount = 48;
  comp.mediaLimits = { audioWorkingBytes: 524288 };
  comp.layers.push({
    id: "disabled",
    type: "audio",
    asset: asset.id,
    enabled: false,
  });
  const actual = await render(comp, "bounded");
  expect(actual.working.peakPcmBytes).toBeLessThanOrEqual(524288);
  expect(actual.working.sourcePageEvictions).toBeGreaterThan(0);
  console.log(
    JSON.stringify({
      proof: "native-pcm-page-pool",
      ...actual.working,
      samples: actual.preparedAudio.sampleCount,
    }),
  );
  expect(
    actual.preparedAudio.waveforms.processed
      .find((w) => w.key === "disabled")!
      .peaks.every((p) => p === 0),
  ).toBe(true);
  const independent = await render(comp, "bounded-independent");
  expect(independent.bytes).toEqual(actual.bytes);
  expect(independent.preparedAudio.waveforms).toEqual(
    actual.preparedAudio.waveforms,
  );
  const tooSmall = { ...comp, mediaLimits: { audioWorkingBytes: 8 } };
  expect(
    await failureCode(
      prepareCompositionAudio(tooSmall, root, options("too-small")),
    ),
  ).toBe("comp-media-limit");
  await expect(
    lstat(options("too-small").cacheDirectory),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
it.each(["cycle", "pingpong"] as const)(
  "renders full singleton %s PCM periods and finite terminal silence",
  async (loop) => {
    const { asset, raw } = await source(
      "loop" + loop,
      2000,
      1,
      (sample) => (sample + 1) / 4000,
    );
    const comp = document(asset);
    comp.layers = [
      {
        id: "host",
        type: "precomp",
        comp: "one",
        loop,
        loopCount: loop === "cycle" ? 2 : 1,
      },
    ];
    comp.precomps = [
      {
        id: "one",
        width: 64,
        height: 48,
        fps: 24,
        frameCount: 1,
        layers: [{ id: "sound", type: "audio", asset: asset.id }],
      },
    ];
    const actual = await render(comp, "loop" + loop);
    for (const sample of [
      0, 1, 1998, 1999, 2000, 2001, 3997, 3998, 3999, 4000, 7999,
    ]) {
      const sourceSample =
        loop === "cycle"
          ? sample < 4000
            ? sample % 2000
            : undefined
          : sample < 3998
            ? sample <= 1999
              ? sample
              : 3998 - sample
            : undefined;
      const expected =
        sourceSample === undefined ? 0 : raw.readFloatLE(sourceSample * 4);
      expect(pair(actual.pcm, sample)).toEqual([expected, expected]);
    }
  },
);

it("serializes concurrent mix publication and validates shared capture clocks and waveform identities", async () => {
  const { asset } = await source("concurrentMix", 8000, 1, () => 0.125);
  const comp = document(asset);
  const results = await Promise.all([
    prepareCompositionAudio(comp, root, options("concurrentMix")),
    prepareCompositionAudio(comp, root, options("concurrentMix")),
  ]);
  expect(results.map((result) => result!.cacheHit).sort()).toEqual([
    false,
    true,
  ]);
  expect(results[0]!.preparedAudio).toEqual(results[1]!.preparedAudio);
  const capture = results[0]!.preparedAudio;
  const wrongClock = structuredClone(capture);
  wrongClock.sampleCount--;
  expect(CompositionPreparedAudioSchema.safeParse(wrongClock).success).toBe(
    false,
  );
  const duplicate = structuredClone(capture);
  duplicate.waveforms.processed.push(duplicate.waveforms.processed[0]!);
  expect(CompositionPreparedAudioSchema.safeParse(duplicate).success).toBe(
    false,
  );
  const channels = structuredClone(capture);
  channels.waveforms.source[0]!.channels = 2;
  expect(CompositionPreparedAudioSchema.safeParse(channels).success).toBe(
    false,
  );
});

it("sums authored instance order with Float32 rounding and keeps clipping reports on the actual final mix", async () => {
  const first = await source("sumFirst", 1, 1, () => 1e8);
  const second = await source("sumSecond", 1, 1, () => -1e8);
  const third = await source("sumThird", 1, 1, () => 0.25);
  const comp = document(first.asset);
  comp.frameCount = 1;
  comp.assets = [first.asset, second.asset, third.asset];
  comp.layers = comp.assets.map((asset, index) => ({
    id: "sound" + index,
    type: "audio",
    asset: asset.id,
  }));
  const actual = await render(comp, "sum-order");
  expect(pair(actual.pcm, 0)).toEqual([0.25, 0.25]);
  expect(pair(actual.pcm, 1)).toEqual([0, 0]);
  expect(actual.preparedAudio.waveforms.mix.samplesAboveFullScale).toBe(0);
  expect(
    actual.preparedAudio.waveforms.processed[0]!.samplesAboveFullScale,
  ).toBe(1);
  const reverse = structuredClone(comp);
  reverse.layers.reverse();
  const reordered = await render(reverse, "sum-reversed");
  expect(pair(reordered.pcm, 0)).toEqual([0, 0]);
  expect(reordered.key).not.toBe(actual.key);
});

it("rejects modified mix/cache sources and protected clocks before source decoding", async () => {
  const { asset } = await source("tamperMix", 8000, 1, () => 0.25);
  const comp = document(asset),
    actual = await render(comp, "tamperMix");
  const path = actual.assetPaths["__audio:mix"]!,
    bytes = await readFile(path);
  bytes.writeFloatLE(0.5, 66);
  await writeFile(path, bytes);
  expect(
    await failureCode(
      prepareCompositionAudio(comp, root, options("tamperMix")),
    ),
  ).toBe("comp-media-checksum");
  const bad = structuredClone(comp);
  bad.layers = [
    {
      id: "sound",
      type: "audio",
      asset: asset.id,
      role: "narration",
      stretch: 2,
    },
  ];
  expect(
    await failureCode(prepareCompositionAudio(bad, root, options("protected"))),
  ).toBe("comp-media-narration-clock");
  await expect(
    lstat(options("protected").cacheDirectory),
  ).rejects.toMatchObject({ code: "ENOENT" });
  const manifest = JSON.parse(
    await readFile(join(dirname(path), "manifest.json"), "utf8"),
  );
  manifest.audio.waveforms.processed[0].peaks[0] = 0.99;
  expect(CompositionPreparedAudioSchema.safeParse(manifest.audio).success).toBe(
    false,
  );
});
it("cancels an actual streamed mix without publishing and detects source PCM changes during mixing", async () => {
  const { asset } = await source(
    "cancelMix",
    48000 * 5,
    1,
    (n) => 0.1 * Math.sin(n * 0.023),
  );
  const comp = document(asset);
  comp.frameCount = 120;
  const controller = new AbortController();
  const task = prepareCompositionAudio(comp, root, {
    ...options("cancelMix"),
    signal: controller.signal,
  });
  const rejected = expect(task).rejects.toThrow("cancel actual mix");
  const waitForMix = async (cache: string) => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const entries = await readdir(cache).catch(() => []);
      for (const entry of entries.filter((n) =>
        n.startsWith(".prepare-audio-mix-"),
      )) {
        const stat = await lstat(join(cache, entry, "mix.wav")).catch(
          () => undefined,
        );
        if ((stat?.size ?? 0) > 58) return;
      }
      await delay(2);
    }
    throw new Error("No active mix writes observed");
  };
  await waitForMix(options("cancelMix").cacheDirectory);
  controller.abort(new Error("cancel actual mix"));
  await rejected;
  expect(
    (await readdir(options("cancelMix").cacheDirectory)).some((n) =>
      n.startsWith("."),
    ),
  ).toBe(false);
  const cacheDirectory = options("race").cacheDirectory;
  const sourcePcm = await prepareCompositionAudioSource({
    asset,
    sourceDirectory: root,
    cacheDirectory,
  });
  const race = prepareCompositionAudio(comp, root, { cacheDirectory });
  const raceFailure = failureCode(race);
  await waitForMix(cacheDirectory);
  const changed = Buffer.alloc(4);
  changed.writeFloatLE(0.9, 0);
  const sourceHandle = await open(sourcePcm.path, "r+");
  try {
    await sourceHandle.write(changed, 0, changed.length, 0);
  } finally {
    await sourceHandle.close();
  }
  expect(await raceFailure).toBe("comp-media-checksum");
  expect(
    (await readdir(cacheDirectory)).filter((n) => n.startsWith(".")),
  ).toEqual([]);
  expect(
    (await readdir(cacheDirectory)).filter((n) => !n.startsWith(".")),
  ).toHaveLength(1);
});

it("preserves every independently placed nested narration sample including its first impulse", async () => {
  const { asset, raw } = await source(
    "nested-boundary",
    1920,
    2,
    (sample, channel) =>
      sample === 0
        ? channel
          ? -0.5
          : 0.75
        : sample === 1919
          ? channel
            ? -0.125
            : 0.25
          : ((sample % 31) - 15) / 64,
  );
  const comp = document(asset);
  comp.frameCount = 20;
  comp.layers = [
    { id: "host", type: "precomp", comp: "spoken", startFrame: 7 },
  ];
  comp.precomps = [
    {
      id: "spoken",
      width: 64,
      height: 48,
      fps: 25,
      frameCount: 13,
      layers: [
        {
          id: "voice",
          type: "audio",
          asset: asset.id,
          role: "narration",
          startFrame: 11,
          inPoint: 11,
          outPoint: 12,
        },
      ],
    },
  ];
  const actual = await render(comp, "nested-boundary");
  const expected = Buffer.alloc(40000 * 8);
  raw.copy(expected, 35120 * 8);
  expect(actual.pcm).toEqual(expected);
  expect(pair(actual.pcm, 35120)).toEqual([0.75, -0.5]);
  expect(pair(actual.pcm, 37039)).toEqual([0.25, -0.125]);
  expect(pair(actual.pcm, 37040)).toEqual([0, 0]);
});

it.each([7, 29, 59])(
  "preserves every original narration sample placed at a fractional picture boundary at %i fps",
  async (fps) => {
    const samples = 32;
    const original = await source(
      `fractional-placed-${fps}`,
      samples,
      2,
      (n, c) => (n === 0 ? 1 : (n + 1) / (c ? 128 : 64)),
    );
    const comp = document(original.asset, fps);
    comp.layers = [
      {
        id: "sound",
        type: "audio",
        asset: original.asset.id,
        role: "narration",
        startFrame: 1,
        inPoint: 1,
      },
    ];
    const actual = await render(comp, `fractional-placed-${fps}`);
    const first = Math.ceil(48000 / fps);
    expect(actual.pcm.subarray(first * 8, (first + samples) * 8)).toEqual(
      original.raw,
    );
    expect(pair(actual.pcm, first - 1)).toEqual([0, 0]);
    expect(pair(actual.pcm, first + samples)).toEqual([0, 0]);
  },
);

it("preserves complete PCM after combining three different-rate placements", async () => {
  const original = await source(
    "fractional-nested",
    32,
    2,
    (n, c) => (n + 1) / (c ? 128 : 64),
  );
  const comp = document(original.asset, 29);
  comp.frameCount = 10;
  comp.layers = [
    { id: "outer", type: "precomp", comp: "middle", startFrame: 1, inPoint: 1 },
  ];
  comp.precomps = [
    {
      id: "middle",
      width: 64,
      height: 48,
      frameCount: 10,
      fps: 31,
      layers: [
        {
          id: "inner",
          type: "precomp",
          comp: "spoken",
          startFrame: 1,
          inPoint: 1,
        },
      ],
    },
    {
      id: "spoken",
      width: 64,
      height: 48,
      frameCount: 2,
      fps: 7,
      layers: [
        {
          id: "sound",
          type: "audio",
          asset: original.asset.id,
          role: "narration",
          startFrame: 1,
          inPoint: 1,
        },
      ],
    },
  ];
  const actual = await render(comp, "fractional-nested");
  const first = 10061;
  expect(actual.pcm.subarray(first * 8, (first + 32) * 8)).toEqual(
    original.raw,
  );
  expect(pair(actual.pcm, first - 1)).toEqual([0, 0]);
  expect(pair(actual.pcm, first + 32)).toEqual([0, 0]);
});
