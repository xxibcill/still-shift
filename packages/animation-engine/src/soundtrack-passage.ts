import type { SoundtrackProject } from "@still-shift/scene-contract";
import {
  validateSoundtrackProject,
  soundtrackFail,
} from "@still-shift/scene-contract";
import {
  frameToSoundtrackSample,
  resolveSoundtrackAnchors,
  validateSoundtrackNarration,
} from "@still-shift/renderer-core";
import { dirname, join } from "node:path";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { renderSoundtrackProject } from "./soundtrack-render.ts";
import { readSoundtrackProject } from "./soundtrack-project-io.ts";
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
    signal?: AbortSignal | undefined;
  } = {},
) {
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
  const frameRange = options.range ?? { start: 0, end: passage.frameCount };
  const rendered = await renderSoundtrackProject(
    projectPath,
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
    },
  };
}
