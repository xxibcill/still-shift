import { CompositionPcmClock } from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";

/** Media-only quantization: Q32 source frames / Q16 PCM samples, never CE0 clocks. */
export function mediaSamplePosition(
  value: number,
  fractionalBits: 16 | 32,
): number {
  const scale = 2 ** fractionalBits;
  if (
    !Number.isFinite(value) ||
    Math.abs(value) * scale > Number.MAX_SAFE_INTEGER
  )
    passageError(
      "comp-media-time",
      "Media sample time exceeds its exact quantization range",
      { path: "timeRemap" },
    );
  return Math.round(value * scale) / scale;
}

/** Visibility uses the PCM grid without changing authored frame/property clocks. */
export function audioVisibilitySample(frame: number, fps: number): number {
  const sample = (frame * 48000) / fps;
  // Far-out scope times remain invisible without introducing a quantizer error.
  return Math.abs(sample) * 65536 <= Number.MAX_SAFE_INTEGER
    ? mediaSamplePosition(sample, 16)
    : sample;
}

/** Cache authored scope boundaries without changing property or remapped clocks. */
export class NaturalAudioClock {
  private readonly origin: CompositionPcmClock;
  private readonly fps: number;
  private readonly boundaries = new Map<number, number>();

  constructor(fps: number, origin = new CompositionPcmClock()) {
    this.fps = fps;
    this.origin = origin;
  }

  place(frame: number, fps: number): NaturalAudioClock {
    return new NaturalAudioClock(fps, this.origin.place(frame, this.fps));
  }

  sampleAt(frame: number): number {
    let sample = this.boundaries.get(frame);
    if (sample === undefined) {
      sample = this.origin.place(frame, this.fps).sample;
      if (this.boundaries.size >= 128)
        this.boundaries.delete(this.boundaries.keys().next().value!);
      this.boundaries.set(frame, sample);
    }
    return sample;
  }
}
