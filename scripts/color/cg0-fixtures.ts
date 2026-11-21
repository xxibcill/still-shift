// CG0 color fixtures: deterministic, license-free test pictures for the color
// grading engine (docs/color-grading-engine-plan.md, CG0).
//
//   pnpm color:cg0-fixtures [--check]
//
// Everything is arithmetic: no camera, footage, chart scan or third-party
// value table. Writes under benchmarks/fixtures/color/cg0/:
//
// - stills/*.png        8-bit sRGB RGBA test images (ramps, sweeps, a synthetic
//                       24-patch chart, skin tones, a noisy gradient, alpha);
// - media/moving-disc.mp4  a short H.264 BT.709 clip: a colored disc with a
//                       known trajectory over a noisy textured background;
// - ramps/<id>.png and ramps/<id>-10bit.mkv  a scene-linear ramp encoded through
//                       each transfer function in vectors/transfer-functions.json
//                       (16-bit RGB PNG and lossless 10-bit 4:2:2 FFV1);
// - manifest.json       a descriptor per file: SHA-256, size, stated values.
//
// With --check it regenerates into a temporary directory and fails unless
// every file and the manifest are byte-identical to the committed ones.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { format } from "prettier";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const CG0_DIRECTORY = join(root, "benchmarks/fixtures/color/cg0");
const GENERATOR = "scripts/color/cg0-fixtures.ts";
const LICENSE =
  "Generated arithmetic test pattern; no third-party content. Same terms as the repository.";
const MAX_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** IEC 61966-2-1 sRGB encoding of display-linear light (0–1). */
export function srgbEncode(linear: number) {
  return linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}
const byte = (unit: number) =>
  Math.max(0, Math.min(255, Math.round(unit * 255)));

/** HSV (degrees, 0–1, 0–1) to encoded RGB in 0–1. */
export function hsv(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

/** Integer hash noise: platform-independent 32-bit arithmetic. */
export function hash32(x: number, y: number, t: number) {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(t, 1274126177)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** Triangular noise in [-1, 1] from two hashes. */
const triangular = (x: number, y: number, t: number) =>
  hash32(x, y, t) / 4294967296 +
  hash32(x + 7919, y + 104729, t) / 4294967296 -
  1;

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, "latin1");
  bytes.set(data, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}
/** PNG with filter 0 rows: 8-bit RGBA (type 6) or 16-bit RGB (type 2). */
function png(
  width: number,
  height: number,
  samples: Uint8Array | Uint16Array,
  kind: "rgba8" | "rgb16",
) {
  const channels = kind === "rgba8" ? 4 : 3;
  const sampleBytes = kind === "rgba8" ? 1 : 2;
  if (samples.length !== width * height * channels)
    throw new Error("PNG sample count does not match its size");
  const stride = width * channels * sampleBytes;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    for (let i = 0; i < width * channels; i++) {
      const value = samples[y * width * channels + i]!;
      const at = y * (stride + 1) + 1 + i * sampleBytes;
      if (sampleBytes === 1) rows[at] = value;
      else rows.writeUInt16BE(value, at);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = kind === "rgba8" ? 8 : 16;
  header[9] = kind === "rgba8" ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

// ---------------------------------------------------------------------------
// Stills (8-bit encoded sRGB, straight alpha)
// ---------------------------------------------------------------------------

type Still = {
  id: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  description: string;
  values?: unknown;
};

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly number[],
) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rgba.set(pixel(x, y), (y * width + x) * 4);
  return rgba;
}

/** Synthetic 24-patch chart, values stated in BT.709-primary linear light. */
export const CHART_24_LINEAR: readonly (readonly [number, number, number])[] = [
  // Row 0: natural colors (original values, not a commercial chart's).
  [0.18, 0.09, 0.06],
  [0.55, 0.35, 0.28],
  [0.1, 0.16, 0.3],
  [0.08, 0.14, 0.05],
  [0.22, 0.2, 0.4],
  [0.12, 0.4, 0.36],
  // Row 1: oranges, purples and yellow-greens.
  [0.6, 0.25, 0.04],
  [0.06, 0.09, 0.38],
  [0.48, 0.1, 0.12],
  [0.08, 0.04, 0.12],
  [0.35, 0.5, 0.06],
  [0.7, 0.42, 0.03],
  // Row 2: primaries and secondaries.
  [0.02, 0.03, 0.3],
  [0.06, 0.3, 0.06],
  [0.4, 0.03, 0.03],
  [0.8, 0.6, 0.02],
  [0.5, 0.08, 0.3],
  [0.02, 0.22, 0.42],
  // Row 3: neutrals.
  [0.9, 0.9, 0.9],
  [0.59, 0.59, 0.59],
  [0.36, 0.36, 0.36],
  [0.18, 0.18, 0.18],
  [0.09, 0.09, 0.09],
  [0.03, 0.03, 0.03],
];
/** Skin-tone patch set along the skin-tone hue range (HSV, encoded). */
export const SKIN_TONES_HSV: readonly (readonly [number, number, number])[] = [
  [18, 0.2, 0.95],
  [22, 0.28, 0.9],
  [26, 0.33, 0.85],
  [30, 0.38, 0.8],
  [20, 0.42, 0.7],
  [24, 0.47, 0.62],
  [28, 0.5, 0.55],
  [16, 0.52, 0.48],
  [22, 0.55, 0.4],
  [26, 0.58, 0.33],
  [14, 0.5, 0.27],
  [32, 0.45, 0.22],
];
const SATURATION_HUES = [0, 60, 120, 180, 240, 300];
const ALPHA_COLORS: readonly (readonly [number, number, number])[] = [
  [255, 255, 255],
  [220, 80, 40],
  [40, 160, 90],
  [60, 90, 220],
];

export function cg0Stills(): Still[] {
  const steps16 = Array.from({ length: 16 }, (_, i) =>
    Math.round((i * 255) / 15),
  );
  const chartBytes = CHART_24_LINEAR.map((rgb) =>
    rgb.map((value) => byte(srgbEncode(value))),
  );
  const skinBytes = SKIN_TONES_HSV.map(([h, s, v]) => hsv(h, s, v).map(byte));
  return [
    {
      id: "gray-ramp-256",
      width: 256,
      height: 32,
      rgba: image(256, 32, (x) => [x, x, x, 255]),
      description:
        "Neutral ramp: column x has code value x in every channel (0-255).",
    },
    {
      id: "gray-steps-16",
      width: 512,
      height: 32,
      rgba: image(512, 32, (x) => {
        const v = steps16[x >> 5]!;
        return [v, v, v, 255];
      }),
      description:
        "16-step neutral ramp, 32 px per step, code round(i * 255 / 15).",
      values: { codes: steps16 },
    },
    {
      id: "rgb-ramps",
      width: 256,
      height: 96,
      rgba: image(256, 96, (x, y) =>
        y < 32 ? [x, 0, 0, 255] : y < 64 ? [0, x, 0, 255] : [0, 0, x, 255],
      ),
      description:
        "Red (rows 0-31), green (32-63) and blue (64-95) ramps, column x = code x.",
    },
    {
      id: "hue-sweep",
      width: 360,
      height: 64,
      rgba: image(360, 64, (x, y) => [
        ...(y < 32 ? hsv(x, 1, 1) : hsv(x, 0.5, 0.8)).map(byte),
        255,
      ]),
      description:
        "Hue sweep in encoded sRGB HSV: column x is hue x degrees; rows 0-31 S 1 V 1, rows 32-63 S 0.5 V 0.8; bytes round(255 v).",
    },
    {
      id: "saturation-sweep",
      width: 256,
      height: 96,
      rgba: image(256, 96, (x, y) => [
        ...hsv(SATURATION_HUES[y >> 4]!, x / 255, 0.8).map(byte),
        255,
      ]),
      description:
        "Saturation sweep: six 16-row bands at hues 0, 60, 120, 180, 240, 300 degrees; column x is HSV saturation x/255 at V 0.8.",
      values: { hues: SATURATION_HUES, value: 0.8 },
    },
    {
      id: "chart-24",
      width: 6 * 64,
      height: 4 * 64,
      rgba: image(6 * 64, 4 * 64, (x, y) => {
        const patch = (y >> 6) * 6 + (x >> 6);
        // A 4 px border of 18% grey around each patch.
        const border = x % 64 < 4 || x % 64 >= 60 || y % 64 < 4 || y % 64 >= 60;
        return border
          ? [...CHART_24_LINEAR[21]!.map((v) => byte(srgbEncode(v))), 255]
          : [...chartBytes[patch]!, 255];
      }),
      description:
        "Synthetic 24-patch chart (original values, not a commercial chart): 6 x 4 patches of 64 px with a 4 px 18% grey border; patch values stated in BT.709-primary linear light and encoded with the sRGB transfer.",
      values: {
        layout: "row-major, 6 columns, 4 rows",
        linear: CHART_24_LINEAR,
        encoded: chartBytes,
      },
    },
    {
      id: "skin-tones",
      width: 4 * 64,
      height: 3 * 64,
      rgba: image(4 * 64, 3 * 64, (x, y) => [
        ...skinBytes[(y >> 6) * 4 + (x >> 6)]!,
        255,
      ]),
      description:
        "Twelve skin-tone patches (4 x 3, 64 px) spanning hue 14-32 degrees, HSV saturation 0.2-0.58 and value 0.22-0.95, in encoded sRGB.",
      values: {
        layout: "row-major, 4 columns",
        hsv: SKIN_TONES_HSV,
        encoded: skinBytes,
      },
    },
    {
      id: "noisy-gradient",
      width: 512,
      height: 64,
      rgba: image(512, 64, (x, y) => {
        const unit = 0.3 + (0.15 * x) / 511;
        const noise = y < 32 ? 0 : 2 * triangular(x, y, 0);
        const v = Math.max(0, Math.min(255, Math.round(unit * 255 + noise)));
        return [v, v, v, 255];
      }),
      description:
        "Narrow neutral gradient from code 76.5 to 114.75 (encoded 0.30-0.45): rows 0-31 rounded only, rows 32-63 plus deterministic triangular noise of +-2 codes (integer hash). For banding checks after stretching.",
    },
    {
      id: "alpha-patches",
      width: 256,
      height: 64,
      rgba: image(256, 64, (x, y) => [...ALPHA_COLORS[y >> 4]!, x]),
      description:
        "Straight-alpha patches: four 16-row bands (white, orange, green, blue) whose alpha is the column x (0-255). For premultiplied-alpha handling.",
      values: { colors: ALPHA_COLORS },
    },
  ];
}

// ---------------------------------------------------------------------------
// Moving clip
// ---------------------------------------------------------------------------

export const MOVING_CLIP = {
  width: 640,
  height: 360,
  fps: 24,
  frames: 48,
  disc: { radius: 36, color: [0.86, 0.33, 0.12] as const },
  background: { color: [0.42, 0.45, 0.36] as const, texture: 0.06, noise: 5 },
} as const;

/** Disc centre on frame f, in pixels (pixel centres at x + 0.5). */
export function discCentre(frame: number): [number, number] {
  return [
    60 + 11 * frame,
    150 + 2 * frame + 30 * Math.sin((2 * Math.PI * frame) / 48),
  ];
}

export function movingFrame(frame: number) {
  const { width, height, disc, background } = MOVING_CLIP;
  const [cx, cy] = discCentre(frame);
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const texture =
        background.texture * Math.sin(x / 23 + frame * 0.05) * Math.sin(y / 17);
      const noise = background.noise * triangular(x, y, frame + 1);
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, disc.radius + 0.5 - distance));
      for (let c = 0; c < 3; c++) {
        const back = (background.color[c]! + texture) * 255 + noise;
        const value = back * (1 - coverage) + disc.color[c]! * 255 * coverage;
        rgb[(y * width + x) * 3 + c] = Math.max(
          0,
          Math.min(255, Math.round(value)),
        );
      }
    }
  return rgb;
}

// ---------------------------------------------------------------------------
// 10-bit and log ramps
// ---------------------------------------------------------------------------

type TransferVectors = {
  functions: {
    id: string;
    name: string;
    kind: "display" | "working-log" | "camera-log";
    input: string;
    encode: { linear: number[]; code: number[] };
  }[];
};

/** FFmpeg tags for each transfer's 10-bit clip; logs carry no transfer tag. */
const RAMP_TAGS: Record<
  string,
  { primaries?: string; trc?: string; matrix: string }
> = {
  srgb: { primaries: "bt709", trc: "iec61966-2-1", matrix: "bt709" },
  bt709: { primaries: "bt709", trc: "bt709", matrix: "bt709" },
  bt1886: { primaries: "bt709", trc: "bt709", matrix: "bt709" },
  pq: { primaries: "bt2020", trc: "smpte2084", matrix: "bt2020nc" },
  hlg: { primaries: "bt2020", trc: "arib-std-b67", matrix: "bt2020nc" },
};
const RAMP = { width: 1024, height: 16, sampleWidth: 8, frames: 2 } as const;

function rampLayout(code: number[]) {
  if (code.length * RAMP.sampleWidth !== RAMP.width)
    throw new Error("Ramp sample count does not fill the ramp width");
  return code.map((value) => Math.max(0, Math.min(1, value)));
}

/** Y′ code values for the 10-bit clip; see the manifest for the convention. */
function rampLuma10(kind: string, clamped: number[]) {
  return clamped.map((value) =>
    kind === "display"
      ? Math.round(64 + 876 * value)
      : Math.round(1023 * value),
  );
}

// ---------------------------------------------------------------------------
// FFmpeg
// ---------------------------------------------------------------------------

function ffmpegVersion() {
  const first = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" })
    .split("\n")[0]!
    .trim();
  if (!/^ffmpeg version 8\.0\.1\b/u.test(first))
    throw new Error(`CG0 fixtures are pinned to FFmpeg 8.0.1; found: ${first}`);
  return first;
}
const BITEXACT = [
  "-map_metadata",
  "-1",
  "-fflags",
  "+bitexact",
  "-flags:v",
  "+bitexact",
  "-an",
];

function encodeMovingClip(output: string) {
  const { width, height, fps, frames } = MOVING_CLIP;
  const raw = Buffer.concat(
    Array.from({ length: frames }, (_, frame) => movingFrame(frame)),
  );
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${width}x${height}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-g",
      String(frames),
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-color_range",
      "tv",
      ...BITEXACT,
      "-y",
      output,
    ],
    { input: raw, stdio: ["pipe", "inherit", "inherit"] },
  );
}

function encodeRamp10(
  output: string,
  luma: number[],
  tags: { primaries?: string; trc?: string; matrix: string },
) {
  const { width, height, sampleWidth, frames } = RAMP;
  // yuv422p10le: Y plane width x height, Cb and Cr planes width/2 x height.
  const plane = (w: number, value: (x: number) => number) => {
    const bytes = Buffer.alloc(w * height * 2);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < w; x++)
        bytes.writeUInt16LE(value(x), (y * w + x) * 2);
    return bytes;
  };
  const frame = Buffer.concat([
    plane(width, (x) => luma[Math.floor(x / sampleWidth)]!),
    plane(width / 2, () => 512),
    plane(width / 2, () => 512),
  ]);
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "yuv422p10le",
      "-s",
      `${width}x${height}`,
      "-r",
      "24",
      "-i",
      "-",
      // Frame properties win over output options in FFmpeg 8; set both.
      "-vf",
      [
        "setparams=range=limited",
        `colorspace=${tags.matrix}`,
        ...(tags.primaries ? [`color_primaries=${tags.primaries}`] : []),
        ...(tags.trc ? [`color_trc=${tags.trc}`] : []),
      ].join(":"),
      "-c:v",
      "ffv1",
      "-level",
      "3",
      "-threads",
      "1",
      "-g",
      "1",
      ...(tags.primaries ? ["-color_primaries", tags.primaries] : []),
      ...(tags.trc ? ["-color_trc", tags.trc] : []),
      "-colorspace",
      tags.matrix,
      "-color_range",
      "tv",
      ...BITEXACT,
      "-y",
      output,
    ],
    {
      input: Buffer.concat(Array.from({ length: frames }, () => frame)),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

type Entry = Record<string, unknown> & { path: string };

async function generate(directory: string) {
  const ffmpeg = ffmpegVersion();
  const entries: Entry[] = [];
  const record = (path: string, entry: Record<string, unknown>) => {
    const bytes = readFileSync(join(directory, path));
    if (bytes.byteLength >= MAX_BYTES)
      throw new Error(`${path} is ${bytes.byteLength} bytes; limit 1 MiB`);
    entries.push({
      path,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      ...entry,
    });
  };
  const write = (path: string, bytes: Uint8Array) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), bytes);
  };

  for (const still of cg0Stills()) {
    const path = `stills/${still.id}.png`;
    write(path, png(still.width, still.height, still.rgba, "rgba8"));
    record(path, {
      id: still.id,
      kind: "still",
      format: "PNG RGBA 8-bit, no color chunks (read as encoded sRGB)",
      width: still.width,
      height: still.height,
      description: still.description,
      ...(still.values ? { values: still.values } : {}),
    });
  }

  mkdirSync(join(directory, "media"), { recursive: true });
  encodeMovingClip(join(directory, "media/moving-disc.mp4"));
  record("media/moving-disc.mp4", {
    id: "moving-disc",
    kind: "video",
    format:
      "H.264 yuv420p, BT.709 primaries/transfer/matrix, limited range, 24 fps, libx264 -threads 1 -crf 18, bitexact",
    width: MOVING_CLIP.width,
    height: MOVING_CLIP.height,
    frameCount: MOVING_CLIP.frames,
    frameRate: { numerator: MOVING_CLIP.fps, denominator: 1 },
    description:
      "A saturated orange disc (radius 36 px, encoded sRGB 0.86/0.33/0.12, 1 px anti-aliased edge) crossing a muted textured background (encoded 0.42/0.45/0.36 plus 0.06 sin(x/23 + 0.05 f) sin(y/17), plus +-5 code triangular integer-hash noise per frame). Encoded from exact RGB frames, so codec error is the only difference from the stated picture.",
    values: {
      trajectory:
        "centre(f) = (60 + 11 f, 150 + 2 f + 30 sin(2 pi f / 48)) px, pixel centres at x + 0.5",
      centres: Array.from({ length: MOVING_CLIP.frames }, (_, f) =>
        discCentre(f).map((v) => Math.round(v * 1e6) / 1e6),
      ),
    },
  });

  const vectors = JSON.parse(
    readFileSync(
      join(CG0_DIRECTORY, "vectors/transfer-functions.json"),
      "utf8",
    ),
  ) as TransferVectors;
  for (const fn of vectors.functions) {
    const clamped = rampLayout(fn.encode.code);
    const clampedCount = fn.encode.code.filter((v) => v < 0 || v > 1).length;
    const samples = new Uint16Array(RAMP.width * RAMP.height * 3);
    for (let y = 0; y < RAMP.height; y++)
      for (let x = 0; x < RAMP.width; x++) {
        const value = Math.round(
          65535 * clamped[Math.floor(x / RAMP.sampleWidth)]!,
        );
        samples.set([value, value, value], (y * RAMP.width + x) * 3);
      }
    const common = {
      transfer: fn.id,
      transferName: fn.name,
      input: fn.input,
      ramp: `${fn.encode.linear.length} samples of vectors/transfer-functions.json '${fn.id}' encode, ${RAMP.sampleWidth} px each, left to right; ${clampedCount} code values outside 0-1 clamped`,
    };
    const pngPath = `ramps/${fn.id}.png`;
    write(pngPath, png(RAMP.width, RAMP.height, samples, "rgb16"));
    record(pngPath, {
      id: `${fn.id}-16bit`,
      kind: "ramp-still",
      format: "PNG RGB 16-bit, neutral, no color chunks",
      width: RAMP.width,
      height: RAMP.height,
      description: `Scene ramp encoded through ${fn.name}; sample value round(65535 x clamp(code, 0, 1)).`,
      ...common,
    });
    const tags = RAMP_TAGS[fn.id] ?? { matrix: "bt709" };
    const luma = rampLuma10(fn.kind, clamped);
    const clipPath = `ramps/${fn.id}-10bit.mkv`;
    encodeRamp10(join(directory, clipPath), luma, tags);
    record(clipPath, {
      id: `${fn.id}-10bit`,
      kind: "ramp-video",
      format:
        "FFV1 level 3 (lossless) yuv422p10le in Matroska, 2 identical frames at 24 fps, Cb = Cr = 512 (neutral)",
      width: RAMP.width,
      height: RAMP.height,
      frameCount: RAMP.frames,
      tags: { range: "tv", ...tags },
      lumaConvention:
        fn.kind === "display"
          ? "Y' = round(64 + 876 x code): standard limited-range video levels."
          : "Y' = round(1023 x code): the curve's own 10-bit code value, as cameras record log (S-Log3 18% grey is Y' 420, '41% IRE' read as limited range). The file is tagged limited range and carries no transfer tag, so the curve must be declared by the author; a decoder that rescales limited to full range before the curve misreads it.",
      ...(RAMP_TAGS[fn.id] === undefined
        ? {}
        : fn.id === "bt1886"
          ? {
              tagNote:
                "BT.1886 has no transfer tag of its own; tagged bt709 like ramps/bt709-10bit.mkv, which encodes different values.",
            }
          : {}),
      lumaCodes: luma,
      ...common,
    });
  }

  const manifest = {
    schema: "still-shift-color-fixtures-1",
    milestone: "CG0",
    generator: GENERATOR,
    ffmpeg,
    node: process.version,
    license: LICENSE,
    note: "Byte-identical regeneration is checked on the platform that recorded it (darwin-arm64, pinned Node and FFmpeg); zlib, libm and encoder builds elsewhere may differ.",
    files: entries,
  };
  writeFileSync(
    join(directory, "manifest.json"),
    await format(JSON.stringify(manifest), { parser: "json" }),
  );
}

function listFiles(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(directory, entry.name), base)
      : [relative(base, join(directory, entry.name))],
  );
}
const GENERATED = ["manifest.json", "stills", "media", "ramps"];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  if (check) {
    const dir = mkdtempSync(join(tmpdir(), "cg0-fixtures-"));
    try {
      await generate(dir);
      const fresh = listFiles(dir).sort();
      const committed = GENERATED.flatMap((name) =>
        name.endsWith(".json")
          ? [name]
          : listFiles(join(CG0_DIRECTORY, name)).map(
              (file) => `${name}/${file}`,
            ),
      ).sort();
      const differ = fresh.filter(
        (file) =>
          !committed.includes(file) ||
          !readFileSync(join(dir, file)).equals(
            readFileSync(join(CG0_DIRECTORY, file)),
          ),
      );
      const missing = committed.filter((file) => !fresh.includes(file));
      if (differ.length || missing.length) {
        console.error(
          `CG0 fixtures differ from the committed files: ${JSON.stringify({ differ, missing })}`,
        );
        process.exitCode = 1;
      } else console.log(`CG0 fixtures identical (${fresh.length} files)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    for (const name of GENERATED)
      rmSync(join(CG0_DIRECTORY, name), { recursive: true, force: true });
    await generate(CG0_DIRECTORY);
    console.log(`Wrote CG0 fixtures to ${relative(root, CG0_DIRECTORY)}`);
  }
}
