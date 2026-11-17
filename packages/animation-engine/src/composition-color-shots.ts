/**
 * CGA shot alignment: small luma proxies of every frame and hard-cut
 * detection, so a graded edit's shots can be matched to their raw clips.
 */
import { ffmpegBytes } from "./composition-color-ffmpeg.ts";
import { compositionMediaColorFilter } from "./composition-media-color.ts";
import type { ColorClip } from "./composition-color-frames.ts";

const PROXY_WIDTH = 36;
/**
 * Small luma proxies of every frame, converted with the media path's color
 * filter, as zero-mean unit vectors for gain/offset-invariant correlation.
 */
export async function colorLumaProxies(
  clip: ColorClip,
  signal?: AbortSignal,
): Promise<Float64Array[]> {
  const width = PROXY_WIDTH,
    height = Math.max(
      8,
      Math.round((PROXY_WIDTH * clip.probe.height) / clip.probe.width),
    );
  const bytes = await ffmpegBytes(
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      clip.path,
      "-map",
      "0:v:0",
      "-vf",
      `${compositionMediaColorFilter(clip.probe.color)},scale=${width}:${height}:flags=area,format=rgb24`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    width * height * 3 * (clip.probe.frameCount + 8),
    "comp-look-decode: FFmpeg proxy decode failed",
    signal,
  );
  const size = width * height,
    frames: Float64Array[] = [];
  for (let at = 0; at + size * 3 <= bytes.length; at += size * 3) {
    const vector = new Float64Array(size);
    let mean = 0;
    for (let i = 0; i < size; i++) {
      vector[i] =
        0.2126 * bytes[at + i * 3]! +
        0.7152 * bytes[at + i * 3 + 1]! +
        0.0722 * bytes[at + i * 3 + 2]!;
      mean += vector[i]!;
    }
    mean /= size;
    let norm = 0;
    for (let i = 0; i < size; i++) {
      vector[i]! -= mean;
      norm += vector[i]! ** 2;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < size; i++) vector[i]! /= norm;
    frames.push(vector);
  }
  return frames;
}
/** Correlation of two zero-mean unit proxies (1 = same picture up to gain/offset). */
export const colorProxyCorrelation = (a: Float64Array, b: Float64Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
};

/** Hard cuts: consecutive proxy correlation below the threshold. */
export function detectColorShots(
  proxies: readonly Float64Array[],
  threshold = 0.9,
  minimumLength = 3,
): [number, number][] {
  const shots: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < proxies.length; i++)
    if (
      colorProxyCorrelation(proxies[i]!, proxies[i - 1]!) < threshold &&
      i - start >= minimumLength
    ) {
      shots.push([start, i]);
      start = i;
    }
  if (proxies.length) shots.push([start, proxies.length]);
  return shots;
}
