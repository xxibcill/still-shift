import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

export type EnergyOptions = {
  width: number;
  height: number;
  fps: number;
  pixelThreshold?: number;
  minimumChangedPixels?: number;
};

export function measureFrameEnergy(
  before: Uint8Array,
  after: Uint8Array,
  threshold: number,
) {
  if (before.length !== after.length)
    throw new Error("Decoded frame sizes differ");
  let changed = 0;
  for (let i = 0; i < before.length; i++)
    if (Math.abs(after[i]! - before[i]!) > threshold) changed++;
  return changed;
}

export function summarizeMotionEnergy(
  changedPixels: number[],
  options: EnergyOptions,
) {
  if (changedPixels.length < 2)
    throw new Error("Motion measurement requires at least two decoded frames");
  const {
    width,
    height,
    fps,
    pixelThreshold = 4,
    minimumChangedPixels = 200,
  } = options;
  const differences = changedPixels.slice(1);
  let moving = 0,
    run = 0,
    longestFrozenRun = 0,
    frozenEnd = 0;
  differences.forEach((value, index) => {
    if (value >= minimumChangedPixels) {
      moving++;
      run = 0;
    } else if (++run > longestFrozenRun) {
      longestFrozenRun = run;
      frozenEnd = index + 1;
    }
  });
  const sorted = [...differences].sort((a, b) => a - b);
  const median =
    (sorted[Math.floor((sorted.length - 1) / 2)]! +
      sorted[Math.floor(sorted.length / 2)]!) /
    2;
  const peak = Math.max(...differences);
  const peakToMedian = median > 0 ? peak / median : null;
  const movingShare = moving / differences.length;
  const points = changedPixels
    .map(
      (value, i) =>
        `${((i * 600) / (changedPixels.length - 1)).toFixed(2)},${(58 - (value / Math.max(1, peak)) * 54).toFixed(2)}`,
    )
    .join(" ");
  return {
    version: "story-motion-energy-1",
    width,
    height,
    fps,
    frameCount: changedPixels.length,
    pixelThreshold,
    minimumChangedPixels,
    comparisonCount: differences.length,
    changedPixels,
    movingShare,
    longestFrozenRun,
    longestFrozenInterval: longestFrozenRun
      ? [frozenEnd - longestFrozenRun + 1, frozenEnd]
      : null,
    medianChangedPixels: median,
    peakChangedPixels: peak,
    peakFrame: changedPixels.indexOf(peak),
    peakToMedian,
    gates: {
      frozenRun: {
        measured: longestFrozenRun,
        limit: 6,
        pass: longestFrozenRun <= 6,
      },
      movingShare: {
        measured: movingShare,
        limit: 0.97,
        pass: movingShare >= 0.97,
      },
      peakContrast: {
        measured: peakToMedian,
        limit: 2.5,
        pass: peak > 0 && (peakToMedian === null || peakToMedian >= 2.5),
      },
    },
    sparkline: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 64" role="img" aria-label="Changed pixels by frame"><polyline fill="none" stroke="#8B3F36" stroke-width="1.5" points="${points}"/></svg>`,
  };
}

/** Streams two greyscale frames at a time, rather than buffering a whole passage. */
export async function measureMotionEnergy(
  video: string,
  options: Partial<EnergyOptions> = {},
) {
  const { stdout } = await promisify(execFile)("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate",
    "-of",
    "json",
    video,
  ]);
  const stream = JSON.parse(stdout).streams[0] as {
    width: number;
    height: number;
    r_frame_rate: string;
  };
  const [numerator, denominator] = stream.r_frame_rate.split("/").map(Number);
  const width = options.width ?? stream.width,
    height = options.height ?? stream.height;
  const filter = [
    ...(width !== stream.width || height !== stream.height
      ? [`scale=${width}:${height}`]
      : []),
    "format=gray",
  ].join(",");
  const decoder = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      video,
      "-map",
      "0:v:0",
      "-vf",
      filter,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let error = "";
  decoder.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    error += chunk;
  });
  const done = once(decoder, "close");
  const frameSize = width * height;
  let pending = Buffer.alloc(0),
    previous: Uint8Array | undefined;
  const counts: number[] = [];
  for await (const chunk of decoder.stdout) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    while (pending.length >= frameSize) {
      const frame = pending.subarray(0, frameSize);
      counts.push(
        previous
          ? measureFrameEnergy(previous, frame, options.pixelThreshold ?? 4)
          : 0,
      );
      previous = frame;
      pending = pending.subarray(frameSize);
    }
  }
  const [code] = await done;
  if (code !== 0 || pending.length)
    throw new Error(`Motion decode failed: ${error || "partial frame"}`);
  return summarizeMotionEnergy(counts, {
    ...options,
    width,
    height,
    fps: options.fps ?? numerator! / denominator!,
  });
}

export function requireContinuousEnergy(
  report: ReturnType<typeof summarizeMotionEnergy>,
  label: string,
) {
  const failed = Object.entries(report.gates)
    .filter(([, gate]) => !gate.pass)
    .map(([id]) => id);
  if (failed.length)
    throw new Error(`${label} fails continuous motion: ${failed.join(", ")}`);
}
