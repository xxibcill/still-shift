import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  prepareCompositionAudioSource,
  prepareCompositionVisualMedia,
  verifyCompositionAudioPcm,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { CompositionAsset } from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { mediaRgbaPng } from "../helpers/composition-media-png.ts";

type AudioAsset = Extract<CompositionAsset, { type: "audio" }>;
let root: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-audio-cache-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
const failureCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
    expect.fail("must reject");
  } catch (error) {
    return passageDiagnostics(error)[0]!.code;
  }
};
function wave(samples: number, channels: 1 | 2, rate = 48000) {
  const raw = Buffer.alloc(samples * channels * 4);
  for (let sample = 0; sample < samples; sample++)
    for (let channel = 0; channel < channels; channel++)
      raw.writeFloatLE(
        Math.sin(2 * Math.PI * (sample / rate) * (channel ? 997 : 431)) *
          (channel ? 0.125 : 0.25),
        (sample * channels + channel) * 4,
      );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(raw.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(raw.length, 40);
  return { raw, bytes: Buffer.concat([header, raw]) };
}
async function source(
  name: string,
  samples = 4800,
  channels: 1 | 2 = 2,
  rate = 48000,
) {
  const pcm = wave(samples, channels, rate);
  const path = join(root, name + ".wav");
  await writeFile(path, pcm.bytes);
  const asset: AudioAsset = {
    id: name,
    type: "audio",
    path,
    sha256: hash(pcm.bytes),
    sampleRate: 48000,
    sampleCount: Math.round((samples * 48000) / rate),
    channels,
  };
  return { asset, ...pcm };
}
const options = (asset: AudioAsset, cache = asset.id) => ({
  asset,
  sourceDirectory: root,
  cacheDirectory: join(root, "cache-" + cache),
});

it.each([1, 2] as const)(
  "verifies actual %i-channel PCM bit-for-bit, preserves ordinal zero and reuses physical relocation",
  async (channels) => {
    const { asset, raw } = await source("exact" + channels, 5003, channels);
    const prepared = await prepareCompositionAudioSource(options(asset));
    expect(prepared.cacheHit).toBe(false);
    expect(prepared.sampleCount).toBe(5003);
    expect(prepared.channels).toBe(channels);
    expect(prepared.byteLength).toBe(raw.length);
    expect(prepared.sha256).toBe(hash(raw));
    expect(await readFile(prepared.path)).toEqual(raw);
    expect(prepared.peakPcmWorkingBytes).toBeLessThanOrEqual(262148);
    expect(prepared.sourceProvenance).toMatchObject({
      codec: "pcm_f32le",
      sourceSampleRate: 48000,
      sourceClock: "decoded-sample-ordinal-zero",
    });
    const runtime = await runProcess("ffmpeg", ["-version"]);
    expect(prepared.ffmpegIdentity).toBe(hash(Buffer.from(runtime.stdout)));
    const relocated = join(root, "relocated-" + channels + ".wav");
    await copyFile(asset.path, relocated);
    const hit = await prepareCompositionAudioSource({
      ...options(asset),
      asset: { ...asset, id: "renamed", path: relocated },
    });
    expect(hit.cacheHit).toBe(true);
    expect(hit.key).toBe(prepared.key);
    expect(hit.path).toBe(prepared.path);
    expect(hit.asset).toBe("renamed");
  },
);
it("normalizes an actual 44.1 kHz stream to the verified 48 kHz decoded count", async () => {
  const { asset } = await source("resample", 4410, 1, 44100);
  const prepared = await prepareCompositionAudioSource(options(asset));
  const reference = join(root, "resampled-reference.f32");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-i",
    asset.path,
    "-ar",
    "48000",
    "-codec:a",
    "pcm_f32le",
    "-f",
    "f32le",
    reference,
  ]);
  expect(prepared.sampleCount).toBe(4800);
  expect(prepared.sourceProvenance.sourceSampleRate).toBe(44100);
  expect(await readFile(prepared.path)).toEqual(await readFile(reference));
});
it("rejects actual under/overruns, channel mismatch, multiple streams and nonfinite PCM without publishing", async () => {
  const { asset } = await source("counts");
  for (const [sampleCount, code] of [
    [4799, "comp-media-limit"],
    [4801, "comp-media-provenance"],
  ] as const) {
    const cache = "count-" + sampleCount;
    expect(
      await failureCode(
        prepareCompositionAudioSource(
          options({ ...asset, sampleCount }, cache),
        ),
      ),
    ).toBe(code);
    expect(await readdir(options(asset, cache).cacheDirectory)).toEqual([]);
  }
  expect(
    await failureCode(
      prepareCompositionAudioSource(
        options({ ...asset, channels: 1 }, "channels"),
      ),
    ),
  ).toBe("comp-media-provenance");
  const multiple = join(root, "multiple.mkv");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-i",
    asset.path,
    "-map",
    "0:a:0",
    "-map",
    "0:a:0",
    "-codec:a",
    "pcm_f32le",
    multiple,
  ]);
  expect(
    await failureCode(
      prepareCompositionAudioSource(
        options(
          { ...asset, path: multiple, sha256: hash(await readFile(multiple)) },
          "multiple",
        ),
      ),
    ),
  ).toBe("comp-media-provenance");
  for (const value of [NaN, Infinity, -Infinity]) {
    const bad = await source(
      "nonfinite" + String(value).replace(/[^a-z]/gi, ""),
    );
    bad.bytes.writeFloatLE(value, 44 + 333 * 8);
    await writeFile(bad.asset.path, bad.bytes);
    bad.asset.sha256 = hash(bad.bytes);
    expect(
      await failureCode(prepareCompositionAudioSource(options(bad.asset))),
    ).toBe("comp-media-format");
    expect(await readdir(options(bad.asset).cacheDirectory)).toEqual([]);
  }
});
it("rejects changed originals on hits and finite PCM or manifest tampering", async () => {
  const { asset } = await source("tamper");
  const prepared = await prepareCompositionAudioSource(options(asset));
  const bytes = await readFile(prepared.path);
  bytes.writeFloatLE(0.9, 80);
  await writeFile(prepared.path, bytes);
  expect(await failureCode(prepareCompositionAudioSource(options(asset)))).toBe(
    "comp-media-checksum",
  );
  await rm(dirname(prepared.path), { recursive: true });
  const restored = await prepareCompositionAudioSource(options(asset));
  const manifestPath = join(dirname(restored.path), "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.channels = 1;
  await writeFile(manifestPath, JSON.stringify(manifest));
  expect(await failureCode(prepareCompositionAudioSource(options(asset)))).toBe(
    "comp-media-provenance",
  );
  const original = await readFile(asset.path);
  original[99] = original[99]! ^ 1;
  await writeFile(asset.path, original);
  expect(await failureCode(prepareCompositionAudioSource(options(asset)))).toBe(
    "comp-media-checksum",
  );
});
it("reserves bounded PCM memory and cumulative disk bytes shared with actual visual media", async () => {
  const { asset } = await source("bounds");
  expect(
    await failureCode(
      prepareCompositionAudioSource({
        ...options(asset),
        limits: { audioWorkingBytes: 8 },
      }),
    ),
  ).toBe("comp-media-limit");
  expect(
    await failureCode(
      prepareCompositionAudioSource({
        ...options(asset),
        limits: { decodedCacheBytes: asset.sampleCount * 8 },
      }),
    ),
  ).toBe("comp-media-limit");
  const long = await source("duration", 48001);
  expect(
    await failureCode(
      prepareCompositionAudioSource({
        ...options(long.asset),
        limits: { maxDurationSeconds: 1 },
      }),
    ),
  ).toBe("comp-media-limit");
  const cacheDirectory = options(asset, "shared").cacheDirectory;
  const png = mediaRgbaPng(16, 16, Buffer.alloc(16 * 16 * 4, 255));
  await writeFile(join(root, "frame-000.png"), png);
  const sequence = Buffer.from(
    JSON.stringify({
      schemaVersion: "composition-sequence-1",
      frames: [hash(png)],
    }),
  );
  await writeFile(join(root, "sequence.json"), sequence);
  const visual = await prepareCompositionVisualMedia({
    asset: {
      id: "picture",
      type: "sequence",
      path: "frame-%03d.png",
      manifestPath: "sequence.json",
      sha256: hash(sequence),
      width: 16,
      height: 16,
      frameRate: { numerator: 24, denominator: 1 },
      frameCount: 1,
      firstFrame: 0,
      color: {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "gbr",
        range: "pc",
      },
    },
    sourceDirectory: root,
    cacheDirectory,
    ordinals: [0],
  });
  expect(visual.cacheBytes).toBeGreaterThan(0);
  expect(
    await failureCode(
      prepareCompositionAudioSource({
        ...options(asset),
        cacheDirectory,
        limits: {
          decodedCacheBytes:
            asset.sampleCount * 8 + 65536 + visual.cacheBytes - 1,
        },
      }),
    ),
  ).toBe("comp-media-limit");
  const prepared = await prepareCompositionAudioSource({
    ...options(asset),
    cacheDirectory,
  });
  expect(prepared.cacheBytes).toBeGreaterThan(
    visual.cacheBytes + prepared.byteLength,
  );
  expect(
    (await readdir(cacheDirectory)).filter((path) => !path.startsWith(".")),
  ).toHaveLength(2);
});
it("publishes one shared entry for concurrent misses and reaps an actively writing cancelled decoder", async () => {
  const { asset } = await source("concurrent", 96000);
  const prepared = await Promise.all([
    prepareCompositionAudioSource(options(asset)),
    prepareCompositionAudioSource(options(asset)),
  ]);
  expect(prepared.map((p) => p.cacheHit).sort()).toEqual([false, true]);
  expect(prepared[0]!.path).toBe(prepared[1]!.path);
  const long = await source("cancel", 48000 * 60);
  const controller = new AbortController();
  const task = prepareCompositionAudioSource({
    ...options(long.asset),
    signal: controller.signal,
  });
  const rejected = expect(task).rejects.toThrow("active decode cancelled");
  const deadline = performance.now() + 10000;
  let writing = false;
  while (!writing && performance.now() < deadline) {
    const entries = await readdir(options(long.asset).cacheDirectory).catch(
      () => [],
    );
    for (const entry of entries.filter((name) =>
      name.startsWith(".prepare-audio-"),
    )) {
      const stat = await lstat(
        join(options(long.asset).cacheDirectory, entry, "source.f32"),
      ).catch(() => undefined);
      writing ||= !!stat?.size;
    }
    if (!writing) await delay(2);
  }
  expect(writing).toBe(true);
  controller.abort(new Error("active decode cancelled"));
  await rejected;
  expect(await readdir(options(long.asset).cacheDirectory)).toEqual([]);
  await delay(25);
  expect(await readdir(options(long.asset).cacheDirectory)).toEqual([]);
  const early = new AbortController();
  early.abort(new Error("early cancel"));
  await expect(
    prepareCompositionAudioSource({
      ...options(asset, "early"),
      signal: early.signal,
    }),
  ).rejects.toThrow("early cancel");
  await expect(
    lstat(options(asset, "early").cacheDirectory),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
it("stream-verifies truncated and nonfinite cache payloads", async () => {
  const path = join(root, "raw-invalid.f32");
  await writeFile(path, Buffer.from([0, 0, 0]));
  expect(
    await failureCode(
      verifyCompositionAudioPcm(path, {
        byteLength: 3,
        sha256: hash(Buffer.from([0, 0, 0])),
      }),
    ),
  ).toBe("comp-media-provenance");
  const bytes = Buffer.alloc(65540);
  bytes.writeFloatLE(NaN, 65536);
  await writeFile(path, bytes);
  expect(
    await failureCode(
      verifyCompositionAudioPcm(path, {
        byteLength: bytes.length,
        sha256: hash(bytes),
      }),
    ),
  ).toBe("comp-media-format");
});
