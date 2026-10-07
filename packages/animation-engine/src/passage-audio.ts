import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { PassageAudioAsset } from "../../scene-contract/src/passage-audio.ts";
import type { CompiledStoryPassage } from "../../renderer-core/src/story-passage.ts";
import { decibelsToGain } from "../../renderer-core/src/passage-audio.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const sampleRate = 48000;
export type PassageAudioOptions = {
  soundEffects?: boolean | undefined;
  /** Native narration owns these exact output-sample intervals. */
  narrationExclusions?: readonly { start: number; end: number }[];
  /** Internal passage adapter applies the common master after adding native PCM. */
  masterGainDb?: number;
  range?: { start: number; end: number };
  signal?: AbortSignal | undefined;
};

async function probeAudio(path: string, signal?: AbortSignal) {
  const result = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=duration,channels",
      "-of",
      "json",
      path,
    ],
    { signal },
  );
  const stream = JSON.parse(result.stdout).streams[0] as
    | { duration?: string; channels?: number }
    | undefined;
  const duration = Number(stream?.duration),
    channels = stream?.channels;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    (channels !== 1 && channels !== 2)
  )
    passageError(
      "sound-format",
      "Audio must have a known duration and one or two channels: " + path,
      { path },
    );
  return { duration, channels };
}

export async function inspectPassageAudioAsset(
  path: string,
  signal?: AbortSignal,
) {
  if (![".wav", ".mp3"].includes(extname(path).toLowerCase()))
    passageError("sound-format", "Use a WAV or MP3 sound asset", { path });
  const sha256 =
    "sha256:" +
    createHash("sha256")
      .update(await readFile(path, { signal }))
      .digest("hex");
  return { path, sha256, ...(await probeAudio(path, signal)) };
}

export async function verifyPassageAudioAssets(
  passage: CompiledStoryPassage,
  allowPath?: (path: string) => Promise<unknown>,
  signal?: AbortSignal,
) {
  const metadata = new Map<string, Awaited<ReturnType<typeof probeAudio>>>();
  for (const asset of passage.audio?.assets ?? []) {
    signal?.throwIfAborted();
    await allowPath?.(asset.path);
    // Hash before probing so changed or substituted bytes cannot be accepted.
    const hash =
      "sha256:" +
      createHash("sha256")
        .update(await readFile(asset.path, { signal }))
        .digest("hex");
    if (hash !== asset.sha256)
      passageError("sound-checksum", "Sound checksum differs: " + asset.id, {
        path: asset.path,
      });
    if (![".wav", ".mp3"].includes(extname(asset.path).toLowerCase()))
      passageError("sound-format", "Use a WAV or MP3 sound asset", {
        path: asset.path,
      });
    metadata.set(asset.id, await probeAudio(asset.path, signal));
  }
  for (const sound of passage.audio?.sounds ?? []) {
    const metadataForSound = metadata.get(sound.asset);
    if (
      !metadataForSound ||
      metadataForSound.duration + 1 / sampleRate <
        (sound.sourceStartFrame + sound.durationFrames) / passage.plan.fps
    )
      passageError(
        "sound-source-range",
        "Sound source does not cover the requested trim: " + sound.id,
        { beat: sound.beat, event: sound.id },
      );
  }
  return metadata;
}

/** Linear gain/fades match Web Audio. Mix the whole schedule before trimming a range. */
export async function renderPassageAudio(
  output: string,
  passage: CompiledStoryPassage,
  narration?: string,
  options: PassageAudioOptions = {},
) {
  const sounds =
    options.soundEffects === false ? [] : (passage.audio?.sounds ?? []);
  if (!narration && !sounds.length) return undefined;
  const metadata = sounds.length
    ? await verifyPassageAudioAssets(passage, undefined, options.signal)
    : new Map();
  const fps = passage.plan.fps,
    samples = (frame: number) => Math.round((frame / fps) * sampleRate);
  const range = options.range ?? { start: 0, end: passage.frameCount };
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end > passage.frameCount ||
    range.end <= range.start
  )
    throw new Error("Invalid audio frame range");
  const inputs: string[] = [],
    filters: string[] = [],
    tracks: string[] = [];
  const input = (path: string, channels: number) => {
    const index = inputs.length;
    inputs.push(path);
    return (
      `[${index}:a:0]aresample=${sampleRate},aformat=sample_fmts=fltp,` +
      (channels === 1
        ? "pan=stereo|c0=c0|c1=c0"
        : "aformat=channel_layouts=stereo")
    );
  };
  if (narration) {
    const { channels } = await probeAudio(narration, options.signal);
    const exclusions = options.narrationExclusions ?? [];
    const voiceIntervals: { start: number; end: number }[] = [];
    let begin = 0;
    for (const interval of exclusions) {
      if (
        !Number.isSafeInteger(interval.start) ||
        !Number.isSafeInteger(interval.end) ||
        interval.start < begin ||
        interval.end <= interval.start ||
        interval.end > samples(passage.frameCount)
      )
        throw new Error("Invalid native narration exclusion interval");
      if (begin < interval.start)
        voiceIntervals.push({ start: begin, end: interval.start });
      begin = interval.end;
    }
    if (begin < samples(passage.frameCount))
      voiceIntervals.push({ start: begin, end: samples(passage.frameCount) });
    if (voiceIntervals.length)
      filters.push(
        input(narration, channels) +
          `,atrim=start_sample=${samples(passage.plan.sourceStartFrame)}:end_sample=${samples(passage.endFrameExclusive)},asetpts=PTS-STARTPTS,volume=${decibelsToGain(passage.audio?.narrationGainDb ?? 0)}[voice]`,
      );
    if (!exclusions.length) tracks.push("[voice]");
    else if (voiceIntervals.length) {
      filters.push(
        `[voice]asplit=${voiceIntervals.length}` +
          voiceIntervals.map((_, i) => `[voicePart${i}]`).join(""),
      );
      voiceIntervals.forEach((interval, i) => {
        filters.push(
          `[voicePart${i}]atrim=start_sample=${interval.start}:end_sample=${interval.end},asetpts=PTS-STARTPTS,adelay=${interval.start}S:all=1[voiceKept${i}]`,
        );
        tracks.push(`[voiceKept${i}]`);
      });
    }
  }
  for (const [index, sound] of sounds.entries()) {
    const asset = passage.audio!.assets.find(
      (asset: PassageAudioAsset) => asset.id === sound.asset,
    )!;
    let filter =
      input(asset.path, metadata.get(asset.id)!.channels) +
      `,atrim=start_sample=${samples(sound.sourceStartFrame)}:end_sample=${samples(sound.sourceStartFrame + sound.durationFrames)},asetpts=PTS-STARTPTS`;
    if (sound.fadeInFrames)
      filter += `,afade=t=in:ss=0:ns=${samples(sound.fadeInFrames)}:curve=tri`;
    if (sound.fadeOutFrames)
      filter += `,afade=t=out:ss=${samples(sound.durationFrames - sound.fadeOutFrames)}:ns=${samples(sound.fadeOutFrames)}:curve=tri`;
    filter += `,volume=${decibelsToGain(sound.gainDb)},adelay=${samples(sound.start)}S:all=1[sound${index}]`;
    filters.push(filter);
    tracks.push(`[sound${index}]`);
  }
  if (!tracks.length) return undefined;
  const masterGainDb = options.masterGainDb ?? passage.audio?.masterGainDb ?? 0;
  filters.push(
    tracks.join("") +
      `amix=inputs=${tracks.length}:normalize=0:dropout_transition=0,volume=${decibelsToGain(masterGainDb)},apad=whole_len=${samples(passage.frameCount)},atrim=start_sample=${samples(range.start)}:end_sample=${samples(range.end)},asetpts=PTS-STARTPTS[mix]`,
  );
  await runProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-n",
      ...inputs.flatMap((path) => ["-i", path]),
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[mix]",
      "-ar",
      String(sampleRate),
      "-c:a",
      "pcm_f32le",
      output,
    ],
    { signal: options.signal },
  );
  return {
    path: output,
    sampleRate,
    frameRange: range,
    masterGainDb,
    narrationGainDb: passage.audio?.narrationGainDb ?? 0,
    assets: sounds.length ? passage.audio!.assets : [],
    sounds,
  };
}
