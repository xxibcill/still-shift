import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { runProcess } from "./subprocess.ts";
import type { CompositionOutputProfile } from "./composition-output.ts";

/** Verify container clocks and actually decoded PCM/Opus sample counts before publication. */
export async function verifyCompositionOutputAudio(
  path: string,
  source: { path: string; sampleCount: number },
  profile: CompositionOutputProfile,
  signal?: AbortSignal,
) {
  const probe = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,duration_ts,time_base",
      "-of",
      "json",
      path,
    ],
    { signal, maxBuffer: 65536 },
  );
  const streams = (
    JSON.parse(probe.stdout) as {
      streams?: {
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        duration_ts?: number;
        time_base?: string;
      }[];
    }
  ).streams;
  const audio = streams?.[0];
  const codec = profile.audioCodec === "libopus" ? "opus" : profile.audioCodec;
  if (
    streams?.length !== 1 ||
    audio?.codec_name !== codec ||
    audio.sample_rate !== "48000" ||
    audio.channels !== 2 ||
    (codec !== "opus" &&
      (audio.time_base !== "1/48000" ||
        audio.duration_ts !== source.sampleCount))
  )
    throw Error(
      "Composition output audio codec or complete source clock differs",
    );
  if (codec === "aac") return { codec, sampleCount: source.sampleCount };
  signal?.throwIfAborted();
  const decoder = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      "-err_detect",
      "explode",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-c:a",
      "pcm_f32le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  decoder.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + bytes.toString()).slice(-65536);
  });
  const reaped = new Promise<void>((resolve) =>
    decoder.once("close", () => resolve()),
  );
  const closed = new Promise<void>((resolve, reject) => {
    decoder.once("error", reject);
    decoder.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              `Composition output audio decode failed (${code}): ${stderr}`,
            ),
          ),
    );
  });
  closed.catch(() => undefined);
  const abort = () => {
    decoder.kill("SIGKILL");
  };
  signal?.addEventListener("abort", abort, { once: true });
  let bytes = 0;
  const decoded = createHash("sha256");
  try {
    if (signal?.aborted) abort();
    for await (const chunk of decoder.stdout) {
      signal?.throwIfAborted();
      bytes += chunk.length;
      if (bytes > source.sampleCount * 8)
        throw Error("Decoded output audio exceeds the complete source clock");
      decoded.update(chunk);
    }
    await closed;
    signal?.throwIfAborted();
    if (bytes !== source.sampleCount * 8)
      throw Error(
        "Decoded output audio ended before the complete source clock",
      );
    const decodedChecksum = `sha256:${decoded.digest("hex")}`;
    if (codec === "pcm_f32le") {
      const original = createHash("sha256");
      for await (const chunk of createReadStream(source.path, {
        start: 58,
        signal,
      }))
        original.update(chunk);
      if (decodedChecksum !== `sha256:${original.digest("hex")}`)
        throw Error(
          "Editor output PCM differs from the captured master samples",
        );
    }
    return {
      codec,
      sampleCount: source.sampleCount,
      decodedSampleCount: bytes / 8,
      decodedChecksum,
    };
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    decoder.kill("SIGKILL");
    await reaped;
    signal?.removeEventListener("abort", abort);
  }
}
