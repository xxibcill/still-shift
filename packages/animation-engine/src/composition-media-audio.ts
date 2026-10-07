import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  COMPOSITION_AUDIO_DECODER_VERSION,
  resolveCompositionMediaLimits,
  type CompositionAsset,
  type CompositionMediaLimits,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  compositionMediaCacheLock,
  compositionMediaCacheSize,
} from "./composition-media-cache-storage.ts";
import {
  compositionMediaChecksum,
  parseMediaRational,
} from "./composition-media-probe.ts";

export { COMPOSITION_AUDIO_DECODER_VERSION } from "@still-shift/scene-contract";
type AudioAsset = Extract<CompositionAsset, { type: "audio" }>;
type Options = {
  asset: AudioAsset;
  sourceDirectory: string;
  cacheDirectory: string;
  limits?: CompositionMediaLimits;
  signal?: AbortSignal | undefined;
};
const hash = (value: string | Uint8Array) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const MANIFEST_BYTES = 64 * 1024;
const STREAM_BYTES = 64 * 1024;
// Includes a current chunk, queued pipe/read buffers and the split-float scratch.
const PCM_WORKING_RESERVATION = STREAM_BYTES * 4 + 4;
const Manifest = z
  .object({
    schemaVersion: z.literal("composition-audio-cache-1"),
    key: Hash,
    identity: z.string().max(MANIFEST_BYTES / 2),
    sha256: Hash,
    byteLength: z
      .number()
      .int()
      .min(4)
      .max(172_800_000 * 8),
    sampleCount: z.number().int().min(1).max(172_800_000),
    channels: z.union([z.literal(1), z.literal(2)]),
    sampleRate: z.literal(48000),
    peakPcmWorkingBytes: z.number().int().min(4).max(PCM_WORKING_RESERVATION),
  })
  .strict();
type CacheManifest = z.infer<typeof Manifest>;
export type PreparedCompositionAudioSource = {
  asset: string;
  sourceHash: string;
  key: string;
  decoderVersion: typeof COMPOSITION_AUDIO_DECODER_VERSION;
  ffmpegIdentity: string;
  sourceProvenance: {
    sourceHash: string;
    sourceBytes: number;
    sourceSampleRate: number;
    channels: 1 | 2;
    codec: string;
    sampleFormat: string;
    channelLayout: string;
    timeBase: { numerator: number; denominator: number };
    startTime: string;
    sourceClock: "decoded-sample-ordinal-zero";
  };
  cacheHit: boolean;
  cacheBytes: number;
  path: string;
  sha256: string;
  byteLength: number;
  sampleCount: number;
  channels: 1 | 2;
  sampleRate: 48000;
  /** Bounded Node PCM buffers, excluding decoder process RSS and non-PCM metadata. */
  peakPcmWorkingBytes: number;
};

async function audioSource(options: Options): Promise<{
  path: string;
  provenance: PreparedCompositionAudioSource["sourceProvenance"];
}> {
  const { asset, signal } = options;
  const path = resolve(options.sourceDirectory, asset.path);
  const file = await lstat(path).catch(() =>
    passageError("comp-media-format", "Audio source is unavailable", { path }),
  );
  if (!file.isFile() || !file.size || file.size > 2 ** 40)
    passageError(
      "comp-media-format",
      "Audio source must be a nonempty bounded regular file",
      { path },
    );
  if ((await compositionMediaChecksum(path, signal)) !== asset.sha256)
    passageError(
      "comp-media-checksum",
      "Audio bytes differ from their authored identity",
      { path },
    );
  let stdout: string;
  try {
    ({ stdout } = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_name,channels,sample_rate,time_base,start_time,sample_fmt,channel_layout",
        "-of",
        "json",
        path,
      ],
      { signal, maxBuffer: MANIFEST_BYTES },
    ));
  } catch {
    signal?.throwIfAborted();
    passageError(
      "comp-media-format",
      "Source cannot be inspected by the pinned audio probe",
      { path },
    );
  }
  const Stream = z.object({
    codec_name: z.string().min(1).max(128),
    channels: z.union([z.literal(1), z.literal(2)]),
    sample_rate: z.string().regex(/^\d{1,6}$/),
    time_base: z.string().max(128),
    start_time: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .max(128)
      .optional(),
    sample_fmt: z.string().min(1).max(128),
    channel_layout: z.string().max(128).optional(),
  });
  let stream: z.infer<typeof Stream>;
  try {
    const metadata = z
      .object({ streams: z.array(Stream).length(1) })
      .parse(JSON.parse(stdout));
    stream = metadata.streams[0]!;
  } catch {
    passageError(
      "comp-media-provenance",
      "Audio requires exactly one actual mono or stereo stream",
      { path },
    );
  }
  const sourceSampleRate = Number(stream.sample_rate);
  if (
    sourceSampleRate < 8000 ||
    sourceSampleRate > 384000 ||
    stream.channels !== asset.channels
  )
    passageError(
      "comp-media-provenance",
      "Actual audio rate or channels differ from the supported descriptor",
      { path },
    );
  if ((await compositionMediaChecksum(path, signal)) !== asset.sha256)
    passageError("comp-media-checksum", "Audio changed during probe", { path });
  return {
    path,
    provenance: {
      sourceHash: asset.sha256,
      sourceBytes: file.size,
      sourceSampleRate,
      channels: stream.channels,
      codec: stream.codec_name,
      sampleFormat: stream.sample_fmt,
      channelLayout: stream.channel_layout ?? "unspecified",
      timeBase: parseMediaRational(stream.time_base),
      startTime: stream.start_time ?? "unspecified",
      sourceClock: "decoded-sample-ordinal-zero",
    },
  };
}

/** Incremental validation also handles a float split across arbitrary pipe chunks. */
class PcmInspection {
  readonly digest = createHash("sha256");
  readonly scratch = Buffer.alloc(4);
  bytes = 0;
  remainder = 0;
  peakBytes = 4;
  constructor(
    readonly expectedBytes: number,
    readonly path: string,
  ) {}
  accept(chunk: Buffer, queuedBytes = 0) {
    this.peakBytes = Math.max(this.peakBytes, chunk.length + queuedBytes + 4);
    if (
      this.peakBytes > PCM_WORKING_RESERVATION ||
      this.bytes + chunk.length > this.expectedBytes
    )
      passageError(
        "comp-media-limit",
        "Decoded audio exceeds its sample-count or PCM buffer reservation",
        { path: this.path },
      );
    this.digest.update(chunk);
    this.bytes += chunk.length;
    let offset = 0;
    if (this.remainder) {
      const copied = Math.min(4 - this.remainder, chunk.length);
      chunk.copy(this.scratch, this.remainder, 0, copied);
      this.remainder += copied;
      offset = copied;
      if (this.remainder === 4) {
        this.finite(this.scratch.readFloatLE(0));
        this.remainder = 0;
      }
    }
    for (; offset + 4 <= chunk.length; offset += 4)
      this.finite(chunk.readFloatLE(offset));
    if (offset < chunk.length) {
      this.remainder = chunk.copy(this.scratch, 0, offset);
    }
  }
  private finite(value: number) {
    if (!Number.isFinite(value))
      passageError(
        "comp-media-format",
        "Decoded PCM contains a nonfinite sample",
        { path: this.path },
      );
  }
  finish() {
    if (this.bytes !== this.expectedBytes || this.remainder)
      passageError(
        "comp-media-provenance",
        "Actual decoded 48 kHz sample count differs from descriptor",
        { path: this.path },
      );
    return {
      sha256: "sha256:" + this.digest.digest("hex"),
      byteLength: this.bytes,
      peakPcmWorkingBytes: this.peakBytes,
    };
  }
}

async function decodeAudio(
  source: string,
  target: string,
  asset: AudioAsset,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const inspection = new PcmInspection(
    asset.sampleCount * asset.channels * 4,
    source,
  );
  const file = await open(target, "wx");
  try {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-ar",
        "48000",
        "-ac",
        String(asset.channels),
        "-codec:a",
        "pcm_f32le",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let processError: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let stderrBytes = 0;
    const stopped = new Promise<number | null>((resolve) => {
      child.once("error", (error) => {
        processError = error;
      });
      child.once("close", (code) => {
        if (killTimer) clearTimeout(killTimer);
        resolve(code);
      });
    });
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null || killTimer)
        return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
      killTimer.unref();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MANIFEST_BYTES) stop();
    });
    const abort = () => {
      stop();
      child.stdout.destroy(new Error("Audio preparation cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      for await (const chunk of child.stdout) {
        signal?.throwIfAborted();
        const bytes = chunk as Buffer;
        inspection.accept(bytes, child.stdout.readableLength);
        let offset = 0;
        while (offset < bytes.length) {
          const written = await file.write(
            bytes,
            offset,
            bytes.length - offset,
          );
          if (!written.bytesWritten)
            throw new Error("PCM write made no progress");
          offset += written.bytesWritten;
        }
      }
      const code = await stopped;
      signal?.throwIfAborted();
      if (processError || code !== 0 || stderrBytes > MANIFEST_BYTES)
        passageError(
          "comp-media-format",
          "Pinned decoder could not prepare finite audio PCM",
          { path: source },
        );
      return inspection.finish();
    } catch (error) {
      stop();
      await stopped;
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  } finally {
    await file.close();
  }
}

/** Verify the immutable cache without allocating the complete source PCM. */
export async function verifyCompositionAudioPcm(
  path: string,
  expected: Pick<PreparedCompositionAudioSource, "byteLength" | "sha256"> & {
    header?: Uint8Array;
  },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const stat = await lstat(path).catch(() =>
    passageError("comp-media-format", "Prepared PCM is unavailable", { path }),
  );
  if (!stat.isFile() || stat.size !== expected.byteLength)
    passageError("comp-media-provenance", "Prepared PCM byte count differs", {
      path,
    });
  const header = expected.header;
  let prefix = 0;
  const digest = createHash("sha256");
  const inspection = new PcmInspection(
    expected.byteLength - (header?.length ?? 0),
    path,
  );
  for await (const chunk of createReadStream(path, {
    highWaterMark: STREAM_BYTES,
    signal,
  })) {
    const bytes = chunk as Buffer;
    digest.update(bytes);
    const count = header ? Math.min(header.length - prefix, bytes.length) : 0;
    for (let at = 0; at < count; at++)
      if (bytes[at] !== header![prefix + at])
        passageError(
          "comp-media-provenance",
          "Prepared PCM WAV header differs",
          { path },
        );
    prefix += count;
    inspection.accept(bytes.subarray(count));
  }
  const actual = inspection.finish();
  if ("sha256:" + digest.digest("hex") !== expected.sha256)
    passageError("comp-media-checksum", "Prepared audio PCM was modified", {
      path,
    });
  signal?.throwIfAborted();
  return actual.peakPcmWorkingBytes;
}

/** Actual 48 kHz decoding, finite/count validation and publication share the visual cache transaction. */
export async function prepareCompositionAudioSource(
  options: Options,
): Promise<PreparedCompositionAudioSource> {
  const { asset, signal } = options;
  signal?.throwIfAborted();
  const limits = resolveCompositionMediaLimits(options.limits);
  if (
    asset.sampleCount / 48000 > limits.maxDurationSeconds ||
    PCM_WORKING_RESERVATION > limits.audioWorkingBytes
  )
    passageError(
      "comp-media-limit",
      "Audio source exceeds configured duration or PCM working bytes",
      { path: asset.id },
    );
  const inspected = await audioSource(options);
  const runtime = await runProcess("ffmpeg", ["-version"], {
    signal,
    maxBuffer: 128 * 1024,
  });
  const ffmpegIdentity = hash(runtime.stdout);
  const identity = JSON.stringify({
    decoderVersion: COMPOSITION_AUDIO_DECODER_VERSION,
    ffmpegIdentity,
    source: inspected.provenance,
    sampleRate: 48000,
    sampleCount: asset.sampleCount,
    channels: asset.channels,
    format: "f32le-interleaved",
  });
  const key = hash(identity);
  const root = resolve(options.cacheDirectory),
    directory = join(root, key.slice(7));
  await mkdir(root, { recursive: true });
  const release = await compositionMediaCacheLock(root, signal);
  let stage: string | undefined;
  let published = false;
  try {
    signal?.throwIfAborted();
    const priorBytes = await compositionMediaCacheSize(root);
    if (priorBytes > limits.decodedCacheBytes)
      passageError(
        "comp-media-limit",
        "Existing cumulative media cache exceeds configured bytes",
        { path: root },
      );
    const existing = await lstat(directory).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    let manifest: CacheManifest;
    let cacheHit = false;
    if (existing) {
      if (!existing.isDirectory())
        passageError(
          "comp-media-format",
          "Audio cache entry is not a directory",
          { path: directory },
        );
      const manifestPath = join(directory, "manifest.json");
      const stat = await lstat(manifestPath).catch(() =>
        passageError(
          "comp-media-provenance",
          "Audio cache manifest is missing",
          { path: manifestPath },
        ),
      );
      if (!stat.isFile() || stat.size > MANIFEST_BYTES)
        passageError(
          "comp-media-limit",
          "Audio cache manifest exceeds bounded metadata",
          { path: manifestPath },
        );
      try {
        manifest = Manifest.parse(
          JSON.parse(await readFile(manifestPath, "utf8")),
        );
      } catch {
        passageError("comp-media-provenance", "Invalid audio cache manifest", {
          path: manifestPath,
        });
      }
      if (
        manifest.key !== key ||
        manifest.identity !== identity ||
        manifest.sampleCount !== asset.sampleCount ||
        manifest.channels !== asset.channels ||
        manifest.byteLength !== asset.sampleCount * asset.channels * 4
      )
        passageError(
          "comp-media-provenance",
          "Audio cache provenance differs from requested source",
          { path: directory },
        );
      await verifyCompositionAudioPcm(
        join(directory, "source.f32"),
        manifest,
        signal,
      );
      cacheHit = true;
    } else {
      if (
        priorBytes + asset.sampleCount * asset.channels * 4 + MANIFEST_BYTES >
        limits.decodedCacheBytes
      )
        passageError(
          "comp-media-limit",
          "Cumulative audio cache reservation exceeds configured bytes",
          { path: root },
        );
      stage = join(root, ".prepare-audio-" + randomUUID());
      await mkdir(stage);
      const decoded = await decodeAudio(
        inspected.path,
        join(stage, "source.f32"),
        asset,
        signal,
      );
      manifest = {
        schemaVersion: "composition-audio-cache-1",
        key,
        identity,
        ...decoded,
        sampleCount: asset.sampleCount,
        channels: asset.channels,
        sampleRate: 48000,
      };
      await writeFile(
        join(stage, "manifest.json"),
        JSON.stringify(manifest) + "\n",
      );
      await verifyCompositionAudioPcm(
        join(stage, "source.f32"),
        manifest,
        signal,
      );
      if (
        (await compositionMediaChecksum(inspected.path, signal)) !==
        asset.sha256
      )
        passageError(
          "comp-media-checksum",
          "Audio changed during PCM preparation",
          { path: inspected.path },
        );
      signal?.throwIfAborted();
      if (
        priorBytes + (await compositionMediaCacheSize(stage)) >
        limits.decodedCacheBytes
      )
        passageError(
          "comp-media-limit",
          "Actual prepared audio exceeds cumulative cache bytes",
          { path: root },
        );
      await rename(stage, directory);
      stage = undefined;
      published = true;
    }
    if (
      (await compositionMediaChecksum(inspected.path, signal)) !== asset.sha256
    )
      passageError("comp-media-checksum", "Audio changed during preparation", {
        path: inspected.path,
      });
    signal?.throwIfAborted();
    const cacheBytes = await compositionMediaCacheSize(root);
    signal?.throwIfAborted();
    return {
      asset: asset.id,
      sourceHash: asset.sha256,
      key,
      decoderVersion: COMPOSITION_AUDIO_DECODER_VERSION,
      ffmpegIdentity,
      sourceProvenance: inspected.provenance,
      cacheHit,
      cacheBytes,
      path: join(directory, "source.f32"),
      sha256: manifest.sha256,
      byteLength: manifest.byteLength,
      sampleCount: manifest.sampleCount,
      channels: manifest.channels,
      sampleRate: manifest.sampleRate,
      peakPcmWorkingBytes: manifest.peakPcmWorkingBytes,
    };
  } catch (error) {
    if (published) await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    try {
      if (stage) await rm(stage, { recursive: true, force: true });
    } finally {
      await release();
    }
  }
}
