import { z } from "zod";
import { compositionId, finite, sha256 } from "./primitives.ts";

/** Source rates are exact fractions; semantic validation requires reduced form. */
export const CompositionMediaRateSchema = z
  .object({
    numerator: finite.int().min(1).max(1_000_000),
    denominator: finite.int().min(1).max(100_000),
  })
  .strict();

/** Supported SDR source metadata, using ffprobe's names and values. */
export const CompositionMediaColorSchema = z
  .object({
    primaries: z.literal("bt709"),
    transfer: z.enum(["bt709", "iec61966-2-1"]),
    matrix: z.enum(["bt709", "gbr"]),
    range: z.enum(["tv", "pc"]),
  })
  .strict();

const identity = {
  id: compositionId,
  path: z.string().min(1).max(1024),
  sha256,
};
const visual = {
  ...identity,
  width: finite.int().min(1).max(32768),
  height: finite.int().min(1).max(32768),
  frameCount: finite.int().min(1).max(864_000),
  frameRate: CompositionMediaRateSchema,
  color: CompositionMediaColorSchema,
};

export const CompositionVideoAssetSchema = z
  .object({ ...visual, type: z.literal("video") })
  .strict();

export const CompositionSequenceAssetSchema = z
  .object({
    ...visual,
    type: z.literal("sequence"),
    /** path names the numbered PNG pattern; sha256 pins this external manifest. */
    manifestPath: z.string().min(1).max(1024),
    firstFrame: finite.int().min(0).max(1_000_000),
  })
  .strict();

/** The count/rate describe actual decoded PCM, before mono duplication to stereo. */
export const CompositionAudioAssetSchema = z
  .object({
    ...identity,
    type: z.literal("audio"),
    sampleRate: z.literal(48000),
    sampleCount: finite.int().min(1).max(172_800_000),
    channels: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();

export const CompositionSequenceManifestSchema = z
  .object({
    schemaVersion: z.literal("composition-sequence-1"),
    /** Ordered source hashes; filenames come only from the authored pattern. */
    frames: z.array(sha256).min(1).max(864_000),
  })
  .strict();

export const CompositionMediaLimitsSchema = z
  .object({
    maxDurationSeconds: finite.min(1).max(3600).optional(),
    maxWidth: finite.int().min(16).max(32768).optional(),
    maxHeight: finite.int().min(16).max(32768).optional(),
    decodedCacheBytes: finite
      .int()
      .min(4)
      .max(2 ** 40)
      .optional(),
    decodedFrameBytes: finite
      .int()
      .min(4)
      .max(512 * 1024 * 1024)
      .optional(),
    audioWorkingBytes: finite
      .int()
      .min(8)
      .max(2 ** 31)
      .optional(),
  })
  .strict();

export const COMPOSITION_MEDIA_DEFAULT_LIMITS = {
  maxDurationSeconds: 600,
  maxWidth: 8192,
  maxHeight: 8192,
  decodedCacheBytes: 8 * 1024 ** 3,
  decodedFrameBytes: 128 * 1024 ** 2,
  audioWorkingBytes: 512 * 1024 ** 2,
} as const;

export type CompositionMediaRate = z.infer<typeof CompositionMediaRateSchema>;
export type CompositionMediaColor = z.infer<typeof CompositionMediaColorSchema>;
export type CompositionMediaLimits = z.infer<
  typeof CompositionMediaLimitsSchema
>;
export type CompositionVisualMediaAsset =
  | z.infer<typeof CompositionVideoAssetSchema>
  | z.infer<typeof CompositionSequenceAssetSchema>;

export function resolveCompositionMediaLimits(
  limits?: CompositionMediaLimits,
): Record<keyof typeof COMPOSITION_MEDIA_DEFAULT_LIMITS, number> {
  return {
    maxDurationSeconds:
      limits?.maxDurationSeconds ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.maxDurationSeconds,
    maxWidth: limits?.maxWidth ?? COMPOSITION_MEDIA_DEFAULT_LIMITS.maxWidth,
    maxHeight: limits?.maxHeight ?? COMPOSITION_MEDIA_DEFAULT_LIMITS.maxHeight,
    decodedCacheBytes:
      limits?.decodedCacheBytes ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.decodedCacheBytes,
    decodedFrameBytes:
      limits?.decodedFrameBytes ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.decodedFrameBytes,
    audioWorkingBytes:
      limits?.audioWorkingBytes ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.audioWorkingBytes,
  };
}

/** Reserved namespace cannot collide with authored asset IDs (which start with a letter). */
export const compositionMediaFrameId = (asset: string, frame: number) =>
  `__media:${asset}:${frame}`;
