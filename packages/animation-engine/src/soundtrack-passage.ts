import type { SoundtrackProject } from "@still-shift/scene-contract";
import {
  validateSoundtrackProject,
  soundtrackFail,
} from "@still-shift/scene-contract";
import {
  frameToSoundtrackSample,
  resolveSoundtrackAnchors,
  validateSoundtrackNarration,
} from "@still-shift/renderer-core/soundtrack";
import { dirname, join, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { renderSoundtrackProject } from "./soundtrack-render.ts";
import {
  readSoundtrackProject,
  serializeSoundtrackProject,
  soundtrackChecksum,
  verifySoundtrackSources,
} from "./soundtrack-project-io.ts";
import { renderPassageAudio } from "./passage-audio.ts";
import type { renderPassageNativeAudio } from "./passage-native-audio.ts";
import type { PreparedPassage } from "./story-passage-io.ts";
/** Explicit authoring adapter; loading/exporting an old plan never calls this. */
export function soundtrackFromPassage(
  passage: PreparedPassage,
  narration?: { path: string; sha256: string },
): SoundtrackProject {
  const sample = (frame: number) =>
    frameToSoundtrackSample(frame, passage.plan.fps);
  const audio = passage.audio;
  const project: SoundtrackProject = {
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    history: { undo: [], redo: [] },
    sampleRate: 48000,
    channels: 2,
    durationSamples: sample(passage.frameCount),
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets:
      audio?.assets.map((a) => ({
        id: a.id,
        path: a.path,
        sha256: a.sha256,
      })) ?? [],
    clips: [],
    tracks: [],
    buses: [],
    master: { id: "master", gainDb: audio?.masterGainDb ?? 0 },
  };
  if (narration) {
    if (
      !passage.plan.narration ||
      narration.sha256.replace(/^sha256:/, "") !== passage.plan.narration.sha256
    )
      soundtrackFail(
        "narration-identity",
        "Narration must match the plan authority",
      );
    project.assets.push({
      id: "narration-source",
      path: narration.path,
      sha256: "sha256:" + passage.plan.narration.sha256,
    });
    project.tracks.push({
      id: "narration",
      role: "narration",
      output: "master",
      gainDb: audio?.narrationGainDb ?? 0,
      mute: false,
      solo: false,
      processors: [],
    });
    project.clips.push({
      id: "narration-clip",
      asset: "narration-source",
      track: "narration",
      sourceStartSample: sample(passage.plan.sourceStartFrame),
      sourceEndSample: sample(passage.endFrameExclusive),
      startSample: 0,
      gainDb: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear", points: [] },
    });
  }
  if (audio?.sounds.length)
    project.tracks.push({
      id: "effects",
      role: "sfx",
      output: "master",
      gainDb: 0,
      mute: false,
      solo: false,
      processors: [],
    });
  for (const sound of audio?.sounds ?? [])
    project.clips.push({
      id: sound.id,
      asset: sound.asset,
      track: "effects",
      sourceStartSample: sample(sound.sourceStartFrame),
      sourceEndSample: sample(sound.sourceStartFrame + sound.durationFrames),
      startSample: sample(sound.start),
      gainDb: sound.gainDb,
      fadeInSamples: sample(sound.fadeInFrames),
      fadeOutSamples: sample(sound.fadeOutFrames),
      automation: { interpolation: "linear", points: [] },
      anchor: {
        beat: sound.beat,
        reference: sound.anchor,
        offsetSamples: sample(sound.offset),
      },
    });
  return validateSoundtrackProject(project);
}
export async function renderPassageSoundtrack(
  output: string,
  passage: PreparedPassage,
  projectPath: string,
  options: {
    range?: { start: number; end: number };
    expectedRevision?: number;
    expectedProjectSha256?: string;
    signal?: AbortSignal | undefined;
    nativeAudio?: Awaited<ReturnType<typeof renderPassageNativeAudio>>;
    nativeNarration?: Awaited<ReturnType<typeof renderPassageNativeAudio>>;
  } = {},
) {
  const originalHash = await soundtrackChecksum(projectPath);
  if (
    options.expectedProjectSha256 !== undefined &&
    originalHash !== options.expectedProjectSha256
  )
    soundtrackFail(
      "revision-conflict",
      "Saved soundtrack changed during picture rendering; reload and retry",
    );
  const project = resolveSoundtrackAnchors(
    await readSoundtrackProject(projectPath),
    { ...passage, fps: passage.plan.fps },
  );
  if (
    options.expectedRevision !== undefined &&
    project.revision !== options.expectedRevision
  )
    soundtrackFail(
      "revision-conflict",
      "Soundtrack changed during picture rendering; reload and retry",
      { expected: options.expectedRevision, actual: project.revision },
    );
  validateSoundtrackNarration(project, {
    fps: passage.plan.fps,
    sourceStartFrame: passage.plan.sourceStartFrame,
    endFrameExclusive: passage.endFrameExclusive,
    ...(passage.plan.narration
      ? { sha256: passage.plan.narration.sha256 }
      : {}),
  });
  await verifySoundtrackSources(project, projectPath);
  let renderPath = projectPath;
  if (options.nativeAudio) {
    const native = options.nativeAudio;
    if (
      native.wholeSampleCount !== project.durationSamples ||
      native.sampleCount !== project.durationSamples
    )
      soundtrackFail(
        "native-interval",
        "Native audio must cover the complete saved soundtrack before master processing",
      );
    const derived = structuredClone(project);
    derived.history = { undo: [], redo: [] };
    for (const asset of derived.assets)
      asset.path = resolve(dirname(projectPath), asset.path);
    const voice = derived.clips.find(
      (clip) =>
        derived.tracks.find((track) => track.id === clip.track)?.role ===
        "narration",
    );
    if (voice && native.narrationExclusions.length) {
      const asset = derived.assets.find((asset) => asset.id === voice.asset)!;
      const voicePassage = { ...passage };
      voicePassage.audio = undefined;
      const masked = await renderPassageAudio(
        join(dirname(output), "native-voice-remainder.wav"),
        voicePassage,
        asset.path,
        {
          signal: options.signal,
          narrationExclusions: native.narrationExclusions,
          masterGainDb: 0,
        },
      );
      if (masked) {
        const id = unusedSoundtrackId(derived, "native-voice-remainder");
        derived.assets.push({
          id,
          path: masked.path,
          sha256: await soundtrackChecksum(masked.path),
        });
        voice.asset = id;
        voice.sourceStartSample = 0;
        voice.sourceEndSample = project.durationSamples;
      } else derived.clips = derived.clips.filter((clip) => clip !== voice);
    }
    if (native.narrationExclusions.length) {
      const narration = options.nativeNarration;
      if (!narration || narration.sampleCount !== project.durationSamples)
        soundtrackFail(
          "native-narration-stem",
          "Separate complete native narration is required for saved narration DSP and ducking",
        );
      const id = unusedSoundtrackId(derived, "native-narration");
      const existingTrack = derived.tracks.find(
        (track) => track.role === "narration",
      );
      if (!existingTrack)
        derived.tracks.push({
          id,
          role: "narration",
          output: "master",
          gainDb: 0,
          mute: false,
          solo: false,
          processors: [],
        });
      derived.assets.push({
        id,
        path: narration.path,
        sha256: narration.sha256,
      });
      derived.clips.push({
        id,
        asset: id,
        track: existingTrack?.id ?? id,
        sourceStartSample: 0,
        sourceEndSample: project.durationSamples,
        startSample: 0,
        gainDb: 0,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        automation: { interpolation: "linear", points: [] },
      });
    }
    const id = unusedSoundtrackId(derived, "native-passage");
    derived.assets.push({ id, path: native.path, sha256: native.sha256 });
    derived.tracks.push({
      id,
      role: "sfx",
      output: "master",
      gainDb: 0,
      mute: false,
      solo: false,
      processors: [],
    });
    derived.clips.push({
      id,
      asset: id,
      track: id,
      sourceStartSample: 0,
      sourceEndSample: project.durationSamples,
      startSample: 0,
      gainDb: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear", points: [] },
    });
    renderPath = join(dirname(output), "native-soundtrack-project.json");
    await writeFile(
      renderPath,
      serializeSoundtrackProject(validateSoundtrackProject(derived)),
      { flag: "wx" },
    );
  }
  const frameRange = options.range ?? { start: 0, end: passage.frameCount };
  const rendered = await renderSoundtrackProject(
    renderPath,
    join(dirname(output), "soundtrack"),
    {
      signal: options.signal,
      range: {
        start: frameToSoundtrackSample(frameRange.start, passage.plan.fps),
        end: frameToSoundtrackSample(frameRange.end, passage.plan.fps),
      },
      expectedRevision: project.revision,
    },
  );
  if ((await soundtrackChecksum(projectPath)) !== originalHash)
    soundtrackFail(
      "revision-conflict",
      "Saved soundtrack changed during native passage rendering; reload and retry",
    );
  await verifySoundtrackSources(project, projectPath);
  await runProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-n",
      "-i",
      join(rendered.output, "audio/mix.wav"),
      "-c:a",
      "pcm_f32le",
      output,
    ],
    { signal: options.signal },
  );
  return {
    path: output,
    sampleRate: 48000,
    frameRange,
    schemaVersion: "soundtrack-project-1" as const,
    assets: project.assets,
    sounds: [],
    soundtrack: {
      project: projectPath,
      revision: project.revision,
      identity: rendered.identity,
      ...(options.nativeAudio
        ? {
            nativeAudio: { ...options.nativeAudio, path: undefined },
            ...(options.nativeNarration
              ? {
                  nativeNarration: {
                    ...options.nativeNarration,
                    path: undefined,
                  },
                }
              : {}),
            originalProjectSha256: originalHash,
          }
        : {}),
    },
  };
}

function unusedSoundtrackId(project: SoundtrackProject, prefix: string) {
  const ids = new Set(
    [
      ...project.assets,
      ...project.tracks,
      ...project.clips,
      ...project.buses,
    ].map((value) => value.id),
  );
  let id = prefix;
  for (let index = 1; ids.has(id); index++) id = `${prefix}-${index}`;
  return id;
}
