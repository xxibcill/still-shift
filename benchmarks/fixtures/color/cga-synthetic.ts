/**
 * CGA synthetic color fixtures: a small, deterministic, license-free portrait
 * clip that the adaptive solver treats as well balanced, plus known
 * degradations (exposure, contrast, saturation, white balance, a look). The
 * frames are generated arithmetic; tests encode them losslessly (FFV1, RGB,
 * full range, sRGB transfer) so the media path returns these exact bytes.
 */
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { writeFile, rm } from "node:fs/promises";
import {
  gradeBytes,
  gradeControls,
  linearToSrgb,
  srgbToLinear,
  whiteBalanceGains,
} from "@still-shift/renderer-core";

export const CGA_SYNTHETIC = {
  width: 96,
  height: 160,
  frameCount: 12,
  fps: 24,
} as const;

/** Encoded-sRGB colors (0–1) of the patch grid, six columns per row. */
const NEUTRALS = [0.01, 0.06, 0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 0.97];
const hsv = (h: number, s: number, v: number) => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
};
const COLORS = [
  // Strong colors.
  hsv(0, 0.8, 0.8),
  hsv(130, 0.7, 0.6),
  hsv(220, 0.75, 0.75),
  // Medium colors.
  hsv(45, 0.4, 0.55),
  hsv(90, 0.4, 0.5),
  hsv(160, 0.35, 0.6),
  hsv(200, 0.4, 0.8),
  hsv(280, 0.35, 0.55),
  hsv(330, 0.4, 0.7),
  // Soft colors, as generated footage mostly has.
  hsv(30, 0.3, 0.85),
  hsv(60, 0.3, 0.7),
  hsv(110, 0.3, 0.4),
  hsv(180, 0.3, 0.65),
  hsv(210, 0.3, 0.9),
  hsv(240, 0.3, 0.35),
  hsv(300, 0.3, 0.6),
  hsv(350, 0.3, 0.5),
  hsv(15, 0.3, 0.25),
  // Skin tones.
  hsv(20, 0.3, 0.85),
  hsv(25, 0.4, 0.65),
  hsv(18, 0.45, 0.45),
];

/**
 * Reference frames, straight RGBA8. A neutral bar drifts down by frame.
 * `variant` 1 shifts the patch layout and mirrors the ramp, giving a second
 * clip with the same statistics and different content (for shot matching).
 */
export function cgaReferenceFrames(variant: 0 | 1 = 0): Uint8Array[] {
  const { width, height, frameCount } = CGA_SYNTHETIC;
  const patches = [...NEUTRALS.map((v) => [v, v, v]), ...COLORS];
  return Array.from({ length: frameCount }, (_, frame) => {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let rgb: number[];
        if (y < 16) {
          // Neutral ramp, for the banding bound.
          const v = (variant ? width - 1 - x : x) / (width - 1);
          rgb = [v, v, v];
        } else {
          const index = Math.floor((y - 16) / 16) * 6 + Math.floor(x / 16);
          rgb = patches[(index + variant * 11) % patches.length]!;
        }
        if (Math.abs(y - (40 + variant * 50 + frame * 6)) < 2)
          rgb = [0.5, 0.5, 0.5];
        const at = (y * width + x) * 4;
        rgba[at] = Math.round(rgb[0]! * 255);
        rgba[at + 1] = Math.round(rgb[1]! * 255);
        rgba[at + 2] = Math.round(rgb[2]! * 255);
        rgba[at + 3] = 255;
      }
    return rgba;
  });
}

export type CgaDegradation =
  | { kind: "exposure"; stops: number }
  | { kind: "contrast"; black: number; white: number }
  | { kind: "saturation"; scale: number }
  | { kind: "white-balance"; temperature: number; tint: number }
  | { kind: "matrix"; params: Record<string, number> };

/** Apply a known change to straight RGBA8 frames. */
export function cgaDegrade(
  frames: readonly Uint8Array[],
  change: CgaDegradation,
): Uint8Array[] {
  const gains =
    change.kind === "white-balance"
      ? whiteBalanceGains(change.temperature, change.tint)
      : undefined;
  const controls =
    change.kind === "matrix"
      ? gradeControls("color.matrix", {
          rr: 1,
          rg: 0,
          rb: 0,
          gr: 0,
          gg: 1,
          gb: 0,
          br: 0,
          bg: 0,
          bb: 1,
          ro: 0,
          go: 0,
          bo: 0,
          strength: 1,
          ...change.params,
        })
      : undefined;
  return frames.map((frame) => {
    const out = new Uint8Array(frame);
    for (let i = 0; i < out.length; i += 4) {
      const rgb = [out[i]! / 255, out[i + 1]! / 255, out[i + 2]! / 255];
      let result: number[];
      if (controls) {
        const bytes = [0, 0, 0];
        gradeBytes(controls, out[i]!, out[i + 1]!, out[i + 2]!, bytes);
        result = bytes.map((value) => value / 255);
      } else if (change.kind === "exposure")
        result = rgb.map((v) =>
          linearToSrgb(Math.min(1, srgbToLinear(v) * 2 ** change.stops)),
        );
      else if (change.kind === "contrast")
        result = rgb.map(
          (v) => change.black + v * (change.white - change.black),
        );
      else if (change.kind === "saturation") {
        const luma = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
        result = rgb.map((v) => luma + (v - luma) * change.scale);
      } else
        result = rgb.map((v, c) =>
          linearToSrgb(Math.min(1, srgbToLinear(v) * gains![c]!)),
        );
      for (let c = 0; c < 3; c++)
        out[i + c] = Math.round(Math.min(1, Math.max(0, result[c]!)) * 255);
    }
    return out;
  });
}

/**
 * Encode frames losslessly (FFV1 RGB, full range, sRGB transfer, BT.709
 * primaries) with an optional 440 Hz stereo PCM track (no codec priming) of the clip's length.
 */
export async function writeCgaClip(
  path: string,
  frames: readonly Uint8Array[],
  options: { audio?: boolean; frameRate?: string } = {},
) {
  const { width, height } = CGA_SYNTHETIC;
  const fps = options.frameRate ?? String(CGA_SYNTHETIC.fps);
  const raw = `${path}.rgba`;
  await writeFile(
    raw,
    Buffer.concat(frames.map((frame) => Buffer.from(frame))),
  );
  try {
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-video_size",
      `${width}x${height}`,
      "-framerate",
      fps,
      "-i",
      raw,
      ...(options.audio
        ? [
            "-f",
            "lavfi",
            "-i",
            `sine=frequency=440:sample_rate=48000:duration=${frames.length / CGA_SYNTHETIC.fps}`,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
          ]
        : []),
      "-vf",
      "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=full",
      "-c:v",
      "ffv1",
      "-pix_fmt",
      "gbrp",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "iec61966-2-1",
      "-colorspace",
      "0",
      "-color_range",
      "pc",
      path,
    ]);
  } finally {
    await rm(raw, { force: true });
  }
}
