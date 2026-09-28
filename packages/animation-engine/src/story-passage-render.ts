import {
  renderPassageAudio,
  verifyPassageAudioAssets,
} from "./passage-audio.ts";
import { isStoryTransition } from "../../renderer-core/src/story-transition.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { cachedStoryTransition } from "./story-transition-render.ts";
import { randomUUID } from "node:crypto";
import {
  cachedPassageBeat,
  passageBeatKey,
  passageJobRuntimeIdentity,
  passageRuntimeIdentity,
} from "./passage-cache.ts";
import { acquirePassageJob } from "./passage-job.ts";
import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import {
  PreparedAnimationEngine,
  validatePreparedAssets,
} from "./prepared-animation-engine.ts";
import {
  passageChecksum,
  writePassageJson,
  type PreparedPassage,
} from "./story-passage-io.ts";

type Stream = {
  codec_type: string;
  nb_read_frames?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
};
const probe = async (
  path: string,
  signal?: AbortSignal,
): Promise<{ streams: Stream[] }> => {
  const { stdout } = await runProcess(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_streams", "-of", "json", path],
    { signal },
  );
  return JSON.parse(stdout);
};

export async function verifyPassageNarration(
  passage: PreparedPassage,
  narration: string,
  signal?: AbortSignal,
) {
  assert.ok(
    passage.plan.narration,
    "Narrated export requires a narration identity in the plan",
  );
  const checksum = passageChecksum(await readFile(narration, { signal }));
  assert.equal(
    checksum,
    passage.plan.narration!.sha256,
    "Narration bytes must match the beat plan authority",
  );
  const { streams } = await probe(narration, signal);
  const audio = streams.find((stream) => stream.codec_type === "audio");
  assert.ok(audio, "Narration must contain audio");
  assert.ok(
    Number(audio.duration) >= passage.endFrameExclusive / passage.plan.fps,
    "Narration must cover the entire source interval",
  );
}

async function verifyVideo(
  path: string,
  frameCount: number,
  fps: number,
  size: { width: number; height: number },
  audio: boolean,
  signal?: AbortSignal,
) {
  const { streams } = await probe(path, signal);
  const video = streams.find((stream) => stream.codec_type === "video");
  assert.equal(
    Number(video?.nb_read_frames),
    frameCount,
    "Decoded frame count must match the passage",
  );
  assert.equal(video?.r_frame_rate, fps + "/1");
  assert.equal(video.width, size.width);
  assert.equal(video.height, size.height);
  assert.equal(
    streams.some((stream) => stream.codec_type === "audio"),
    audio,
  );
  await runProcess("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
    signal,
  });
  return {
    path,
    sha256: passageChecksum(await readFile(path, { signal })),
    streams,
  };
}

async function assembleStoryPassage(
  output: string,
  passage: PreparedPassage,
  narration: string | undefined,
  options: PassageRenderOptions & {
    cacheDirectory: string;
    runtime: string;
    sceneDirectory: string;
    job: Awaited<ReturnType<typeof acquirePassageJob>>;
  },
) {
  const run = (command: string, args: string[]) => {
    options.signal?.throwIfAborted();
    return runProcess(command, args, { signal: options.signal });
  };
  const started = performance.now();
  const { plan } = passage;
  const size = {
    width: passage.beats[0]!.scene.width,
    height: passage.beats[0]!.scene.height,
  };
  const range = options.range ?? { start: 0, end: passage.frameCount };
  const frameCount = range.end - range.start,
    sourceStartFrame = plan.sourceStartFrame + range.start,
    endFrameExclusive = plan.sourceStartFrame + range.end;
  const hasTransitions =
    plan.schemaVersion === "story-passage-2" &&
    plan.beats.some((b) => isStoryTransition(b.handoff));
  const selected = hasTransitions
    ? passage.beats
    : passage.beats.filter(
        (beat) => beat.end > range.start && beat.start < range.end,
      );
  const renderStart = range.start - selected[0]!.start;
  const clips = [];
  for (const beat of selected) {
    options.signal?.throwIfAborted();
    options.onProgress?.({
      stage: "beat",
      beat: beat.id,
      completed: clips.length,
      total: selected.length,
    });
    const clip = await cachedPassageBeat({
      cacheDirectory: options.cacheDirectory,
      key: passageBeatKey(beat.scene, options.runtime),
      output: join(options.sceneDirectory, beat.id + ".mp4"),
      signal: options.signal,
      render: (outputPath) =>
        new PreparedAnimationEngine().animate({
          scenePath: join(options.sceneDirectory, beat.id + ".json"),
          outputPath,
          signal: options.signal,
        }),
      verify: (path) =>
        verifyVideo(
          path,
          beat.scene.frameCount,
          plan.fps,
          size,
          false,
          options.signal,
        ),
    });
    clips.push(clip);
    await options.job.beat(beat.id);
    options.onProgress?.({
      stage: clip.reused ? "reused" : "rendered",
      beat: beat.id,
      completed: clips.length,
      total: selected.length,
    });
  }
  const assemblyInputs = clips.slice();
  const segments: string[] = [];
  const trims: string[] = [];
  for (const [index, beat] of selected.entries()) {
    const planned = plan.beats.find((b) => b.id === beat.id)!;
    const handoff = "handoff" in planned ? planned.handoff : undefined;
    let start = 0;
    if (index && isStoryTransition(handoff)) {
      const joinClip = await cachedStoryTransition({
        outgoing: {
          ...clips[index - 1]!,
          frameCount: selected[index - 1]!.scene.frameCount,
          joinStart: selected[index - 1]!.frameCount,
        },
        incoming: clips[index]!,
        handoff: handoff!,
        fps: plan.fps,
        width: size.width,
        height: size.height,
        output: join(options.sceneDirectory, beat.id + ".join.mp4"),
        cacheDirectory: options.cacheDirectory,
        signal: options.signal,
        verify: (path) =>
          verifyVideo(
            path,
            handoff!.frames!,
            plan.fps,
            size,
            false,
            options.signal,
          ),
      });
      segments.push(`[${assemblyInputs.length}:v]`);
      assemblyInputs.push(joinClip);
      start = handoff!.frames!;
    }
    if (start || beat.scene.frameCount > beat.frameCount) {
      trims.push(
        `[${index}:v]trim=start_frame=${start}:end_frame=${beat.frameCount},setpts=PTS-STARTPTS[tail${index}];`,
      );
      segments.push(`[tail${index}]`);
    } else segments.push(`[${index}:v]`);
  }
  const beatsMs = performance.now() - started;
  options.onProgress?.({
    stage: "assembly",
    completed: clips.length,
    total: selected.length,
  });
  const video = join(output, "passage.mp4");
  const concat =
    trims.join("") +
    segments.join("") +
    "concat=n=" +
    segments.length +
    ":v=1:a=0[whole];[whole]trim=start_frame=" +
    renderStart +
    ":end_frame=" +
    (renderStart + frameCount) +
    ",setpts=PTS-STARTPTS[v]";
  const mixedAudio = await renderPassageAudio(
    join(output, "mix.wav"),
    passage,
    narration,
    {
      range,
      soundEffects: options.soundEffects,
      signal: options.signal,
    },
  );
  const hasAudio = Boolean(mixedAudio);
  const audio = mixedAudio ? `;[${assemblyInputs.length}:a:0]anull[a]` : "";
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    ...assemblyInputs.flatMap((clip) => ["-i", clip.outputPath]),
    ...(mixedAudio ? ["-i", mixedAudio.path] : []),
    "-filter_complex",
    concat + audio,
    "-map",
    "[v]",
    ...(hasAudio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-frames:v",
    String(frameCount),
    "-t",
    String(frameCount / plan.fps),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    video,
  ]);
  const verified = await verifyVideo(
    video,
    frameCount,
    plan.fps,
    size,
    hasAudio,
    options.signal,
  );
  const slices = [];
  for (const original of plan.delivery) {
    if (original.start < range.start || original.end > range.end) continue;
    const shot = {
      ...original,
      start: original.start - range.start,
      end: original.end - range.start,
    };
    const path = join(output, "delivery", shot.id + ".mp4");
    const filter =
      "[0:v]trim=start_frame=" +
      shot.start +
      ":end_frame=" +
      shot.end +
      ",setpts=PTS-STARTPTS[v]";
    const trimAudio = hasAudio
      ? ";[0:a]atrim=start=" +
        shot.start / plan.fps +
        ":end=" +
        shot.end / plan.fps +
        ",asetpts=PTS-STARTPTS[a]"
      : "";
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      video,
      "-filter_complex",
      filter + trimAudio,
      "-map",
      "[v]",
      ...(hasAudio ? ["-map", "[a]", "-c:a", "aac"] : []),
      "-frames:v",
      String(shot.end - shot.start),
      "-t",
      String((shot.end - shot.start) / plan.fps),
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path,
    ]);
    slices.push({
      ...shot,
      ...(await verifyVideo(
        path,
        shot.end - shot.start,
        plan.fps,
        size,
        hasAudio,
        options.signal,
      )),
    });
  }
  const visibleBeats = selected.filter(
    (beat) => beat.end > range.start && beat.start < range.end,
  );
  const frames = visibleBeats.flatMap((beat) => {
    const start = Math.max(range.start, beat.start) - range.start,
      end = Math.min(range.end, beat.end) - range.start;
    return [start, Math.floor((start + end - 1) / 2), end - 1];
  });
  const thumbnailArea = 480 * 270;
  const thumbnailWidth = Math.round(
    Math.sqrt((thumbnailArea * size.width) / size.height),
  );
  const thumbnailHeight = Math.round(thumbnailArea / thumbnailWidth);
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    video,
    "-vf",
    "select='" +
      frames.map((frame) => "eq(n," + frame + ")").join("+") +
      `',scale=${thumbnailWidth}:${thumbnailHeight},tile=3x` +
      visibleBeats.length,
    "-frames:v",
    "1",
    join(output, "passage-motion.jpg"),
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    video,
    "-vf",
    "select='eq(n," + frames[1] + ")'",
    "-frames:v",
    "1",
    join(output, "passage.png"),
  ]);
  const report = {
    status: "local passage candidate",
    planSha256: passage.inputs.plan.sha256,
    fps: plan.fps,
    frameCount,
    sourceStartFrame,
    frameRange: range,
    cache: clips.map(({ key, reused, sha256 }, i) => ({
      beat: selected[i]!.id,
      key,
      reused,
      sha256,
    })),
    endFrameExclusive,
    narration: narration
      ? { sha256: plan.narration!.sha256, reference: plan.narration!.reference }
      : null,
    audio: mixedAudio ? { ...mixedAudio, path: undefined } : null,
    video: verified,
    slices,
    metrics: {
      preparationMs: passage.preparationMs,
      renderingMs: performance.now() - started,
      beatsMs,
      assemblyMs: performance.now() - started - beatsMs,
      humanPreparationMinutes: null,
      manualRepairs: null,
    },
    review:
      "Frame counts, dimensions, media decoding and narration identity verified. Comprehension, pacing and cost savings require separate review.",
  };
  await writePassageJson(join(output, "render-report.json"), report);
  return report;
}

export type PassageRenderOptions = {
  soundEffects?: boolean;
  cacheDirectory?: string;
  resume?: boolean;
  signal?: AbortSignal | undefined;
  range?: { start: number; end: number };
  onProgress?: (progress: {
    stage: string;
    beat?: string;
    completed: number;
    total: number;
  }) => void;
};

export async function renderStoryPassage(
  output: string,
  passage: PreparedPassage,
  narration?: string,
  options: PassageRenderOptions = {},
) {
  options.signal?.throwIfAborted();
  const first = passage.beats[0]?.scene;
  if (!first)
    passageError("empty-passage", "A passage needs at least one beat");
  for (const beat of passage.beats) {
    if (beat.scene.width !== first.width || beat.scene.height !== first.height)
      passageError(
        "mixed-format-passage",
        `Beat ${beat.id} has ${beat.scene.width}×${beat.scene.height}; expected ${first.width}×${first.height}`,
        { beat: beat.id },
      );
  }
  const range = options.range ?? { start: 0, end: passage.frameCount };
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end > passage.frameCount ||
    range.end <= range.start
  )
    throw new Error(
      "Preview range must be a nonempty half-open interval inside the passage",
    );
  if (narration)
    await verifyPassageNarration(passage, narration, options.signal);
  await verifyPassageAudioAssets(passage, undefined, options.signal);
  for (const beat of passage.beats) {
    await validatePreparedAssets(beat.scene, resolve("."));
    const prepared = JSON.parse(
      await readFile(join(output, "scenes", beat.id + ".json"), "utf8"),
    );
    if (JSON.stringify(prepared) !== JSON.stringify(beat.scene))
      throw new Error(
        "Prepared scene changed; prepare a fresh output directory",
      );
  }
  const runtime = await passageRuntimeIdentity(options.signal);
  const jobRuntime = await passageJobRuntimeIdentity(runtime, options.signal);
  const job = await acquirePassageJob(
    output,
    {
      plan: passage.inputs.plan.sha256,
      scenes: passage.beats.map((b) => passageBeatKey(b.scene, runtime)),
      narration: narration ? passage.plan.narration?.sha256 : null,
      audio: passage.audio,
      soundEffects: options.soundEffects !== false,
      range,
      runtime: jobRuntime,
    },
    options.resume ?? false,
  );
  const assembly = join(output, ".assembly-" + randomUUID());
  try {
    await mkdir(assembly);
    await mkdir(join(assembly, "delivery"));
    const report = await assembleStoryPassage(assembly, passage, narration, {
      ...options,
      range,
      cacheDirectory: resolve(
        options.cacheDirectory ?? "benchmarks/results/passage-cache",
      ),
      runtime,
      sceneDirectory: join(output, "scenes"),
      job,
    });
    const products = [
      "passage.mp4",
      "passage.png",
      "passage-motion.jpg",
      ...report.slices.map((s) => "delivery/" + s.id + ".mp4"),
    ];
    report.video.path = join(output, "passage.mp4");
    for (const slice of report.slices)
      slice.path = join(output, "delivery", slice.id + ".mp4");
    options.signal?.throwIfAborted();
    const stagedReport = join(assembly, "final-report.json");
    await writePassageJson(stagedReport, report);
    options.signal?.throwIfAborted();
    const completion = await job.stageCompletion(
      join(assembly, "complete-job.json"),
    );
    options.signal?.throwIfAborted();
    await publishArtifacts(
      [
        ...products.map((product) => ({
          staged: join(assembly, product),
          destination: join(output, product),
        })),
        {
          staged: stagedReport,
          destination: join(output, "render-report.json"),
        },
        completion,
      ],
      options.signal,
      { replaceExisting: options.resume ?? false },
    );
    return report;
  } catch (error) {
    const cause = options.signal?.aborted ? options.signal.reason : error;
    try {
      await job.finish(options.signal?.aborted ? "cancelled" : "failed", cause);
    } catch (cleanupError) {
      process.stderr.write(
        `Passage job cleanup failed: ${String(cleanupError)}\n`,
      );
    }
    throw cause;
  } finally {
    for (const cleanup of [
      () => rm(assembly, { recursive: true, force: true }),
      () => job.release(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        process.stderr.write(`Passage cleanup failed: ${String(error)}\n`);
      }
    }
  }
}
