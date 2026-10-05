import {
  validateSoundtrackProject,
  type SoundtrackProject,
  type SoundtrackClip,
} from "../../../packages/scene-contract/src/soundtrack-project.ts";
/** Draw the authored amplitude envelope, including held steps and extended endpoints. */
function displayAutomation(clip: SoundtrackClip) {
  const length = clip.sourceEndSample - clip.sourceStartSample,
    points = clip.automation.points;
  const display: { sample: number; gain: number }[] = [];
  const first = points[0];
  if (!first)
    return [
      { sample: clip.startSample, gain: 1 },
      { sample: clip.startSample + length, gain: 1 },
    ];
  if (first.sample > 0)
    display.push({ sample: clip.startSample, gain: first.gain });
  for (const [index, point] of points.entries()) {
    if (index && clip.automation.interpolation === "hold")
      display.push({
        sample: clip.startSample + point.sample,
        gain: points[index - 1]!.gain,
      });
    display.push({ sample: clip.startSample + point.sample, gain: point.gain });
  }
  const last = points.at(-1)!;
  if (last.sample < length)
    display.push({ sample: clip.startSample + length, gain: last.gain });
  return display;
}
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
          automation: displayAutomation(clip),
        })),
    })),
  };
}

/**
 * An empty or partially typed number input reports "", which Number() reads as
 * 0; reject it so a cleared field never saves 0 dB or sample 0.
 */
export function soundtrackNumberField(value: string, label: string) {
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number))
    throw new Error(label + " needs a number; nothing was saved");
  return number;
}
export type SoundtrackRenderedOutput = {
  peaks: number[];
  peakDbfs: number | null;
  samplesAboveFullScale: number;
};
/** No limiter or normalization runs, so overs reach the rendered file unchanged. */
export function soundtrackHeadroom(mix: SoundtrackRenderedOutput) {
  if (mix.peakDbfs === null) return "rendered mix is silent";
  const peak = `${mix.peakDbfs > 0 ? "+" : ""}${mix.peakDbfs.toFixed(1)} dBFS`;
  return mix.samplesAboveFullScale
    ? `mix exceeds 0 dBFS on ${mix.samplesAboveFullScale} samples (peak ${peak}); integer delivery clips them, so lower gains`
    : `mix peak ${peak}`;
}
