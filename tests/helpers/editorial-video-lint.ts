// ET2 helpers: video-backed pixel lint over the tracked synthetic clip and a
// deterministic long clip derived from it
// (docs/editorial-typography-improvement-plan.md#et2--pixel-lint-over-native-video).
//
// The long clip is never committed: it is regenerated into a caller-owned
// temporary directory by looping the tracked 4 s fixture clip with FFmpeg.
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { comp, text, video } from "@still-shift/motion";
import type {
  Composition,
  CompositionMediaLimits,
} from "@still-shift/scene-contract";
import { probeCompositionVideo } from "../../packages/animation-engine/src/composition-media-probe.ts";
import {
  clipAsset,
  fonts,
} from "../../benchmarks/fixtures/editorial-titles/shared.ts";

const run = promisify(execFile);

export const editorialFixture = (name: string) =>
  new URL(
    `../../benchmarks/fixtures/editorial-titles/${name}`,
    import.meta.url,
  );

export type LongClip = {
  path: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  sha256: string;
  bytes: number;
};

/**
 * Loop the tracked 24 fps fixture clip to `seconds` and scale it. The texture
 * drifts on every frame, so pixel lint must find no frozen run; the dark band
 * repeats every 4 s. Output bytes depend only on FFmpeg 8.0.1 and the inputs.
 */
export async function generateLongClip(
  directory: string,
  options: {
    width: number;
    height: number;
    seconds: number;
    /**
     * FFmpeg `noise` strength (fixed default seed, temporal + uniform). High
     * entropy keeps prepared PNG frames near raw size, so a short clip carries
     * a proof-sized payload (~5 MB per 1080×1920 frame at 48).
     */
    noise?: number;
  },
): Promise<LongClip> {
  const fps = 24,
    frameCount = options.seconds * fps,
    path = join(
      directory,
      `editorial-bands-${options.width}x${options.height}-${options.seconds}s${options.noise ? `-noise${options.noise}` : ""}.mp4`,
    );
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-stream_loop",
      String(Math.ceil(options.seconds / 4) - 1),
      "-i",
      clipAsset.path,
      "-vf",
      `scale=${options.width}:${options.height}:flags=bicubic,${options.noise ? `noise=alls=${options.noise}:allf=t+u,` : ""}format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited`,
      "-frames:v",
      String(frameCount),
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-preset",
      "veryfast",
      "-crf",
      options.noise ? "24" : "30",
      "-g",
      String(fps * 4),
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-color_range",
      "tv",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      "-an",
      "-y",
      path,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const probe = await probeCompositionVideo(path);
  if (probe.frameCount !== frameCount)
    throw new Error(
      `Long clip has ${probe.frameCount} frames, expected ${frameCount}`,
    );
  return {
    path,
    width: probe.width,
    height: probe.height,
    fps,
    frameCount,
    sha256: probe.sourceHash,
    bytes: probe.sourceBytes,
  };
}

/** Full-frame long clip under one measured label that holds for the whole clip. */
export async function longClipComposition(
  clip: LongClip,
  mediaLimits?: CompositionMediaLimits,
): Promise<Composition> {
  const probe = await probeCompositionVideo(clip.path);
  const asset = {
    id: "long-clip",
    type: "video" as const,
    path: clip.path,
    sha256: probe.sourceHash as `sha256:${string}`,
    width: probe.width,
    height: probe.height,
    frameCount: probe.frameCount,
    frameRate: probe.frameRate,
    color: probe.color as typeof clipAsset.color,
  };
  const size = Math.max(16, Math.round(clip.width / 27));
  const composition = comp(
    {
      width: clip.width,
      height: clip.height,
      fps: clip.fps,
      frames: clip.frameCount,
      assets: [fonts.mono, asset],
    },
    (c) => {
      c.textStyle("credit", { fontAsset: "mono", size, tracking: 200 });
      c.add(
        text("COURTYARD EDIT · 03", {
          id: "credit",
          style: "credit",
          fontSize: size,
          color: "#1E2716",
        })
          .at(Math.round(clip.width * 0.074), Math.round(clip.height * 0.17))
          .with({
            inPoint: 4,
            outPoint: clip.frameCount,
            anchor: "baseline",
            textRole: "label",
          }),
      );
      c.add(
        video("clip", asset, {
          size: [clip.width, clip.height],
          fit: "stretch",
        }),
      );
    },
  ) as Composition;
  return mediaLimits ? { ...composition, mediaLimits } : composition;
}

/** Temporary directories `lintCompositionFile` and the CLI may create. */
export async function lintTemporaryEntries(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter(
      (name) =>
        name.startsWith("composition-lint-vite-") ||
        name.startsWith("still-shift-compiled-"),
    )
    .sort();
}

/** Staging directories and the lock a media cache transaction owns. */
export async function mediaCacheTransientEntries(
  cacheDirectory: string,
): Promise<string[]> {
  const names = await readdir(cacheDirectory).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  return names
    .filter((name) => name.startsWith(".prepare-") || name === ".media.lock")
    .sort();
}
