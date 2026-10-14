import { z } from "zod";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { evidenceProcess } from "./production-evidence-process.ts";
import { productionFailure } from "./production-queue-files.ts";
export async function productionReviewAudioHash(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const result = await evidenceProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-threads",
      "1",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-vn",
      "-c:a",
      "pcm_f32le",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "pipe:1",
    ],
    owner,
    signal,
  );
  const match = /^SHA256=([a-f0-9]{64})\s*$/.exec(result.stdout);
  if (!match)
    productionFailure(
      "production-evidence-audio-hash",
      "Invalid actual PCM hash",
      path,
    );
  return "sha256:" + match[1];
}
export async function productionReviewAudioFacts(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const result = await evidenceProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,channels,duration_ts,time_base",
      "-of",
      "json",
      path,
    ],
    owner,
    signal,
  );
  const data = z
    .object({
      streams: z
        .array(
          z
            .object({
              codec_type: z.literal("audio"),
              codec_name: z.literal("pcm_f32le"),
              sample_rate: z.literal("48000"),
              channels: z.number().int().min(1).max(2),
              duration_ts: z.number().int().positive(),
              time_base: z.literal("1/48000"),
            })
            .passthrough(),
        )
        .length(1),
    })
    .parse(JSON.parse(result.stdout));
  return data.streams[0]!;
}
