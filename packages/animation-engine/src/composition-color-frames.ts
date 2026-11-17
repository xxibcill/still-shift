import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  CompositionMediaLimits,
  CompositionVisualMediaAsset,
} from "@still-shift/scene-contract";
import { probeCompositionVideo } from "./composition-media-probe.ts";
import type { CompositionVideoProbe } from "./composition-media-probe.ts";
import { prepareCompositionVisualMedia } from "./composition-media-cache.ts";
import { compositionMediaCacheDirectory } from "./composition-media-cache-storage.ts";
import { decodeCompositionRgbaPng } from "./composition-media-color.ts";

/**
 * CGA color measurement reads frames through the engine's own media path:
 * the same probe, color conversion and verified frame cache the renderer
 * uses, so statistics describe the pixels a composition will draw.
 */
export type ColorClip = {
  path: string;
  name: string;
  probe: CompositionVideoProbe;
  asset: CompositionVisualMediaAsset & { type: "video" };
};
export type ColorFrame = {
  ordinal: number;
  width: number;
  height: number;
  /** Straight encoded-sRGB RGBA8. */
  rgba: Uint8Array;
};
export type ColorFrameOptions = {
  cacheDirectory?: string | undefined;
  limits?: CompositionMediaLimits | undefined;
  signal?: AbortSignal | undefined;
};

export async function openColorClip(
  path: string,
  options: ColorFrameOptions = {},
): Promise<ColorClip> {
  const absolute = resolve(path);
  const probe = await probeCompositionVideo(absolute, {
    ...(options.limits ? { limits: options.limits } : {}),
    signal: options.signal,
  });
  return {
    path: absolute,
    name: basename(absolute),
    probe,
    asset: {
      id: "clip",
      type: "video",
      path: absolute,
      sha256: probe.sourceHash,
      width: probe.width,
      height: probe.height,
      frameCount: probe.frameCount,
      frameRate: probe.frameRate,
      color: probe.color,
    },
  };
}

/** Evenly spaced original ordinals (all frames when count ≥ frameCount). */
export function colorSampleOrdinals(frameCount: number, count: number) {
  if (count >= frameCount)
    return Array.from({ length: frameCount }, (_, i) => i);
  return Array.from({ length: count }, (_, i) =>
    Math.min(frameCount - 1, Math.floor(((i + 0.5) * frameCount) / count)),
  );
}

/** Prepare (or verify cached) frames and decode them, in ordinal order. */
export async function readColorFrames(
  clip: ColorClip,
  ordinals: readonly number[],
  options: ColorFrameOptions = {},
): Promise<ColorFrame[]> {
  const unique = [...new Set(ordinals)].sort((a, b) => a - b);
  const prepared = await prepareCompositionVisualMedia({
    asset: clip.asset,
    sourceDirectory: dirname(clip.path),
    cacheDirectory: compositionMediaCacheDirectory(options.cacheDirectory),
    ordinals: unique,
    ...(options.limits ? { limits: options.limits } : {}),
    signal: options.signal,
  });
  const byOrdinal = new Map(
    prepared.frames.map((frame) => [frame.ordinal, frame] as const),
  );
  const frames: ColorFrame[] = [];
  for (const ordinal of unique) {
    options.signal?.throwIfAborted();
    const frame = byOrdinal.get(ordinal)!;
    const decoded = decodeCompositionRgbaPng(
      await readFile(prepared.assetPaths[frame.id]!),
    );
    frames.push({ ordinal, ...decoded });
  }
  return frames;
}
