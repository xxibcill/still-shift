import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

export type VideoDimensions = {
  width: number;
  height: number;
  frameCount: number;
};

export type FrameDifference = {
  frame: number;
  maxChannelDelta: number;
  meanAbsoluteDelta: number;
  channelsOverTolerance: number;
  firstDifference?: { x: number; y: number; channel: "r" | "g" | "b" };
};

export async function sha256File(path: string): Promise<string> {
  return `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}`;
}

export const V014_ARCHIVED_MP4_SHA256 =
  "sha256:59916b3457df4c92e0a188d0d591195fa05a4e477dfd00040b17f7e9a1ac862a";
export const V014_ARCHIVED_SOURCE_SHA256 =
  "sha256:ed3a58c0b805277de2e4e608ce5e4b6b09a9cfdbc41d30b714933c19a9b77b8f";

export async function verifyV014HistoricalIdentity(
  videoPath: string,
  result: { checksums: { source: string; output: string } },
  manifest: { sourceChecksum: string },
): Promise<string> {
  assert.equal(
    manifest.sourceChecksum,
    result.checksums.source,
    "Historical v014-g source sidecars disagree",
  );
  assert.equal(
    manifest.sourceChecksum,
    V014_ARCHIVED_SOURCE_SHA256,
    "Historical v014-g source checksum differs from the pinned source",
  );
  const videoChecksum = await sha256File(videoPath);
  assert.equal(
    videoChecksum,
    result.checksums.output,
    "Historical v014-g video sidecar disagrees with its MP4",
  );
  assert.equal(
    videoChecksum,
    V014_ARCHIVED_MP4_SHA256,
    "Historical v014-g MP4 checksum differs from the pinned video",
  );
  return videoChecksum;
}

export function measureRgbDifference(
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  tolerance: number,
  frame: number,
): FrameDifference {
  if (before.length !== after.length || before.length % (width * 3) !== 0)
    throw new Error("Decoded RGB frames have incompatible dimensions");
  let total = 0;
  let maximum = 0;
  let channelsOverTolerance = 0;
  let firstDifference: FrameDifference["firstDifference"];
  for (let i = 0; i < before.length; i++) {
    const delta = Math.abs(before[i]! - after[i]!);
    total += delta;
    maximum = Math.max(maximum, delta);
    if (delta > tolerance) {
      channelsOverTolerance++;
      firstDifference ??= {
        x: Math.floor(i / 3) % width,
        y: Math.floor(i / (3 * width)),
        channel: (["r", "g", "b"] as const)[i % 3]!,
      };
    }
  }
  return {
    frame,
    maxChannelDelta: maximum,
    meanAbsoluteDelta: total / before.length,
    channelsOverTolerance,
    ...(firstDifference ? { firstDifference } : {}),
  };
}

async function* decodedRgbFrames(path: string, frameBytes: number) {
  const process = spawn("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "-",
  ]);
  const closed = once(process, "close");
  let error = "";
  process.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    error += chunk;
  });
  let frame = Buffer.allocUnsafe(frameBytes);
  let filled = 0;
  try {
    for await (const chunk of process.stdout) {
      let offset = 0;
      while (offset < chunk.length) {
        const count = Math.min(frameBytes - filled, chunk.length - offset);
        chunk.copy(frame, filled, offset, offset + count);
        filled += count;
        offset += count;
        if (filled === frameBytes) {
          yield frame;
          frame = Buffer.allocUnsafe(frameBytes);
          filled = 0;
        }
      }
    }
    const [code] = (await closed) as [number];
    if (code !== 0 || filled !== 0)
      throw new Error(
        `FFmpeg decode failed for ${path}: ${error || `exit ${code}, partial frame ${filled}`}`,
      );
  } finally {
    if (process.exitCode === null) process.kill();
  }
}

export async function compareDecodedVideos(
  historical: string,
  candidate: string,
  dimensions: VideoDimensions,
  tolerance: number,
): Promise<FrameDifference[]> {
  const frameBytes = dimensions.width * dimensions.height * 3;
  const before = decodedRgbFrames(historical, frameBytes)[
    Symbol.asyncIterator
  ]();
  const after = decodedRgbFrames(candidate, frameBytes)[Symbol.asyncIterator]();
  const differences: FrameDifference[] = [];
  try {
    for (let frame = 0; frame < dimensions.frameCount; frame++) {
      const [a, b] = await Promise.all([before.next(), after.next()]);
      if (a.done || b.done)
        throw new Error(`Video ended before expected frame ${frame}`);
      differences.push(
        measureRgbDifference(
          a.value,
          b.value,
          dimensions.width,
          tolerance,
          frame,
        ),
      );
    }
    const [a, b] = await Promise.all([before.next(), after.next()]);
    if (!a.done || !b.done)
      throw new Error(
        `Video contains more than ${dimensions.frameCount} frames`,
      );
  } finally {
    await Promise.all([before.return?.(), after.return?.()]);
  }
  return differences;
}
