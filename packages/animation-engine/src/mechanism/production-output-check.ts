import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { productionFailure } from "./production-queue-files.ts";

export interface MechanismProductionDecodedOutput {
  schemaVersion: "mechanism-production-decoded-output-1";
  outputPath: string;
  frames: number;
  width: number;
  height: number;
  fps: number;
  video: { bytes: number; sha256: string };
  audio: {
    bytes: number;
    sha256: string;
    samples: number;
    channels: number;
    sampleRate: 48000;
  };
  method: "full-rgba-and-float32-pcm-stream-decode";
  remaining: string;
}
const stream = z
  .object({
    codec_type: z.enum(["video", "audio"]),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    nb_read_frames: z.string().optional(),
    r_frame_rate: z.string().optional(),
    sample_rate: z.string().optional(),
    channels: z.number().int().positive().optional(),
  })
  .passthrough();
async function decoded(
  path: string,
  kind: "video" | "audio",
  owner: CompositionNodeMemory,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const lease = owner.reserve(4 * 65536 + 16384);
  const deadline = AbortSignal.timeout(600000),
    cancellation = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const args = [
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    path,
    ...(kind === "video"
      ? [
          "-map",
          "0:v:0",
          "-an",
          "-threads",
          "1",
          "-pix_fmt",
          "rgba",
          "-f",
          "rawvideo",
        ]
      : ["-map", "0:a:0", "-vn", "-c:a", "pcm_f32le", "-f", "f32le"]),
    "pipe:1",
  ];
  cancellation.throwIfAborted();
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  let bytes = 0,
    stderr = "",
    spawnError: unknown;
  const closed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-8192);
  });
  const abort = () => child.kill("SIGKILL");
  cancellation.addEventListener("abort", abort, { once: true });
  if (cancellation.aborted) abort();
  const hash = createHash("sha256");
  try {
    for await (const chunk of child.stdout) {
      cancellation.throwIfAborted();
      bytes += (chunk as Buffer).length;
      if (bytes > maximumBytes)
        productionFailure(
          "production-decode-size",
          "Decoded output exceeds its declared clock/shape",
          path,
        );
      hash.update(chunk as Buffer);
    }
    const result = await closed;
    cancellation.throwIfAborted();
    if (spawnError) throw spawnError;
    if (result.code !== 0)
      productionFailure(
        "production-decode-failed",
        "Full output decode failed: " + stderr,
        path,
      );
    return { bytes, sha256: "sha256:" + hash.digest("hex") };
  } finally {
    cancellation.removeEventListener("abort", abort);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await closed;
    lease.release();
  }
}
export async function checkMechanismProductionDecodedOutput(
  outputPath: string,
  expected: {
    frameCount: number;
    width: number;
    height: number;
    fps: number;
    sourceSamples: number;
  },
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
): Promise<MechanismProductionDecodedOutput> {
  const result = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,width,height,nb_read_frames,r_frame_rate,sample_rate,channels",
      "-of",
      "json",
      outputPath,
    ],
    { signal, maxBuffer: 65536 },
  );
  const parsed = z
    .object({ streams: z.array(stream).max(2) })
    .parse(JSON.parse(result.stdout));
  const videos = parsed.streams.filter((s) => s.codec_type === "video"),
    audios = parsed.streams.filter((s) => s.codec_type === "audio");
  if (videos.length !== 1 || audios.length !== 1)
    productionFailure(
      "production-streams",
      "Production output requires exactly one video and one audio stream",
      outputPath,
    );
  const video = videos[0]!,
    audio = audios[0]!,
    rate = video.r_frame_rate?.split("/").map(Number);
  if (
    video.width !== expected.width ||
    video.height !== expected.height ||
    Number(video.nb_read_frames) !== expected.frameCount ||
    !rate ||
    rate.length !== 2 ||
    !rate.every((n) => Number.isFinite(n) && n > 0) ||
    rate[0] !== expected.fps * rate[1]!
  )
    productionFailure(
      "production-video-clock",
      "Actual output differs from its declared frame/shape clock",
      outputPath,
    );
  if (
    Number(audio.sample_rate) !== 48000 ||
    !audio.channels ||
    audio.channels > 2
  )
    productionFailure(
      "production-audio-format",
      "Production audio requires48000Hz and one/two channels",
      outputPath,
    );
  const frameBytes = expected.width * expected.height * 4;
  const videoBytes = frameBytes * expected.frameCount;
  if (!Number.isSafeInteger(videoBytes) || videoBytes < 1)
    productionFailure(
      "production-video-size",
      "Invalid decoded video capacity",
      outputPath,
    );
  const picture = await decoded(outputPath, "video", owner, videoBytes, signal);
  if (picture.bytes !== videoBytes)
    productionFailure(
      "production-video-decode",
      "Full decoded video frame count differs",
      outputPath,
    );
  const sampleLimit =
    Math.ceil((expected.frameCount * 48000) / expected.fps) + 4096;
  const sound = await decoded(
    outputPath,
    "audio",
    owner,
    sampleLimit * audio.channels * 4,
    signal,
  );
  const samples = sound.bytes / (audio.channels * 4);
  if (
    !Number.isInteger(samples) ||
    samples < expected.sourceSamples ||
    samples > sampleLimit
  )
    productionFailure(
      "production-audio-clock",
      "Full decoded audio sample count differs from its source/output clock",
      outputPath,
    );
  return {
    schemaVersion: "mechanism-production-decoded-output-1",
    outputPath,
    frames: expected.frameCount,
    width: expected.width,
    height: expected.height,
    fps: expected.fps,
    video: picture,
    audio: { ...sound, samples, channels: audio.channels, sampleRate: 48000 },
    method: "full-rgba-and-float32-pcm-stream-decode",
    remaining:
      "Technical byte/clock decode only; glyph/readability, mechanics, factual, playback and listening review remain separate.",
  };
}
