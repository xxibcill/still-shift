import { z } from "zod";
import { compositionId, finite, sha256 } from "./primitives.ts";

/** Source rates are exact fractions; semantic validation requires reduced form. */
export const CompositionMediaRateSchema = z
  .object({
    numerator: finite.int().min(1).max(1_000_000),
    denominator: finite.int().min(1).max(100_000),
  })
  .strict();

/**
 * CG7: camera encodings an author can declare (`color.encoding`), as
 * `@still-shift/color-science` input transform ids. Metadata rarely names a
 * log curve, so the author states it. Only `validated` transforms run; the
 * others are listed so a declaration of one is refused with its reason, not
 * read as an unknown value. A unit test holds both lists equal to the
 * color-science registry.
 */
export const COMPOSITION_CAMERA_ENCODINGS = [
  "arri-logc3-awg3",
  "arri-logc4-awg4",
  "sony-slog3-sgamut3",
  "sony-slog3-sgamut3-cine",
  "panasonic-vlog-vgamut",
  "red-log3g10-rwg",
  "canon-log2-cinema-gamut",
  "canon-log3-cinema-gamut",
  "apple-log-bt2020",
] as const;
export const COMPOSITION_UNAVAILABLE_CAMERA_ENCODINGS = {
  "arri-logc3-other-ei":
    "Only EI 800 has CG0 vectors; other EIs use different curve constants.",
  "bmd-film-gen5-wide-gamut":
    "No independent end-to-end reference, and the gamut's white is not D65.",
  "dji-dlog-dgamut": "No independent end-to-end reference.",
  "fujifilm-flog-fgamut": "No independent end-to-end reference.",
  "nikon-nlog-ngamut": "No independent end-to-end reference.",
  "sony-slog2": "No reference vectors.",
  "canon-log": "No reference vectors.",
} as const;
export type CompositionCameraEncoding =
  (typeof COMPOSITION_CAMERA_ENCODINGS)[number];

/**
 * Source color metadata, using ffprobe's names and values. A legacy
 * composition accepts the SDR set only (`COMPOSITION_LEGACY_MEDIA_COLOR`):
 * BT.709 primaries, BT.709 or sRGB transfer, BT.709 YUV, `smpte170m` (the
 * BT.601 YUV matrix, Kr 0.299, Kb 0.114, used by some generators with BT.709
 * primaries and an sRGB transfer) or RGB. A color-managed composition (CG7)
 * also accepts BT.2020 and P3-D65 (`smpte432`) primaries, the BT.2020 SDR
 * transfer (`bt2020-10`, `bt2020-12`: the BT.709 curve), PQ (`smpte2084`)
 * and HLG (`arib-std-b67`), the BT.2020 matrix, untagged (`unspecified`)
 * primaries and transfer, and an author-declared camera `encoding`.
 */
export const CompositionMediaColorSchema = z
  .object({
    primaries: z.enum(["bt709", "bt2020", "smpte432", "unspecified"]),
    transfer: z.enum([
      "bt709",
      "iec61966-2-1",
      "bt2020-10",
      "bt2020-12",
      "smpte2084",
      "arib-std-b67",
      "unspecified",
    ]),
    matrix: z.enum(["bt709", "smpte170m", "bt2020nc", "gbr"]),
    range: z.enum(["tv", "pc"]),
    encoding: z
      .enum([
        ...COMPOSITION_CAMERA_ENCODINGS,
        ...(Object.keys(COMPOSITION_UNAVAILABLE_CAMERA_ENCODINGS) as [
          keyof typeof COMPOSITION_UNAVAILABLE_CAMERA_ENCODINGS,
        ]),
      ])
      .optional(),
  })
  .strict();

/** The SDR color metadata a composition without color management accepts. */
export const COMPOSITION_LEGACY_MEDIA_COLOR = {
  primaries: ["bt709"],
  transfer: ["bt709", "iec61966-2-1"],
  matrix: ["bt709", "smpte170m", "gbr"],
} as const;
/** Whether a descriptor is in the legacy SDR set (no CG7 value, no encoding). */
export const isLegacyMediaColor = (color: CompositionMediaColor) =>
  color.encoding === undefined &&
  (COMPOSITION_LEGACY_MEDIA_COLOR.primaries as readonly string[]).includes(
    color.primaries,
  ) &&
  (COMPOSITION_LEGACY_MEDIA_COLOR.transfer as readonly string[]).includes(
    color.transfer,
  ) &&
  (COMPOSITION_LEGACY_MEDIA_COLOR.matrix as readonly string[]).includes(
    color.matrix,
  );

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
    decodedTextureBytes: finite
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
  decodedTextureBytes: 128 * 1024 ** 2,
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
    decodedTextureBytes:
      limits?.decodedTextureBytes ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.decodedTextureBytes,
    audioWorkingBytes:
      limits?.audioWorkingBytes ??
      COMPOSITION_MEDIA_DEFAULT_LIMITS.audioWorkingBytes,
  };
}

/** Reserved namespace cannot collide with authored asset IDs (which start with a letter). */
export const compositionMediaFrameId = (asset: string, frame: number) =>
  `__media:${asset}:${frame}`;

/**
 * Captured prepared frames are separate from editable source descriptors.
 * Decoder 3 (D-colour, "Match players") uses SDR code values as sRGB with no
 * transfer conversion; decoder 2 mapped BT.709 through the inverse OETF.
 */
export const COMPOSITION_MEDIA_DECODER_VERSION =
  "composition-media-decoder-3" as const;
/**
 * CG7: prepared frames of video layers in a color-managed composition:
 * canonical 16-bit RGBA PNGs (every row filter 0, no color chunks) of
 * **encoded** source RGB: range and matrix applied in float64 from the
 * published equations (FFmpeg only upsamples chroma at the native depth),
 * transfer and gamut not. A camera encoding reads Y′CbCr with full-range
 * equations (the CG0 camera convention). Legacy frames keep
 * COMPOSITION_MEDIA_DECODER_VERSION.
 */
export const COMPOSITION_MEDIA_SCENE_DECODER_VERSION =
  "composition-media-decoder-scene-1";
/**
 * CG7 scene frames store encoded RGB v as 16-bit w = round((v − low) /
 * (high − low) · 65535) over [−0.25, 1.25], so values a Y′CbCr matrix puts
 * outside 0–1 survive, and 10- and 12-bit codes round-trip exactly (step
 * 2.3e-5, under half a 12-bit code). Alpha is 65535.
 */
export const COMPOSITION_SCENE_SAMPLE_RANGE = [-0.25, 1.25] as const;
export const compositionSceneSample = (w: number) =>
  COMPOSITION_SCENE_SAMPLE_RANGE[0] +
  (w / 65535) *
    (COMPOSITION_SCENE_SAMPLE_RANGE[1] - COMPOSITION_SCENE_SAMPLE_RANGE[0]);
export const CompositionPreparedMediaFrameSchema = z
  .object({
    id: z.string().min(1).max(256),
    asset: compositionId,
    sourceHash: sha256,
    ordinal: finite.int().min(0).max(863999),
    sha256,
    width: finite.int().min(1).max(32768),
    height: finite.int().min(1).max(32768),
    byteLength: finite
      .int()
      .min(1)
      .max(2 ** 32),
  })
  .strict();
export const CompositionPreparedMediaSchema = z
  .object({
    schemaVersion: z.literal("composition-prepared-media-1"),
    decoderVersion: z.enum([
      COMPOSITION_MEDIA_DECODER_VERSION,
      COMPOSITION_MEDIA_SCENE_DECODER_VERSION,
    ]),
    ffmpegIdentities: z.array(sha256).max(1024),
    frames: z.array(CompositionPreparedMediaFrameSchema).max(131072),
  })
  .strict();
export type CompositionPreparedMedia = z.infer<
  typeof CompositionPreparedMediaSchema
>;
export type CompositionPreparedMediaFrame = z.infer<
  typeof CompositionPreparedMediaFrameSchema
>;

/** First PCM sample on or after a picture boundary. A complete master includes
 * exactly the samples whose timestamps precede the exclusive composition end.
 */
export function compositionPcmBoundary(frame: number, fps: number): number {
  return Math.ceil((frame * 48000) / fps);
}
