import { z } from "zod";
import { compositionId, finite, sha256 } from "./primitives.ts";

export const COMPOSITION_AUDIO_DECODER_VERSION = "composition-audio-decoder-1";
export const COMPOSITION_AUDIO_MIXER_VERSION = "composition-audio-mixer-1";
export const COMPOSITION_AUDIO_WAVEFORM_POINTS = 131072;
const sampleCount = finite.int().min(1).max(172_800_000);
const waveform = z.object({
  sampleCount,
  /** Peak absolute amplitude across the actual channels in each equal-width bin. */
  peaks: z.array(finite.min(0)).min(1).max(1024),
  peakDbfs: finite.nullable(),
  /** Frames with at least one channel above full scale; no normalization is applied. */
  samplesAboveFullScale: finite.int().min(0).max(172_800_000),
});
export const CompositionPreparedAudioSchema = z
  .object({
    schemaVersion: z.literal("composition-prepared-audio-1"),
    decoderVersion: z.literal(COMPOSITION_AUDIO_DECODER_VERSION),
    mixerVersion: z.literal(COMPOSITION_AUDIO_MIXER_VERSION),
    sampleRate: z.literal(48000),
    channels: z.literal(2),
    sampleCount,
    resource: z
      .object({
        id: z.literal("__audio:mix"),
        sha256,
        byteLength: finite
          .int()
          .min(66)
          .max(172_800_000 * 8 + 58),
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            asset: compositionId,
            sourceHash: sha256,
            pcmSha256: sha256,
            byteLength: finite
              .int()
              .min(4)
              .max(172_800_000 * 8),
            sampleCount,
            channels: z.union([z.literal(1), z.literal(2)]),
            ffmpegIdentity: sha256,
          })
          .strict(),
      )
      .max(500),
    waveforms: z
      .object({
        source: z
          .array(
            waveform
              .extend({
                asset: compositionId,
                channels: z.union([z.literal(1), z.literal(2)]),
              })
              .strict(),
          )
          .max(500),
        processed: z
          .array(
            waveform
              .extend({
                key: z.string().min(1).max(2048),
                asset: compositionId,
              })
              .strict(),
          )
          .max(20000),
        mix: waveform.strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((audio, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      audio.resource.byteLength !== audio.sampleCount * 8 + 58 ||
      audio.waveforms.mix.sampleCount !== audio.sampleCount
    )
      fail(
        "Prepared audio must contain the complete stereo Float32 WAV and mix clock",
      );
    const sources = new Map(
      audio.sources.map((source) => [source.asset, source]),
    );
    if (
      sources.size !== audio.sources.length ||
      audio.waveforms.source.length !== sources.size ||
      new Set(audio.waveforms.source.map((wave) => wave.asset)).size !==
        sources.size
    )
      fail(
        "Prepared audio source identities and waveform bindings must be unique",
      );
    for (const source of audio.sources)
      if (source.byteLength !== source.sampleCount * source.channels * 4)
        fail("Prepared source PCM count differs");
    for (const wave of audio.waveforms.source) {
      const source = sources.get(wave.asset);
      if (
        !source ||
        source.sampleCount !== wave.sampleCount ||
        source.channels !== wave.channels
      )
        fail("Source waveform clock or channels differ");
    }
    if (
      new Set(audio.waveforms.processed.map((wave) => wave.key)).size !==
      audio.waveforms.processed.length
    )
      fail("Processed waveform routes must be unique");
    for (const wave of audio.waveforms.processed)
      if (!sources.has(wave.asset) || wave.sampleCount !== audio.sampleCount)
        fail("Processed waveform source or output clock differs");
    const waves = [
      ...audio.waveforms.source,
      ...audio.waveforms.processed,
      audio.waveforms.mix,
    ];
    if (
      waves.reduce((count, wave) => count + wave.peaks.length, 0) >
      COMPOSITION_AUDIO_WAVEFORM_POINTS
    )
      fail("Prepared audio waveform metadata exceeds its point bound");
    for (const wave of waves) {
      if (
        wave.peaks.length > wave.sampleCount ||
        wave.samplesAboveFullScale > wave.sampleCount
      )
        fail("Waveform metadata exceeds its PCM clock");
      const peak = Math.max(...wave.peaks);
      if (
        (peak === 0) !== (wave.peakDbfs === null) ||
        (peak > 0 && wave.peakDbfs !== 20 * Math.log10(peak))
      )
        fail("Waveform headroom differs from actual peaks");
    }
  });
export type CompositionPreparedAudio = z.infer<
  typeof CompositionPreparedAudioSchema
>;
