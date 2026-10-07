import type { FrameTransport } from "./transport.ts";

export const COMPOSITION_OUTPUT_VERSION = "composition-output-1" as const;

/** Explicit delivery profiles; omitting a profile retains the legacy MP4 path. */
export const COMPOSITION_OUTPUT_FORMATS = [
  "prores4444",
  "png8",
  "png16",
  "h264",
  "hevc10",
  "prores422hq",
  "vp9alpha",
] as const;

export type CompositionOutputFormat =
  (typeof COMPOSITION_OUTPUT_FORMATS)[number];

export type CompositionOutputProfile = {
  version: typeof COMPOSITION_OUTPUT_VERSION;
  format: CompositionOutputFormat;
  container: "mov" | "mp4" | "webm" | "image2";
  codec: "prores_ks" | "png" | "libx264" | "libx265" | "libvpx-vp9";
  pixelFormat:
    | "yuva444p10le"
    | "rgba"
    | "rgba64be"
    | "yuv420p"
    | "yuv420p10le"
    | "yuv422p10le"
    | "yuva420p";
  alpha: boolean;
  bitDepth: 8 | 10 | 16;
  encodedBitDepth: 8 | 10 | 12 | 16;
  range: "pc" | "tv";
  matrix: "rgb" | "bt709";
  audioCodec: "pcm_f32le" | "aac" | "libopus";
  evenDimensions: boolean;
  encoderArguments: readonly string[];
};

const profiles: Record<
  CompositionOutputFormat,
  Omit<CompositionOutputProfile, "version" | "format">
> = {
  prores4444: {
    container: "mov",
    codec: "prores_ks",
    pixelFormat: "yuva444p10le",
    alpha: true,
    bitDepth: 10,
    encodedBitDepth: 12,
    range: "tv",
    matrix: "bt709",
    audioCodec: "pcm_f32le",
    evenDimensions: false,
    encoderArguments: ["-profile:v", "4", "-alpha_bits", "16"],
  },
  png8: {
    container: "image2",
    codec: "png",
    pixelFormat: "rgba",
    alpha: true,
    bitDepth: 8,
    encodedBitDepth: 8,
    range: "pc",
    matrix: "rgb",
    audioCodec: "pcm_f32le",
    evenDimensions: false,
    encoderArguments: [],
  },
  png16: {
    container: "image2",
    codec: "png",
    pixelFormat: "rgba64be",
    alpha: true,
    bitDepth: 16,
    encodedBitDepth: 16,
    range: "pc",
    matrix: "rgb",
    audioCodec: "pcm_f32le",
    evenDimensions: false,
    encoderArguments: [],
  },
  h264: {
    container: "mp4",
    codec: "libx264",
    pixelFormat: "yuv420p",
    alpha: false,
    bitDepth: 8,
    encodedBitDepth: 8,
    range: "tv",
    matrix: "bt709",
    audioCodec: "aac",
    evenDimensions: true,
    encoderArguments: [
      "-preset",
      "veryfast",
      "-crf",
      "16",
      "-bsf:v",
      "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
    ],
  },
  hevc10: {
    container: "mp4",
    codec: "libx265",
    pixelFormat: "yuv420p10le",
    alpha: false,
    bitDepth: 10,
    encodedBitDepth: 10,
    range: "tv",
    matrix: "bt709",
    audioCodec: "aac",
    evenDimensions: true,
    encoderArguments: [
      "-preset",
      "medium",
      "-crf",
      "18",
      "-tag:v",
      "hvc1",
      "-x265-params",
      "pools=none:frame-threads=1:wpp=0:colorprim=bt709:transfer=bt709:colormatrix=bt709",
    ],
  },
  prores422hq: {
    container: "mov",
    codec: "prores_ks",
    pixelFormat: "yuv422p10le",
    alpha: false,
    bitDepth: 10,
    encodedBitDepth: 10,
    range: "tv",
    matrix: "bt709",
    audioCodec: "pcm_f32le",
    evenDimensions: false,
    encoderArguments: ["-profile:v", "3", "-alpha_bits", "0"],
  },
  vp9alpha: {
    container: "webm",
    codec: "libvpx-vp9",
    pixelFormat: "yuva420p",
    alpha: true,
    bitDepth: 8,
    encodedBitDepth: 8,
    range: "tv",
    matrix: "bt709",
    audioCodec: "libopus",
    evenDimensions: false,
    encoderArguments: [
      "-lossless",
      "1",
      "-auto-alt-ref",
      "0",
      "-row-mt",
      "0",
      "-fflags",
      "+bitexact",
    ],
  },
};

export function compositionOutputProfile(
  format: CompositionOutputFormat,
): CompositionOutputProfile {
  if (!Object.hasOwn(profiles, format))
    throw Error(`Unknown composition output format: ${format}`);
  return {
    version: COMPOSITION_OUTPUT_VERSION,
    format,
    ...profiles[format],
    encoderArguments: [...profiles[format].encoderArguments],
  };
}

export function validateCompositionOutput(
  profile: CompositionOutputProfile,
  width: number,
  height: number,
  transport: FrameTransport,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 8192 ||
    height > 8192
  )
    throw Error(
      "Composition output dimensions must be integers from 16 through 8192",
    );
  if (profile.evenDimensions && (width % 2 || height % 2))
    throw Error(
      `${profile.format} export requires even width and height; received ${width} × ${height}`,
    );
  if (transport === "jpeg_pipe")
    throw Error(
      "Composition output profiles require lossless PNG or raw RGBA transport",
    );
}

/** Convert exact straight RGBA8 to BT.709 RGB; alpha retains its normalized value. */
export function createCompositionOutputConversion(
  profile: CompositionOutputProfile,
) {
  const highPrecision = profile.bitDepth > 8;
  const channelBytes = highPrecision ? 2 : 1;
  const maximum = highPrecision ? 65535 : 255;
  const table = new Uint16Array(256);
  for (let value = 0; value < 256; value++) {
    const srgb = value / 255;
    const linear =
      srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    const bt709 =
      linear < 0.018 ? 4.5 * linear : 1.099 * linear ** 0.45 - 0.099;
    table[value] = Math.round(bt709 * maximum);
  }
  return {
    pixelFormat: highPrecision ? ("rgba64le" as const) : ("rgba" as const),
    convert(pixels: Uint8Array): Uint8Array {
      if (pixels.length % 4)
        throw Error("Composition capture must contain complete RGBA pixels");
      const output = new Uint8Array(pixels.length * channelBytes);
      for (let offset = 0; offset < pixels.length; offset++) {
        const value =
          offset % 4 === 3
            ? pixels[offset]! * (highPrecision ? 257 : 1)
            : table[pixels[offset]!]!;
        output[offset * channelBytes] = value & 255;
        if (highPrecision) output[offset * channelBytes + 1] = value >>> 8;
      }
      return output;
    },
  };
}

/** Matrix/range conversion follows explicit RGB transfer and linear-alpha expansion. */
export function compositionOutputFilter(
  profile: CompositionOutputProfile,
): string {
  const filters: string[] = [];
  if (profile.matrix === "bt709")
    filters.push(
      `scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+bitexact:sws_dither=none`,
    );
  filters.push(`format=${profile.pixelFormat}`);
  filters.push(
    `setparams=color_primaries=bt709:color_trc=bt709:colorspace=${profile.matrix === "rgb" ? "gbr" : "bt709"}:range=${profile.range === "pc" ? "full" : "limited"}`,
  );
  if (profile.format === "vp9alpha") {
    const metadata = filters.pop()!;
    return `split[color][alpha];[alpha]alphaextract[mask];[color]${filters.join(",")}[converted];[converted][mask]alphamerge,${metadata}`;
  }
  return filters.join(",");
}

export function compositionOutputCodecArguments(
  profile: CompositionOutputProfile,
): string[] {
  return [
    "-c:v",
    profile.codec,
    "-threads:v",
    "1",
    ...profile.encoderArguments,
    "-pix_fmt",
    profile.pixelFormat,
    "-color_range",
    profile.range,
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    profile.matrix,
    ...(profile.container === "mp4"
      ? ["-movflags", "+faststart+write_colr"]
      : profile.container === "mov"
        ? ["-movflags", "+write_colr"]
        : []),
    "-f",
    profile.container,
  ];
}

/** Encoder input has already received the explicit RGB transfer and alpha expansion. */
export function compositionOutputArguments(
  profile: CompositionOutputProfile,
  input: {
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    outputPath: string;
    audioPath?: string;
  },
): string[] {
  const pixelFormat = profile.bitDepth > 8 ? "rgba64le" : "rgba";
  return [
    "-hide_banner",
    "-loglevel",
    "info",
    "-nostats",
    "-benchmark",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    "-filter_complex_threads",
    "1",
    "-f",
    "rawvideo",
    "-pixel_format",
    pixelFormat,
    "-video_size",
    `${input.width}x${input.height}`,
    "-framerate",
    String(input.fps),
    "-i",
    "pipe:0",
    ...(input.audioPath
      ? ["-i", input.audioPath, "-map", "0:v:0", "-map", "1:a:0"]
      : []),
    "-vf",
    compositionOutputFilter(profile),
    ...(input.audioPath
      ? [
          "-c:a",
          profile.audioCodec,
          "-ar",
          "48000",
          "-ac",
          "2",
          ...(profile.audioCodec === "aac"
            ? [
                "-b:a",
                "192k",
                "-movie_timescale",
                "48000",
                "-use_editlist",
                "1",
              ]
            : profile.audioCodec === "libopus"
              ? ["-b:a", "192k", "-threads:a", "1"]
              : []),
        ]
      : ["-an"]),
    ...compositionOutputCodecArguments(profile),
    ...(profile.container === "image2" ? ["-start_number", "0"] : []),
    "-frames:v",
    String(input.frameCount),
    "-y",
    input.outputPath,
  ];
}
