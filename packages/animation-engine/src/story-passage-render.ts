import {
  preparePassageNativeAudio,
  renderPassageNativeAudio,
  type PassageNativeAudio,
} from "./passage-native-audio.ts";
import { frameToSoundtrackSample } from "@still-shift/renderer-core/soundtrack";
import { soundtrackFail } from "@still-shift/scene-contract";
import { renderPassageSoundtrack } from "./soundtrack-passage.ts";
import {
  readSoundtrackProject,
  verifySoundtrackSources,
  soundtrackChecksum,
} from "./soundtrack-project-io.ts";
import { soundtrackPython } from "./soundtrack-render.ts";
import {
  renderPassageAudio,
  verifyPassageAudioAssets,
} from "./passage-audio.ts";
import { isStoryTransition } from "../../renderer-core/src/story-transition.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { cachedStoryTransition } from "./story-transition-render.ts";
import {
  validatePassageCompositions,
  type PassageCompositions,
} from "./passage-compositions.ts";
import { compileStoryComposition } from "./composition-compile.ts";
import { renderComposition } from "./composition-render.ts";
import type { CompositionBackend } from "@still-shift/renderer-core";
import { randomUUID } from "node:crypto";
import {
  cachedPassageBeat,
  passageBeatKey,
  passageCompositionKey,
  passageJobRuntimeIdentity,
  passageRenderRuntime,
} from "./passage-cache.ts";
import type { RenderEnvironment } from "@still-shift/execution-runtime/render-browser";
import { acquirePassageJob } from "./passage-job.ts";
import assert from "node:assert/strict";
import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
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
  time_base?: string;
  duration_ts?: number;
  sample_rate?: string;
  channels?: number;
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
  exactAudioSamples?: number,
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
  if (exactAudioSamples !== undefined) {
    const stream = streams.find((stream) => stream.codec_type === "audio");
    assert.equal(stream?.sample_rate, "48000");
    assert.equal(stream?.channels, 2);
    assert.equal(stream?.time_base, "1/48000");
    assert.equal(
      stream?.duration_ts,
      exactAudioSamples,
      "Native passage AAC must retain the exact selected sample clock",
    );
  }
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
    nativeAudio?: PassageNativeAudio;
    soundtrackRevision?: number;
    soundtrackProjectSha256?: string;
    runtime: string;
    renderEnvironment: RenderEnvironment;
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
  const renderer = options.renderer ?? "legacy";
  const backend = options.backend ?? "canvas2d";
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
      key: options.compositions?.[beat.id]
        ? passageCompositionKey(
            options.compositions[beat.id]!,
            options.runtime,
            backend,
          )
        : passageBeatKey(beat.scene, options.runtime, renderer, backend),
      output: join(options.sceneDirectory, beat.id + ".mp4"),
      signal: options.signal,
      render: async (outputPath) => {
        if (renderer === "legacy")
          return new PreparedAnimationEngine().animate({
            scenePath: join(options.sceneDirectory, beat.id + ".json"),
            outputPath,
            signal: options.signal,
          });
        options.signal?.throwIfAborted();
        const composition =
          options.compositions?.[beat.id] ??
          (await compileStoryComposition(beat.scene, options.sceneDirectory));
        options.signal?.throwIfAborted();
        const compositionPath = outputPath + ".composition.json";
        // Prepared passage assets are absolute; the cached composition is independently inspectable.
        await writePassageJson(compositionPath, composition);
        return renderComposition({
          compositionPath,
          outputPath,
          backend,
          cacheDirectory: options.cacheDirectory,
          signal: options.signal,
        });
      },
      verify: (path) =>
        verifyVideo(
          path,
          beat.scene.frameCount,
          plan.fps,
          size,
          Boolean(
            options.nativeAudio?.masters.some(
              (master) => master.beat === beat.id,
            ),
          ),
          options.signal,
        ),
    });
    const native = options.compositions?.[beat.id];
    // The cache copy records its first render; this copy names this run's asset files.
    if (native)
      await replacePassageJson(
        join(options.sceneDirectory, beat.id + ".composition.json"),
        native,
      );
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
  const audioOptions = {
    range,
    soundEffects: options.soundEffects,
    signal: options.signal,
  };
  let mixedAudio;
  if (options.nativeAudio) {
    if (options.soundtrackProject) {
      const nativeMix = await renderPassageNativeAudio(
        join(output, "native.wav"),
        passage,
        options.nativeAudio,
        undefined,
        {
          signal: options.signal,
          cacheDirectory: options.cacheDirectory,
          masterGainDb: 0,
          stem: "sounds",
        },
      );
      const nativeNarration = await renderPassageNativeAudio(
        join(output, "native-narration.wav"),
        passage,
        options.nativeAudio,
        undefined,
        {
          signal: options.signal,
          cacheDirectory: options.cacheDirectory,
          masterGainDb: 0,
          stem: "narration",
        },
      );
      mixedAudio = await renderPassageSoundtrack(
        join(output, "mix.wav"),
        passage,
        options.soundtrackProject,
        {
          range,
          signal: options.signal,
          ...(options.soundtrackRevision !== undefined
            ? { expectedRevision: options.soundtrackRevision }
            : {}),
          nativeAudio: nativeMix,
          nativeNarration,
          ...(options.soundtrackProjectSha256
            ? { expectedProjectSha256: options.soundtrackProjectSha256 }
            : {}),
        },
      );
    } else {
      const legacy = await renderPassageAudio(
        join(output, "legacy.wav"),
        passage,
        narration,
        {
          soundEffects: options.soundEffects,
          signal: options.signal,
          narrationExclusions: options.nativeAudio.narrationExclusions,
          masterGainDb: 0,
        },
      );
      mixedAudio = await renderPassageNativeAudio(
        join(output, "mix.wav"),
        passage,
        options.nativeAudio,
        legacy?.path,
        {
          range,
          signal: options.signal,
          cacheDirectory: options.cacheDirectory,
        },
      );
    }
  } else
    mixedAudio = options.soundtrackProject
      ? await renderPassageSoundtrack(
          join(output, "mix.wav"),
          passage,
          options.soundtrackProject,
          {
            range,
            signal: options.signal,
            ...(options.soundtrackRevision !== undefined
              ? { expectedRevision: options.soundtrackRevision }
              : {}),
          },
        )
      : await renderPassageAudio(
          join(output, "mix.wav"),
          passage,
          narration,
          audioOptions,
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
    ...(options.nativeAudio
      ? [
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movie_timescale",
          "48000",
          "-use_editlist",
          "1",
        ]
      : []),
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
    options.nativeAudio
      ? frameToSoundtrackSample(frameCount, plan.fps)
      : undefined,
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
      ? options.nativeAudio
        ? `;[1:a]atrim=start_sample=${frameToSoundtrackSample(shot.start, plan.fps)}:end_sample=${frameToSoundtrackSample(shot.end, plan.fps)},asetpts=PTS-STARTPTS[a]`
        : ";[0:a]atrim=start=" +
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
      ...(options.nativeAudio && mixedAudio ? ["-i", mixedAudio.path] : []),
      "-filter_complex",
      filter + trimAudio,
      "-map",
      "[v]",
      ...(hasAudio ? ["-map", "[a]", "-c:a", "aac"] : []),
      ...(options.nativeAudio
        ? [
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movie_timescale",
            "48000",
            "-use_editlist",
            "1",
          ]
        : []),
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
        options.nativeAudio
          ? frameToSoundtrackSample(shot.end - shot.start, plan.fps)
          : undefined,
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
    renderer,
    ...(renderer === "composition" ? { backend } : {}),
    pictureSources: selected.map((beat) => ({
      beat: beat.id,
      authority: options.compositions?.[beat.id]
        ? "native-composition"
        : "story-template",
      composition: options.compositions?.[beat.id]?.id ?? null,
    })),
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
      renderEnvironment: options.renderEnvironment,
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

async function replacePassageJson(path: string, value: unknown) {
  const temporary = `${path}.write-${randomUUID()}`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export type PassageRenderOptions = {
  compositions?: PassageCompositions;
  renderer?: "legacy" | "composition";
  backend?: CompositionBackend;

  soundtrackProject?: string;
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
  if (
    options.soundtrackProject &&
    (narration || options.soundEffects === false)
  )
    soundtrackFail(
      "soundtrack-mode",
      "Choose a saved soundtrack or legacy narration/effect controls",
    );
  const soundtrackProjectSha256 = options.soundtrackProject
    ? await soundtrackChecksum(options.soundtrackProject)
    : undefined;
  const soundtrack = options.soundtrackProject
    ? await readSoundtrackProject(options.soundtrackProject)
    : undefined;
  const compositions = validatePassageCompositions(
    passage,
    options.compositions,
    soundtrack,
  );
  if (Object.keys(compositions).length && options.renderer !== "composition")
    passageError(
      "comp-passage-renderer",
      "Native beat files require renderer composition",
      { path: "renderer" },
    );
  options = { ...options, compositions };

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
  const cacheDirectory = resolve(
    options.cacheDirectory ?? "benchmarks/results/passage-cache",
  );
  const nativeAudio = await preparePassageNativeAudio(passage, compositions, {
    cacheDirectory,
    signal: options.signal,
    separateNarration: Boolean(options.soundtrackProject),
  });
  const { identity: runtime, renderEnvironment } = await passageRenderRuntime(
    options.signal,
  );
  const jobRuntime = await passageJobRuntimeIdentity(runtime, options.signal);
  if (soundtrack) {
    await verifySoundtrackSources(soundtrack, options.soundtrackProject!);
    if (
      (await soundtrackChecksum(options.soundtrackProject!)) !==
      soundtrackProjectSha256
    )
      soundtrackFail(
        "revision-conflict",
        "Soundtrack changed during passage preparation; reload and retry",
      );
  }
  const soundtrackIdentity = soundtrack
    ? {
        project: soundtrack,
        worker: await soundtrackChecksum(
          fileURLToPath(new URL("./soundtrack-worker.py", import.meta.url)),
        ),
        python: soundtrackPython(),
        packages: (
          await runProcess(
            soundtrackPython(),
            [
              "-c",
              "import json,platform; from importlib.metadata import version; print(json.dumps([platform.python_version(),*[version(x) for x in ['dawdreamer','numpy','scipy']]]))",
            ],
            { signal: options.signal },
          )
        ).stdout.trim(),
      }
    : undefined;
  const job = await acquirePassageJob(
    output,
    {
      plan: passage.inputs.plan.sha256,
      scenes: passage.beats.map((b) =>
        compositions[b.id]
          ? passageCompositionKey(compositions[b.id]!, runtime, options.backend)
          : passageBeatKey(b.scene, runtime, options.renderer, options.backend),
      ),
      narration: narration ? passage.plan.narration?.sha256 : null,
      audio: passage.audio,
      soundEffects: options.soundEffects !== false,
      renderer: options.renderer ?? "legacy",
      ...(options.renderer === "composition"
        ? { backend: options.backend ?? "canvas2d" }
        : {}),

      ...(soundtrackIdentity ? { soundtrack: soundtrackIdentity } : {}),
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
      ...(nativeAudio ? { nativeAudio } : {}),
      ...(soundtrack ? { soundtrackRevision: soundtrack.revision } : {}),
      ...(soundtrackProjectSha256 ? { soundtrackProjectSha256 } : {}),
      range,
      cacheDirectory,
      runtime,
      renderEnvironment,
      sceneDirectory: join(output, "scenes"),
      job,
    });
    await nativeAudio?.verify();
    if (soundtrack) {
      if (
        (await soundtrackChecksum(options.soundtrackProject!)) !==
        soundtrackProjectSha256
      )
        soundtrackFail(
          "revision-conflict",
          "Soundtrack changed before passage publication; reload and retry",
        );
      await verifySoundtrackSources(soundtrack, options.soundtrackProject!);
    }
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
