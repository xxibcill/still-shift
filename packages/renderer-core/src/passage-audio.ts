import type {
  PassageAudio,
  PassageSound,
} from "../../scene-contract/src/passage-audio.ts";
import { passageError } from "./passage-diagnostics.ts";

type TimedBeat = {
  id: string;
  start: number;
  cues: readonly { id: string; frame: number }[];
  events: readonly { id: string; start: number; end: number }[];
};
export type ResolvedSound = PassageSound & { start: number; end: number };
export type CompiledPassageAudio = Omit<PassageAudio, "sounds"> & {
  sounds: ResolvedSound[];
};

/** Resolve only after visual event bindings and handoffs have been compiled. */
export function compilePassageAudio(
  audio: PassageAudio | undefined,
  beats: readonly TimedBeat[],
  frameCount: number,
): CompiledPassageAudio | undefined {
  if (!audio) return undefined;
  const sounds = audio.sounds.map((sound, index) => {
    const context = {
      beat: sound.beat,
      event: sound.id,
      path: `audio.sounds.${index}`,
    };
    const beat = beats.find((b) => b.id === sound.beat);
    if (!beat)
      passageError("sound-beat", "Unknown sound beat: " + sound.beat, context);
    if (!audio.assets.some((asset) => asset.id === sound.asset))
      passageError(
        "sound-asset",
        "Unknown sound asset: " + sound.asset,
        context,
      );
    const anchor = sound.anchor;
    const at =
      anchor.type === "cue"
        ? beat.cues.find((cue) => cue.id === anchor.id)?.frame
        : beat.events.find((event) => event.id === anchor.id)?.[anchor.edge];
    if (at === undefined)
      passageError(
        "sound-anchor",
        "Unknown sound " + anchor.type + ": " + anchor.id,
        context,
      );
    const start = beat.start + at + sound.offset,
      end = start + sound.durationFrames;
    if (start < 0 || end > frameCount)
      passageError(
        "sound-range",
        `Sound ${sound.id} falls outside the passage (${start}–${end})`,
        context,
      );
    return { ...sound, start, end };
  });
  return { ...audio, sounds };
}

export const decibelsToGain = (db: number) => 10 ** (db / 20);
export function soundEnvelope(sound: PassageSound, elapsedFrames: number) {
  if (elapsedFrames < 0 || elapsedFrames > sound.durationFrames) return 0;
  const attack = sound.fadeInFrames
    ? Math.min(1, elapsedFrames / sound.fadeInFrames)
    : 1;
  const release = sound.fadeOutFrames
    ? Math.min(1, (sound.durationFrames - elapsedFrames) / sound.fadeOutFrames)
    : 1;
  return Math.min(attack, release);
}

/** Includes the current gain when playback begins halfway through a fade. */
export function soundEnvelopePoints(
  sound: PassageSound,
  elapsedFrames: number,
) {
  return [
    ...new Set([
      elapsedFrames,
      sound.fadeInFrames,
      sound.durationFrames - sound.fadeOutFrames,
      sound.durationFrames,
    ]),
  ]
    .filter((frame) => frame >= elapsedFrames)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, gain: soundEnvelope(sound, frame) }));
}
