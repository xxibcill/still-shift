import { validateSoundtrackProject } from "@still-shift/scene-contract";
import { frameToSoundtrackSample } from "../../packages/renderer-core/src/soundtrack-edits.ts";
import type { CompiledStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";

/** A saved mix whose sound is absent from the passage's legacy audio plan. */
export function passageEventSoundtrack(
  passage: Pick<CompiledStoryPassage, "plan" | "beats" | "frameCount">,
  beatId: string,
  eventId: string,
) {
  const beat = passage.beats.find((beat) => beat.id === beatId)!;
  const event = beat.events!.find((event) => event.id === eventId)!;
  return validateSoundtrackProject({
    schemaVersion: "soundtrack-project-1",
    revision: 0,
    history: { undo: [], redo: [] },
    sampleRate: 48000,
    channels: 2,
    durationSamples: frameToSoundtrackSample(
      passage.frameCount,
      passage.plan.fps,
    ),
    channelConversion: "mono-duplicate-stereo-preserve",
    normalization: "none",
    tailPolicy: "retain-to-project-end",
    assets: [
      { id: "hit", path: "hit.wav", sha256: "sha256:" + "0".repeat(64) },
    ],
    tracks: [
      {
        id: "sfx",
        role: "sfx",
        output: "master",
        gainDb: 0,
        mute: false,
        solo: false,
        processors: [],
      },
    ],
    buses: [],
    master: { id: "master", gainDb: 0 },
    clips: [
      {
        id: "hit",
        asset: "hit",
        track: "sfx",
        sourceStartSample: 0,
        sourceEndSample: 12000,
        startSample: frameToSoundtrackSample(
          beat.start + event.start,
          passage.plan.fps,
        ),
        gainDb: 0,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        automation: { interpolation: "linear", points: [] },
        anchor: {
          beat: beatId,
          reference: { type: "event", id: eventId, edge: "start" },
          offsetSamples: 0,
        },
      },
    ],
  });
}
