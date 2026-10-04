import {
  validateSoundtrackProject,
  type SoundtrackProject,
} from "../../../packages/scene-contract/src/soundtrack-project.ts";
/** Read-only projection. Every edit is sent to the shared revision-checked API. */
export function soundtrackTimelineModel(
  input: SoundtrackProject,
  waveforms: Record<string, { peaks: number[] }> = {},
) {
  const project = validateSoundtrackProject(input);
  return {
    revision: project.revision,
    durationSeconds: project.durationSamples / project.sampleRate,
    undo: project.history.undo.length > 0,
    redo: project.history.redo.length > 0,
    tracks: project.tracks.map((track) => ({
      ...track,
      peaks: waveforms[track.id]?.peaks ?? [],
      clips: project.clips
        .filter((c) => c.track === track.id)
        .map((clip) => ({
          ...clip,
          leftPercent: (clip.startSample / project.durationSamples) * 100,
          widthPercent:
            ((clip.sourceEndSample - clip.sourceStartSample) /
              project.durationSamples) *
            100,
          automation: clip.automation.points.map((point) => ({
            sample: clip.startSample + point.sample,
            gain: point.gain,
          })),
        })),
    })),
  };
}
