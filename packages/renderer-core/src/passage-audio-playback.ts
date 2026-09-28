import type { CompiledStoryPassage } from "./story-passage.ts";
import { decibelsToGain, soundEnvelopePoints } from "./passage-audio.ts";

/** Schedule voice and effects against the same audio clock, including partial clips. */
export function schedulePassageAudio(
  context: BaseAudioContext,
  passage: CompiledStoryPassage,
  buffers: ReadonlyMap<string, AudioBuffer>,
  narration: AudioBuffer | undefined,
  options: { frame: number; when: number; soundEffects?: boolean },
) {
  if (
    !Number.isInteger(options.frame) ||
    options.frame < 0 ||
    options.frame >= passage.frameCount ||
    !Number.isFinite(options.when) ||
    options.when < 0
  )
    throw new Error(
      "Playback must start at a frame inside the passage and a valid audio time",
    );
  if (options.soundEffects !== false)
    for (const sound of passage.audio?.sounds ?? [])
      if (sound.end > options.frame && !buffers.has(sound.asset))
        throw new Error("Sound is not loaded: " + sound.asset);
  const fps = passage.plan.fps,
    sources: AudioBufferSourceNode[] = [],
    gains: GainNode[] = [];
  const master = context.createGain();
  master.gain.value = decibelsToGain(passage.audio?.masterGainDb ?? 0);
  master.connect(context.destination);
  gains.push(master);
  const play = (
    buffer: AudioBuffer,
    gain: GainNode,
    when: number,
    offset: number,
    duration: number,
  ) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(master);
    gains.push(gain);
    sources.push(source);
    source.start(when, offset, duration);
  };
  if (narration) {
    const gain = context.createGain();
    gain.gain.value = decibelsToGain(passage.audio?.narrationGainDb ?? 0);
    play(
      narration,
      gain,
      options.when,
      (passage.plan.sourceStartFrame + options.frame) / fps,
      (passage.frameCount - options.frame) / fps,
    );
  }
  if (options.soundEffects !== false)
    for (const sound of passage.audio?.sounds ?? []) {
      if (sound.end <= options.frame) continue;
      const buffer = buffers.get(sound.asset)!;
      const elapsed = Math.max(0, options.frame - sound.start);
      const when =
        options.when + Math.max(0, sound.start - options.frame) / fps;
      const gain = context.createGain(),
        level = decibelsToGain(sound.gainDb);
      const points = soundEnvelopePoints(sound, elapsed);
      gain.gain.setValueAtTime(points[0]!.gain * level, when);
      for (const point of points.slice(1))
        gain.gain.linearRampToValueAtTime(
          point.gain * level,
          when + (point.frame - elapsed) / fps,
        );
      play(
        buffer,
        gain,
        when,
        (sound.sourceStartFrame + elapsed) / fps,
        (sound.durationFrames - elapsed) / fps,
      );
    }
  return {
    stop() {
      for (const source of sources) {
        source.stop();
        source.disconnect();
      }
      for (const gain of gains) gain.disconnect();
    },
  };
}
