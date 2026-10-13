import { mechanismPackHash } from "./pack-support.ts";
import type { MechanismNarratedCycle } from "@still-shift/scene-contract";
import type { CompositionQualityPolicy } from "@still-shift/renderer-core";

type SpeechCaption = NonNullable<
  CompositionQualityPolicy["speechCaptions"]
>[number];
/** Bind speech independently of equivalent defaults and unrelated picture annotations. */
export function mechanismCueSpeechSourceHash(
  document: MechanismNarratedCycle,
): string {
  return mechanismPackHash({
    schemaVersion: "mechanism-cue-speech-source-1",
    locale: document.locale,
    fps: document.output.fps,
    audioSha256: document.narration.sha256,
    sourceSamples: document.narration.sampleCount,
    cues: document.cues.map((cue) => ({
      id: cue.id,
      text: cue.text,
      startSample: cue.startSample,
      endSampleExclusive: cue.endSampleExclusive,
    })),
  });
}

/** Retain the compiler's exact PCM-to-frame grid and canonical source identity. */
export function mechanismCueSpeechCaption(
  document: MechanismNarratedCycle,
  cueIndex: number,
  layer: string,
  sourceSha256: string,
): Omit<SpeechCaption, "locale"> & {
  locale: MechanismNarratedCycle["locale"];
} {
  const cue = document.cues[cueIndex];
  if (!cue)
    throw new RangeError("Speech caption references an absent authored cue");
  const frame = (sample: number) =>
    Number((BigInt(sample) * BigInt(document.output.fps) + 47999n) / 48000n);
  return {
    id: "cue-caption-" + cueIndex,
    cueId: cue.id,
    purpose: "Display the authored caption for cue " + cue.id,
    layer,
    text: cue.text,
    start: frame(cue.startSample),
    end: frame(cue.endSampleExclusive),
    sourceSha256,
    audioLayer: "mechanism-cycle-narration",
    audioSha256: document.narration.sha256,
    locale: document.locale,
  };
}
