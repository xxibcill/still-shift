import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AnimationEngineError,
  compositionPcmBoundary,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { MechanismFinding } from "./io.ts";

const SAMPLE_RATE = 48_000;
const MAX_SAMPLES = 172_800_000;
const PAGE_SAMPLES = 8192;
const SEARCH_SAMPLES = 4800;
const SYNC_TOLERANCE_SAMPLES = 64;
const ACTIVE_MEAN_SQUARE = 1e-10;

export type MechanismFinalAudioRequest = {
  sourcePath: string;
  finalPath: string;
  sourceSampleCount: number;
  sourceChannels: 1 | 2;
  frameCount: number;
  fps: number;
  signal?: AbortSignal;
};
type AudioStream = {
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  duration_ts?: number;
  time_base?: string;
  start_time?: string;
};
type DecodedAudio = { sampleCount: number; sha256: string };
type Comparison = {
  correlation: number;
  gain: number;
  normalizedError: number;
  sourceRms: number;
  decodedRms: number;
};
type AlignmentWindow = Comparison & {
  startSample: number;
  sampleCount: number;
  lagSamples: number;
};
export type MechanismFinalAudioReport = {
  schemaVersion: "mechanism-final-audio-check-1";
  valid: boolean;
  sourceClock: {
    sampleRate: 48000;
    sampleCount: number;
    channels: 1 | 2;
    authoredSampleCount: number;
  };
  decodedClock?: {
    codec: string;
    sampleRate: 48000;
    channels: 2;
    sampleCount: number;
    paddingSamples: number;
    paddingAllowanceSamples: number;
    sourceSha256: string;
    decodedSha256: string;
  };
  alignment?: Comparison & {
    windows: AlignmentWindow[];
    toleranceSamples: number;
    maxLagSamples: number;
  };
  tail?: Comparison & {
    startSample: number;
    sampleCount: number;
    lastActiveSampleExclusive: number;
    preserved: boolean;
  };
  findings: MechanismFinding[];
};

/** Read-only verification: decoding never changes the source clock or compensates for a shift. */
export async function verifyMechanismFinalAudio(
  request: MechanismFinalAudioRequest,
): Promise<MechanismFinalAudioReport> {
  validateRequest(request);
  const authoredSampleCount = compositionPcmBoundary(
    request.frameCount,
    request.fps,
  );
  const findings: MechanismFinding[] = [];
  const report: MechanismFinalAudioReport = {
    schemaVersion: "mechanism-final-audio-check-1",
    valid: false,
    sourceClock: {
      sampleRate: SAMPLE_RATE,
      sampleCount: request.sourceSampleCount,
      channels: request.sourceChannels,
      authoredSampleCount,
    },
    findings,
  };
  const add = (code: string, message: string, path = request.finalPath) =>
    findings.push({ code, message, path });
  if (authoredSampleCount !== request.sourceSampleCount)
    add(
      "mechanism-audio-source-duration",
      "The complete source PCM clock must equal the authored video clock; stretching or padding is not accepted",
      request.sourcePath,
    );
  const sourceStreams = await probeAudio(request.sourcePath, request.signal);
  const source = sourceStreams[0];
  if (
    sourceStreams.length !== 1 ||
    source?.sample_rate !== "48000" ||
    source.channels !== request.sourceChannels ||
    !source.codec_name?.startsWith("pcm_") ||
    source.time_base !== "1/48000" ||
    source.duration_ts !== request.sourceSampleCount
  ) {
    add(
      "mechanism-audio-source-clock",
      "Actual source is not the declared single 48 kHz PCM stream and sample count",
      request.sourcePath,
    );
    return report;
  }
  const streams = await probeAudio(request.finalPath, request.signal);
  const stream = streams[0];
  if (streams.length !== 1 || !stream) {
    add(
      "mechanism-final-audio-missing",
      "Final artifact must contain exactly one complete audio stream",
    );
    return report;
  }
  const codec = stream.codec_name ?? "unknown";
  const paddingAllowance = codec === "aac" ? 1023 : 0;
  if (
    (codec !== "aac" && !codec.startsWith("pcm_")) ||
    stream.sample_rate !== "48000" ||
    stream.channels !== 2
  ) {
    add(
      "mechanism-final-audio-format",
      "Final audio must be 48 kHz stereo AAC or PCM; verification does not resample it",
    );
    return report;
  }
  if (
    stream.time_base !== "1/48000" ||
    !Number.isSafeInteger(stream.duration_ts) ||
    Math.abs(stream.duration_ts! - authoredSampleCount) > 1
  )
    add(
      "mechanism-final-audio-duration",
      "Final audio container duration differs from the complete authored sample clock",
    );
  if (
    !Number.isFinite(
      Number(stream.start_time ?? (codec.startsWith("pcm_") ? "0" : undefined)),
    ) ||
    Math.abs(Number(stream.start_time ?? "0")) > 1 / SAMPLE_RATE
  )
    add(
      "mechanism-final-audio-start",
      "Final audio starts outside sample zero relative to the video timeline",
    );
  const directory = await mkdtemp(join(tmpdir(), "mechanism-audio-check-"));
  try {
    const sourcePath = join(directory, "source.f32le"),
      finalPath = join(directory, "decoded.f32le");
    const original = await decodePcm(
      request.sourcePath,
      sourcePath,
      request.sourceChannels,
      request.sourceSampleCount,
      request.signal,
    );
    const decoded = await decodePcm(
      request.finalPath,
      finalPath,
      2,
      authoredSampleCount + paddingAllowance,
      request.signal,
    );
    report.decodedClock = {
      codec,
      sampleRate: SAMPLE_RATE,
      channels: 2,
      sampleCount: decoded.sampleCount,
      paddingSamples: decoded.sampleCount - authoredSampleCount,
      paddingAllowanceSamples: paddingAllowance,
      sourceSha256: original.sha256,
      decodedSha256: decoded.sha256,
    };
    if (original.sampleCount !== request.sourceSampleCount)
      add(
        "mechanism-audio-source-decoded-clock",
        "Decoded source sample count differs from the declared PCM clock",
        request.sourcePath,
      );
    if (
      decoded.sampleCount < authoredSampleCount ||
      decoded.sampleCount > authoredSampleCount + paddingAllowance
    )
      add(
        "mechanism-final-audio-decoded-duration",
        "Decoded final audio is truncated or exceeds the codec-aware padding allowance",
      );
    const analysis = await comparePcm(
      sourcePath,
      finalPath,
      original.sampleCount,
      decoded.sampleCount,
      request.signal,
    );
    report.alignment = {
      ...analysis.comparison,
      windows: analysis.windows,
      toleranceSamples: SYNC_TOLERANCE_SAMPLES,
      maxLagSamples: Math.max(
        0,
        ...analysis.windows.map((window) => Math.abs(window.lagSamples)),
      ),
    };
    report.tail = analysis.tail;
    if (!contentAgrees(analysis.comparison))
      add(
        "mechanism-final-audio-content",
        "Decoded final waveform does not preserve the complete source content, level, and sample alignment",
      );
    if (
      analysis.windows.some(
        (window) => Math.abs(window.lagSamples) > SYNC_TOLERANCE_SAMPLES,
      )
    )
      add(
        "mechanism-final-audio-sync",
        "Independent early, middle, or late content is shifted by more than 64 source samples",
      );
    if (!analysis.tail.preserved)
      add(
        "mechanism-final-audio-tail",
        "The terminal source content is missing, shifted, or attenuated beyond codec tolerances",
      );
    report.valid = findings.length === 0;
    return report;
  } catch (cause) {
    request.signal?.throwIfAborted();
    throw new AnimationEngineError(
      "RENDER_FAILED",
      "Final audio decode verification failed",
      {
        stage: "mechanism-final-audio",
        path: request.finalPath,
        nextAction:
          "Inspect the final artifact and retained render diagnostics; do not alter the source speech clock",
      },
      { cause },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function validateRequest(request: MechanismFinalAudioRequest) {
  if (
    !Number.isSafeInteger(request.sourceSampleCount) ||
    request.sourceSampleCount < 1 ||
    request.sourceSampleCount > MAX_SAMPLES ||
    ![1, 2].includes(request.sourceChannels) ||
    !Number.isInteger(request.fps) ||
    request.fps < 1 ||
    request.fps > 60 ||
    !Number.isSafeInteger(request.frameCount) ||
    request.frameCount < 1 ||
    request.frameCount > 108_000 ||
    compositionPcmBoundary(request.frameCount, request.fps) > MAX_SAMPLES
  )
    throw new RangeError(
      "Audio verification requires bounded 48 kHz source metadata and an authored clock of at most one hour",
    );
  request.signal?.throwIfAborted();
}
async function probeAudio(
  path: string,
  signal?: AbortSignal,
): Promise<AudioStream[]> {
  const probe = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,duration_ts,time_base,start_time",
      "-of",
      "json",
      path,
    ],
    { signal, maxBuffer: 65536 },
  );
  const value = JSON.parse(probe.stdout) as { streams?: AudioStream[] };
  return value.streams ?? [];
}
async function decodePcm(
  source: string,
  target: string,
  channels: 1 | 2,
  maxSamples: number,
  signal?: AbortSignal,
): Promise<DecodedAudio> {
  signal?.throwIfAborted();
  const file = await open(target, "wx");
  const child = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-threads",
      "1",
      "-err_detect",
      "explode",
      "-i",
      source,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      ...(channels === 1 ? ["-af", "pan=stereo|c0=c0|c1=c0"] : []),
      "-c:a",
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
  let stderr = "",
    processError: Error | undefined;
  child.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + bytes.toString()).slice(-65536);
  });
  const closed = new Promise<number | null>((accept) => {
    child.once("error", (error) => {
      processError = error;
    });
    child.once("close", accept);
  });
  const abort = () => {
    child.kill("SIGKILL");
  };
  signal?.addEventListener("abort", abort, { once: true });
  const hash = createHash("sha256");
  let byteLength = 0;
  try {
    if (signal?.aborted) abort();
    for await (const chunk of child.stdout) {
      signal?.throwIfAborted();
      const bytes = chunk as Buffer;
      byteLength += bytes.length;
      if (byteLength > maxSamples * 8)
        throw new Error("Decoded PCM exceeds the declared verification budget");
      hash.update(bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const written = await file.write(bytes, offset, bytes.length - offset);
        if (!written.bytesWritten)
          throw new Error("Decoded PCM write made no progress");
        offset += written.bytesWritten;
      }
    }
    const code = await closed;
    signal?.throwIfAborted();
    if (processError || code !== 0)
      throw new Error(`PCM decoder failed (${code}): ${stderr}`, {
        cause: processError,
      });
    if (byteLength % 8)
      throw new Error("Decoded PCM ends with an incomplete stereo sample");
    return {
      sampleCount: byteLength / 8,
      sha256: `sha256:${hash.digest("hex")}`,
    };
  } finally {
    child.kill("SIGKILL");
    await closed;
    signal?.removeEventListener("abort", abort);
    await file.close();
  }
}
type Sums = {
  source: number;
  decoded: number;
  product: number;
  error: number;
  count: number;
};
const emptySums = (): Sums => ({
  source: 0,
  decoded: 0,
  product: 0,
  error: 0,
  count: 0,
});
function accumulate(sums: Sums, source: number, decoded: number) {
  if (!Number.isFinite(source) || !Number.isFinite(decoded))
    throw new Error("Decoded PCM contains a non-finite sample");
  sums.source += source * source;
  sums.decoded += decoded * decoded;
  sums.product += source * decoded;
  sums.error += (source - decoded) ** 2;
  sums.count++;
}
function comparison(sums: Sums): Comparison {
  return {
    correlation:
      sums.source && sums.decoded
        ? sums.product / Math.sqrt(sums.source * sums.decoded)
        : sums.source === sums.decoded
          ? 1
          : 0,
    gain: sums.source ? Math.sqrt(sums.decoded / sums.source) : 1,
    normalizedError: sums.source
      ? Math.sqrt(sums.error / sums.source)
      : Math.sqrt(sums.error / Math.max(1, sums.count)),
    sourceRms: Math.sqrt(sums.source / Math.max(1, sums.count)),
    decodedRms: Math.sqrt(sums.decoded / Math.max(1, sums.count)),
  };
}
function contentAgrees(value: Comparison) {
  return value.sourceRms < 1e-5
    ? value.decodedRms < 1e-5
    : value.correlation >= 0.97 &&
        value.gain >= 0.94 &&
        value.gain <= 1.06 &&
        value.normalizedError <= 0.25;
}
async function readSamples(
  file: FileHandle,
  start: number,
  count: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(count * 8);
  let offset = 0;
  while (offset < bytes.length) {
    const read = await file.read(
      bytes,
      offset,
      bytes.length - offset,
      start * 8 + offset,
    );
    if (!read.bytesRead) break;
    offset += read.bytesRead;
  }
  return bytes.subarray(0, offset);
}
async function comparePcm(
  sourcePath: string,
  finalPath: string,
  sourceCount: number,
  finalCount: number,
  signal?: AbortSignal,
) {
  const source = await open(sourcePath, "r"),
    decoded = await open(finalPath, "r");
  const sums = emptySums(),
    strongest = [undefined, undefined, undefined] as (
      | { start: number; count: number; energy: number }
      | undefined
    )[];
  let lastActive: { start: number; count: number; end: number } | undefined;
  try {
    for (let start = 0; start < sourceCount; start += PAGE_SAMPLES) {
      signal?.throwIfAborted();
      const count = Math.min(PAGE_SAMPLES, sourceCount - start);
      const original = await readSamples(source, start, count),
        output = await readSamples(decoded, start, count);
      let energy = 0,
        activeEnd = 0;
      for (let offset = 0; offset < original.length; offset += 4) {
        const value = original.readFloatLE(offset),
          actual = offset < output.length ? output.readFloatLE(offset) : 0;
        accumulate(sums, value, actual);
        energy += value * value;
        if (Math.abs(value) > 1e-5)
          activeEnd = start + Math.floor(offset / 8) + 1;
      }
      const third = Math.min(2, Math.floor((start * 3) / sourceCount));
      if (
        energy / (count * 2) > ACTIVE_MEAN_SQUARE &&
        (!strongest[third] || energy > strongest[third]!.energy)
      )
        strongest[third] = { start, count, energy };
      if (energy / (count * 2) > ACTIVE_MEAN_SQUARE && activeEnd)
        lastActive = { start, count, end: activeEnd };
    }
    const windows: AlignmentWindow[] = [];
    for (const window of strongest)
      if (window)
        windows.push(
          await alignmentWindow(
            source,
            decoded,
            window.start,
            window.count,
            finalCount,
            signal,
          ),
        );
    const tailStart =
        lastActive?.start ?? Math.max(0, sourceCount - PAGE_SAMPLES),
      tailCount = lastActive?.count ?? Math.min(PAGE_SAMPLES, sourceCount);
    const terminal = await alignmentWindow(
      source,
      decoded,
      tailStart,
      tailCount,
      finalCount,
      signal,
    );
    const tail = {
      ...terminal,
      lastActiveSampleExclusive: lastActive?.end ?? 0,
      preserved:
        finalCount >= sourceCount &&
        contentAgrees(terminal) &&
        Math.abs(terminal.lagSamples) <= SYNC_TOLERANCE_SAMPLES,
    };
    return { comparison: comparison(sums), windows, tail };
  } finally {
    await source.close();
    await decoded.close();
  }
}
async function alignmentWindow(
  source: FileHandle,
  decoded: FileHandle,
  start: number,
  count: number,
  finalCount: number,
  signal?: AbortSignal,
): Promise<AlignmentWindow> {
  signal?.throwIfAborted();
  const original = await readSamples(source, start, count);
  const begin = Math.max(0, start - SEARCH_SAMPLES),
    end = Math.min(finalCount, start + count + SEARCH_SAMPLES);
  const output = await readSamples(decoded, begin, Math.max(0, end - begin));
  const score = (lag: number, stride: number) => {
    const sums = emptySums();
    for (let sample = 0; sample < count; sample += stride)
      for (let channel = 0; channel < 2; channel++) {
        const offset = (start + sample + lag - begin) * 8 + channel * 4;
        const actual =
          offset >= 0 && offset + 4 <= output.length
            ? output.readFloatLE(offset)
            : 0;
        accumulate(
          sums,
          original.readFloatLE(sample * 8 + channel * 4),
          actual,
        );
      }
    return comparison(sums);
  };
  let bestLag = 0,
    bestScore = score(0, 8);
  for (let lag = -SEARCH_SAMPLES; lag <= SEARCH_SAMPLES; lag += 8) {
    const candidate = score(lag, 8);
    if (candidate.correlation > bestScore.correlation + 1e-12) {
      bestLag = lag;
      bestScore = candidate;
    }
  }
  const coarseLag = bestLag;
  for (let lag = coarseLag - 7; lag <= coarseLag + 7; lag++) {
    const candidate = score(lag, 4);
    if (candidate.correlation > bestScore.correlation + 1e-12) {
      bestLag = lag;
      bestScore = candidate;
    }
  }
  return {
    ...score(0, 1),
    startSample: start,
    sampleCount: count,
    lagSamples: bestLag,
  };
}
